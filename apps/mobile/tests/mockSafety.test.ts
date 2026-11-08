import {
  BlockListPageSchema,
  BlockUserResultSchema,
  ReportReceiptSchema,
  type ApiErrorCode,
  type DomainEventDto,
  type MapViewport,
  type PublicEventDto,
} from '@ride-match/contracts';

import type { AppDataSource } from '../src/data/AppDataSource';
import { DEMO_OTP_CODE, MOCK_DEMO_SIGN_IN } from '../src/data/mock/auth';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import type { MockScenarioKey } from '../src/data/mock/scenarios';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

const START = Date.parse('2026-11-01T09:00:00.000Z');
const HOUR = 60 * 60 * 1000;
/** A synthetic exact pickup point in the demo city, never shown publicly. */
const ORIGIN = { latitude: 42.8712, longitude: 74.5934 };
const CITY: MapViewport = {
  southWest: { latitude: 42.75, longitude: 74.4 },
  northEast: { latitude: 43.1, longitude: 74.8 },
};

let simulators: Simulator<MockWorld>[] = [];
let operations = 0;
/** A deterministic synthetic UUID for operation `n`, as `OperationIdSchema` requires. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const nextId = () => uuid(++operations);

function world(scenario: MockScenarioKey = 'empty-neighborhood') {
  const simulator = createMockSimulator(scenario, { latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS } });
  simulators.push(simulator);
  return simulator;
}

type Rider = { dataSource: AppDataSource; userId: string; rideId: string };

async function signIn(simulator: Simulator<MockWorld>, phoneNumber: string) {
  const session = { accessToken: null as string | null };
  const dataSource = createMockDataSource(simulator, { accessToken: () => session.accessToken });
  const challenge = await settle(dataSource.auth.requestOtp({ phoneNumber }));
  const signedIn = await settle(dataSource.auth.verifyOtp({ challengeId: challenge.id, code: DEMO_OTP_CODE }));
  session.accessToken = signedIn.accessToken;
  return { dataSource, userId: signedIn.user.id };
}

/** A rider signed in on the shared simulator with an active request; numbers from Ofcom's fiction range. */
async function rider(simulator: Simulator<MockWorld>, n: number, options: { request?: boolean } = {}): Promise<Rider> {
  const { dataSource, userId } = await signIn(simulator, `+4477009004${String(n).padStart(2, '0')}`);
  if (options.request === false) return { dataSource, userId, rideId: '' };
  const ride = await settle(
    dataSource.rides.create({
      operationId: nextId(),
      origin: { source: 'manual', coordinates: ORIGIN },
      destinationPlaceId: 'place_tsum',
      departureOffsetMinutes: 5,
    }),
  );
  return { dataSource, userId, rideId: ride.id };
}

const join = (who: Rider, target: { kind: 'ride' | 'group'; id: string }) =>
  settle(who.dataSource.groups.join({ operationId: nextId(), rideRequestId: who.rideId, target }));
const block = (who: Rider, userId: string, operationId = nextId()) =>
  settle(who.dataSource.safety.block(userId, { operationId }));
const nearbyIds = async (who: Rider) =>
  (await settle(who.dataSource.rides.getNearby({ viewport: CITY, limit: 100 }))).items.map((item) => item.id);

/** Three riders in one forming group: `a` coordinates, `b` joined a's ride, `c` joined the group. */
async function groupOfThree(simulator: Simulator<MockWorld>) {
  const a = await rider(simulator, 1);
  const b = await rider(simulator, 2);
  const c = await rider(simulator, 3);
  const groupId = (await join(b, { kind: 'ride', id: a.rideId })).group.id;
  await join(c, { kind: 'group', id: groupId });
  return { a, b, c, groupId };
}

const sourceError = (code: ApiErrorCode) =>
  expect.objectContaining({ kind: 'source', body: expect.objectContaining({ code }) });

function recordEvents(simulator: Simulator<MockWorld>) {
  const events: DomainEventDto[] = [];
  simulator.subscribe((event) => events.push(event));
  return events;
}

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  for (const simulator of simulators) simulator.dispose();
  simulators = [];
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('blocking', () => {
  it('blocks a rider who shares no group: listed, private, and filtered both ways', async () => {
    const simulator = world();
    const me = await rider(simulator, 1);
    const other = await rider(simulator, 2);
    const stranger = await rider(simulator, 3, { request: false });
    expect(await nearbyIds(me)).toContain(other.rideId);

    const result = BlockUserResultSchema.parse(await block(me, other.userId));

    expect(result).toEqual({
      blockedUser: {
        user: expect.objectContaining({ id: other.userId }),
        blockedAt: expect.stringMatching(/^2026-11-01T09:00:00\.\d{3}Z$/),
      },
      leftGroup: null,
    });
    expect(await nearbyIds(me)).not.toContain(other.rideId);
    expect(await nearbyIds(other)).not.toContain(me.rideId);
    // Nobody else's discovery changes.
    expect(await nearbyIds(stranger)).toEqual(expect.arrayContaining([me.rideId, other.rideId]));
    // Only the blocker sees the block.
    const mine = await settle(me.dataSource.safety.listBlocks({ limit: 10 }));
    expect(mine.blockedUsers.map((entry) => entry.user.id)).toEqual([other.userId]);
    expect((await settle(other.dataSource.safety.listBlocks({ limit: 10 }))).blockedUsers).toEqual([]);
  });

  it('blocks and leaves a shared group in one step; the others see an ordinary leave', async () => {
    const simulator = world();
    const { a, b, c, groupId } = await groupOfThree(simulator);
    const events = recordEvents(simulator);

    const result = await block(a, c.userId);

    expect(result.leftGroup).toEqual({
      groupId,
      rideRequest: expect.objectContaining({ id: a.rideId, status: 'cancelled', groupId }),
    });
    const group = simulator.state.groups.get(groupId)!;
    expect(group.members.map((member) => member.userId)).toEqual([b.userId, c.userId]);
    // The coordinator left, so the earliest remaining member took over.
    expect(group.coordinatorId).toBe(b.userId);
    expect(group.status).toBe('forming');
    await expect(settle(a.dataSource.groups.getGroup(groupId))).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    await expect(settle(a.dataSource.chat.getHistory(groupId, { limit: 10 }))).rejects.toEqual(
      sourceError('MEMBERSHIP_REQUIRED'),
    );

    const groupEvents = events.filter((event) => event.audience.kind === 'group');
    expect(groupEvents.map((event) => event.type === 'group.changed' && event.payload.reason)).toEqual(['member_left']);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'access.revoked',
        audience: { kind: 'user', userId: a.userId },
        payload: { groupId, version: group.version, reason: 'left' },
      }),
    );
    // Nothing anyone else receives mentions a block.
    expect(JSON.stringify(events)).not.toMatch(/block/i);
  });

  it('closes a group of two with members_left when the blocker leaves', async () => {
    const simulator = world();
    const a = await rider(simulator, 1);
    const b = await rider(simulator, 2);
    const groupId = (await join(b, { kind: 'ride', id: a.rideId })).group.id;

    await block(b, a.userId);

    const group = simulator.state.groups.get(groupId)!;
    expect(group.status).toBe('cancelled');
    expect(group.closure?.reason).toBe('members_left');
    // The one who remains keeps read-only access for the hour.
    await expect(settle(a.dataSource.groups.getGroup(groupId))).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('returns the original result for a retry, and an existing block for a new operation', async () => {
    const simulator = world();
    const { a, c, groupId } = await groupOfThree(simulator);
    const operationId = nextId();

    const first = await block(a, c.userId, operationId);
    const version = simulator.state.groups.get(groupId)!.version;
    const retry = await block(a, c.userId, operationId);

    expect(retry).toEqual(first);
    expect(simulator.state.groups.get(groupId)!.version).toBe(version);
    expect(simulator.state.blocks).toHaveLength(1);
    await expect(block(a, 'user_unknown', operationId)).rejects.toEqual(sourceError('IDEMPOTENCY_CONFLICT'));

    const again = await block(a, c.userId);
    expect(again).toEqual({ blockedUser: first.blockedUser, leftGroup: null });
  });

  it('refuses blocking oneself, an unknown rider, an anonymous caller, and invalid input', async () => {
    const simulator = world();
    const me = await rider(simulator, 1, { request: false });
    const anonymous = createMockDataSource(simulator);

    await expect(block(me, me.userId)).rejects.toEqual(sourceError('VALIDATION_FAILED'));
    await expect(block(me, 'user_unknown')).rejects.toEqual(sourceError('NOT_FOUND'));
    await expect(settle(me.dataSource.safety.block('not an id!', { operationId: nextId() }))).rejects.toEqual(
      sourceError('VALIDATION_FAILED'),
    );
    await expect(settle(anonymous.safety.block(me.userId, { operationId: nextId() }))).rejects.toEqual(
      sourceError('UNAUTHENTICATED'),
    );
    expect(simulator.state.blocks).toEqual([]);
  });

  it('stops joins both ways; only the blocker learns why', async () => {
    const simulator = world();
    const blocker = await rider(simulator, 1);
    const blocked = await rider(simulator, 2);
    await block(blocker, blocked.userId);

    await expect(join(blocker, { kind: 'ride', id: blocked.rideId })).rejects.toEqual(
      sourceError('BLOCKED_RELATIONSHIP'),
    );
    await expect(join(blocked, { kind: 'ride', id: blocker.rideId })).rejects.toEqual(
      sourceError('TARGET_UNAVAILABLE'),
    );

    // A group with the blocked rider in it is closed to the blocker too.
    const third = await rider(simulator, 3);
    const groupId = (await join(third, { kind: 'ride', id: blocked.rideId })).group.id;
    await expect(join(blocker, { kind: 'group', id: groupId })).rejects.toEqual(sourceError('BLOCKED_RELATIONSHIP'));
    expect(simulator.state.rides.get(blocker.rideId)?.status).toBe('active');
  });

  it('removes each rider’s plans from the other’s nearby updates, and from no one else’s', async () => {
    const simulator = world();
    const me = await rider(simulator, 1);
    const other = await rider(simulator, 2);
    const stranger = await rider(simulator, 3, { request: false });
    const subscribe = async (who: Rider) => {
      const events: PublicEventDto[] = [];
      await settle(who.dataSource.events.subscribe({ kind: 'nearby', viewport: CITY }, (event) => events.push(event)));
      return events;
    };
    const mine = await subscribe(me);
    const theirs = await subscribe(other);
    const strangers = await subscribe(stranger);

    await block(me, other.userId);

    const removed = (events: PublicEventDto[]) =>
      events.flatMap((event) => (event.type === 'nearby.removed' ? [event.payload.target.id] : []));
    expect(removed(mine)).toEqual([other.rideId]);
    expect(removed(theirs)).toEqual([me.rideId]);
    expect(removed(strangers)).toEqual([]);

    // Later changes to the other's plan stay hidden from the blocker.
    const fourth = await rider(simulator, 4);
    await join(fourth, { kind: 'ride', id: other.rideId });
    const upserted = (events: PublicEventDto[]) =>
      events.flatMap((event) => (event.type === 'nearby.upserted' ? [event.payload.item.id] : []));
    const groupId = simulator.state.rides.get(other.rideId)!.groupId!;
    expect(upserted(mine)).not.toContain(groupId);
    expect(upserted(strangers)).toContain(groupId);
  });

  it('leaves the blocked rider out of matches', async () => {
    const simulator = world();
    const me = await rider(simulator, 1);
    const other = await rider(simulator, 2);
    const set = simulator.state.ownerMatches;
    set.set(me.rideId, {
      version: 2,
      matches: [
        {
          target: { kind: 'ride', id: other.rideId },
          level: 'excellent',
          additionalMinutes: 0,
          expiresAt: START + HOUR,
        },
      ],
    });
    expect((await settle(me.dataSource.rides.getMatches(me.rideId))).matches).toHaveLength(1);

    await block(other, me.userId);

    expect((await settle(me.dataSource.rides.getMatches(me.rideId))).matches).toEqual([]);
  });
});

describe('unblocking and the block list', () => {
  it('unblocks without restoring the group or chat, and succeeds without a block', async () => {
    const simulator = world();
    const { a, c, groupId } = await groupOfThree(simulator);
    await block(a, c.userId);

    await expect(settle(a.dataSource.safety.unblock(c.userId))).resolves.toBeUndefined();
    await expect(settle(a.dataSource.safety.unblock(c.userId))).resolves.toBeUndefined();

    expect(simulator.state.blocks).toEqual([]);
    await expect(settle(a.dataSource.groups.getGroup(groupId))).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    // Discovery shows the group again: the block no longer hides it.
    expect(await nearbyIds(a)).toContain(groupId);
  });

  it('pages the blocks newest first and refuses a malformed cursor', async () => {
    const simulator = world();
    const me = await rider(simulator, 1, { request: false });
    const others = [];
    for (let n = 2; n <= 4; n += 1) others.push(await rider(simulator, n, { request: false }));
    for (const other of others) {
      await block(me, other.userId);
      jest.advanceTimersByTime(1000);
    }

    const first = BlockListPageSchema.parse(await settle(me.dataSource.safety.listBlocks({ limit: 2 })));
    expect(first.blockedUsers.map((entry) => entry.user.id)).toEqual([others[2]!.userId, others[1]!.userId]);
    const second = BlockListPageSchema.parse(
      await settle(me.dataSource.safety.listBlocks({ limit: 2, cursor: first.nextCursor! })),
    );
    expect(second).toEqual({
      blockedUsers: [expect.objectContaining({ user: expect.objectContaining({ id: others[0]!.userId }) })],
      nextCursor: null,
    });

    await expect(settle(me.dataSource.safety.listBlocks({ limit: 2, cursor: 'somewhere' }))).rejects.toEqual(
      sourceError('VALIDATION_FAILED'),
    );
  });
});

describe('reporting', () => {
  const report = (who: Rider, input: Record<string, unknown>, operationId = nextId()) =>
    settle(who.dataSource.safety.report({ operationId, reason: 'harassment', ...input } as never));

  it('returns a receipt that echoes nothing, once per operation, even after leaving', async () => {
    const simulator = world();
    const { a, b, c, groupId } = await groupOfThree(simulator);
    const events = recordEvents(simulator);
    const operationId = nextId();
    const input = {
      targetUserId: c.userId,
      details: 'Asked for my phone number.',
      context: { groupId, messageId: null },
    };

    const receipt = ReportReceiptSchema.parse(await report(a, input, operationId));
    expect(Object.keys(receipt).sort()).toEqual(['id', 'receivedAt']);
    expect(events).toEqual([]);

    await settle(a.dataSource.groups.leave(groupId, { operationId: nextId() }));
    await expect(report(a, input, operationId)).resolves.toEqual(receipt);
    expect(simulator.state.reports).toHaveLength(1);
    await expect(report(a, { ...input, reason: 'other' }, operationId)).rejects.toEqual(
      sourceError('IDEMPOTENCY_CONFLICT'),
    );
    // A new report from the group needs access to it now.
    await expect(report(a, input)).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    // Reporting does not block.
    expect(simulator.state.blocks).toEqual([]);
    void b;
  });

  it('checks the target and the context', async () => {
    const simulator = world();
    const { a, b, c, groupId } = await groupOfThree(simulator);
    const outsider = await rider(simulator, 5);
    const context = (messageId: string | null = null) => ({ groupId, messageId });
    const sent = await settle(b.dataSource.chat.send(groupId, { clientMessageId: nextId(), text: 'Hi all' }));

    await expect(report(a, { targetUserId: a.userId })).rejects.toEqual(sourceError('VALIDATION_FAILED'));
    await expect(report(a, { targetUserId: 'user_unknown' })).rejects.toEqual(sourceError('NOT_FOUND'));
    await expect(report(outsider, { targetUserId: b.userId, context: context() })).rejects.toEqual(
      sourceError('MEMBERSHIP_REQUIRED'),
    );
    await expect(report(a, { targetUserId: outsider.userId, context: context() })).rejects.toEqual(
      sourceError('VALIDATION_FAILED'),
    );
    await expect(report(a, { targetUserId: c.userId, context: context(sent.id) })).rejects.toEqual(
      sourceError('VALIDATION_FAILED'),
    );
    await expect(report(a, { targetUserId: b.userId, context: context(sent.id) })).resolves.toEqual(
      expect.objectContaining({ id: expect.any(String) }),
    );
    // Without a context, any known rider may be reported.
    await expect(report(a, { targetUserId: outsider.userId })).resolves.toEqual(
      expect.objectContaining({ id: expect.any(String) }),
    );
    // A former member may still be reported from the group.
    await settle(c.dataSource.groups.leave(groupId, { operationId: nextId() }));
    await expect(report(a, { targetUserId: c.userId, context: context() })).resolves.toEqual(
      expect.objectContaining({ id: expect.any(String) }),
    );
    await expect(report(a, { targetUserId: b.userId, copiedText: 'Hi all' })).rejects.toEqual(
      sourceError('VALIDATION_FAILED'),
    );
  });

  it('refuses a report from an expired history', async () => {
    const simulator = world();
    const a = await rider(simulator, 1);
    const b = await rider(simulator, 2);
    const groupId = (await join(b, { kind: 'ride', id: a.rideId })).group.id;
    await settle(b.dataSource.groups.leave(groupId, { operationId: nextId() }));
    // `a` keeps read-only access for an hour, then loses it.
    jest.advanceTimersByTime(HOUR + 1000);
    const fresh = await signIn(simulator, '+447700900401');

    await expect(
      settle(
        fresh.dataSource.safety.report({
          operationId: nextId(),
          targetUserId: b.userId,
          reason: 'other',
          context: { groupId, messageId: null },
        }),
      ),
    ).rejects.toEqual(sourceError('HISTORY_EXPIRED'));
  });
});

describe('scenario J', () => {
  it('lets the demo rider block Bolot and leave; the group carries on and Chinara stays visible', async () => {
    const simulator = world('safety');
    const { dataSource, userId } = await signIn(simulator, MOCK_DEMO_SIGN_IN.phoneNumber);
    const me: Rider = { dataSource, userId, rideId: '' };
    const users = [...simulator.state.users.values()];
    const bolot = users.find((user) => user.displayName === 'Bolot')!;
    const group = [...simulator.state.groups.values()][0]!;
    const message = simulator.state.messages.get(group.id)!.find((entry) => entry.senderId === bolot.id)!;

    await expect(
      settle(
        dataSource.safety.report({
          operationId: nextId(),
          targetUserId: bolot.id,
          reason: 'unsafe_behavior',
          context: { groupId: group.id, messageId: message.id },
        }),
      ),
    ).resolves.toEqual(expect.objectContaining({ id: expect.any(String) }));

    const result = await block(me, bolot.id);
    expect(result.leftGroup?.groupId).toBe(group.id);
    expect(simulator.state.groups.get(group.id)!.members).toHaveLength(2);
    expect(simulator.state.groups.get(group.id)!.status).toBe('forming');

    const visible = await nearbyIds(me);
    expect(visible).not.toContain(group.id);
    const chinara = [...simulator.state.rides.values()].find(
      (ride) => simulator.state.users.get(ride.userId)?.displayName === 'Chinara',
    )!;
    expect(visible).toContain(chinara.id);
  });
});
