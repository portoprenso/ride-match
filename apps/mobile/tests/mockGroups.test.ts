import {
  GROUP_POLICY,
  GroupChangedEventSchema,
  JoinGroupResultSchema,
  NearbyRemovedEventSchema,
  NearbyUpsertedEventSchema,
  RideChangedEventSchema,
  type ApiErrorCode,
  type DomainEventDto,
  type JoinGroupInput,
  type JoinGroupResultDto,
  type MapViewport,
} from '@ride-match/contracts';

import type { AppDataSource } from '../src/data/AppDataSource';
import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

const START = Date.parse('2026-11-01T09:00:00.000Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** A synthetic exact pickup point in the demo city, never shown publicly. */
const ORIGIN = { latitude: 42.8712, longitude: 74.5934 };
const CITY: MapViewport = {
  southWest: { latitude: 42.75, longitude: 74.4 },
  northEast: { latitude: 43.1, longitude: 74.8 },
};

let simulators: Simulator<MockWorld>[] = [];
let operations = 0;
/** A deterministic synthetic UUID for operation `n`, as `OperationIdSchema` requires. */
const operationId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const nextOperationId = () => operationId(++operations);

/** Scenario A (six solo rides, a forming group of three, a ready group of two), or another. */
function world(scenario: 'active-neighborhood' | 'empty-neighborhood' = 'active-neighborhood') {
  const simulator = createMockSimulator(scenario, { latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS } });
  simulators.push(simulator);
  return simulator;
}

type Rider = { dataSource: AppDataSource; userId: string; rideId: string };

/**
 * A rider signed in with their own token on the shared simulator, with an active request
 * created from a manual pickup (which does not age). Each phone number is synthetic, from
 * Ofcom's range for fiction.
 */
async function rider(simulator: Simulator<MockWorld>, n: number, options: { request?: boolean } = {}): Promise<Rider> {
  const session = { accessToken: null as string | null };
  const dataSource = createMockDataSource(simulator, { accessToken: () => session.accessToken });
  const phoneNumber = `+4477009001${String(n).padStart(2, '0')}`;
  const challenge = await settle(dataSource.auth.requestOtp({ phoneNumber }));
  const signedIn = await settle(dataSource.auth.verifyOtp({ challengeId: challenge.id, code: DEMO_OTP_CODE }));
  session.accessToken = signedIn.accessToken;
  if (options.request === false) return { dataSource, userId: signedIn.user.id, rideId: '' };
  const ride = await settle(
    dataSource.rides.create({
      operationId: nextOperationId(),
      origin: { source: 'manual', coordinates: ORIGIN },
      destinationPlaceId: 'place_tsum',
      departureOffsetMinutes: 5,
    }),
  );
  return { dataSource, userId: signedIn.user.id, rideId: ride.id };
}

function joinInput(who: Rider, target: JoinGroupInput['target'], id = nextOperationId()): JoinGroupInput {
  return { operationId: id, rideRequestId: who.rideId, target };
}

const join = (who: Rider, target: JoinGroupInput['target'], id?: string) =>
  settle(who.dataSource.groups.join(joinInput(who, target, id)));

/** Sends joins together, so they reach the source in the same simulated moment, and settles them all. */
async function joinTogether(calls: [Rider, JoinGroupInput['target']][]) {
  const pending = calls.map(([who, target]) => who.dataSource.groups.join(joinInput(who, target)));
  const outcomes = Promise.allSettled(pending);
  await jest.advanceTimersByTimeAsync(MOCK_LATENCY_MS);
  return outcomes;
}

const sourceError = (code: ApiErrorCode) =>
  expect.objectContaining({ kind: 'source', body: expect.objectContaining({ code }) });

/** Scenario A's seeds, found by rider name or group status. */
function soloRideOf(simulator: Simulator<MockWorld>, displayName: string) {
  const user = [...simulator.state.users.values()].find((candidate) => candidate.displayName === displayName);
  const ride = [...simulator.state.rides.values()].find((candidate) => candidate.userId === user?.id);
  if (ride === undefined) throw new Error(`No ride for ${displayName}.`);
  return ride;
}
function seededGroup(simulator: Simulator<MockWorld>, status: 'forming' | 'ready') {
  const group = [...simulator.state.groups.values()].find((candidate) => candidate.status === status);
  if (group === undefined) throw new Error(`No ${status} group.`);
  return group;
}

function recordEvents(simulator: Simulator<MockWorld>) {
  const events: DomainEventDto[] = [];
  simulator.subscribe((event) => events.push(event));
  return events;
}

const fulfilled = (outcomes: PromiseSettledResult<JoinGroupResultDto>[]) =>
  outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
const rejected = (outcomes: PromiseSettledResult<JoinGroupResultDto>[]) =>
  outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason as unknown] : []));

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  for (const simulator of simulators) simulator.dispose();
  simulators = [];
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('joining a solo ride', () => {
  it('forms a group of two coordinated by the target’s rider, with the target’s plan', async () => {
    const simulator = world();
    const aida = soloRideOf(simulator, 'Aida');
    const me = await rider(simulator, 1);

    const result = await join(me, { kind: 'ride', id: aida.id });

    expect(JoinGroupResultSchema.parse(result)).toEqual(result);
    const { group, rideRequest } = result;
    expect(group).toMatchObject({
      status: 'forming',
      coordinatorId: aida.userId,
      capacity: GROUP_POLICY.capacity,
      meetingPoint: null,
      closure: null,
      version: 1,
      destination: { id: aida.destinationPlaceId },
      departureAt: new Date(aida.departureAt).toISOString(),
    });
    expect(group.members.map((member) => member.rideRequestId)).toEqual([aida.id, me.rideId]);
    expect(Date.parse(group.expiresAt) - Date.parse(group.createdAt)).toBe(GROUP_POLICY.lifetimeSeconds * SECOND);
    expect(rideRequest).toMatchObject({ id: me.rideId, status: 'grouped', groupId: group.id, version: 2 });
    // The target's rider is grouped too, and members never see each other's exact origins.
    expect(simulator.state.rides.get(aida.id)).toMatchObject({ status: 'grouped', groupId: group.id });
    expect(JSON.stringify(group)).not.toContain(String(ORIGIN.latitude));
    await expect(settle(me.dataSource.rides.getOwnRequest())).resolves.toEqual(rideRequest);
  });

  it('shows the group in discovery instead of both rides, and tells each owner', async () => {
    const simulator = world();
    const aida = soloRideOf(simulator, 'Aida');
    const me = await rider(simulator, 1);
    const events = recordEvents(simulator);

    const { group } = await join(me, { kind: 'ride', id: aida.id });

    const removed = events.filter((event) => event.type === 'nearby.removed');
    expect(removed.map((event) => NearbyRemovedEventSchema.parse(event).payload)).toEqual([
      { target: { kind: 'ride', id: aida.id }, version: 2, reason: 'unavailable' },
      { target: { kind: 'ride', id: me.rideId }, version: 2, reason: 'unavailable' },
    ]);
    const upserted = events.filter((event) => event.type === 'nearby.upserted');
    expect(upserted.map((event) => NearbyUpsertedEventSchema.parse(event).payload.item)).toEqual([
      expect.objectContaining({ kind: 'group', id: group.id, memberCount: 2, status: 'forming' }),
    ]);
    const changed = events.filter((event) => event.type === 'ride.changed').map((e) => RideChangedEventSchema.parse(e));
    expect(changed.map((event) => [event.audience, event.payload.status])).toEqual([
      [{ kind: 'user', userId: aida.userId }, 'grouped'],
      [{ kind: 'user', userId: me.userId }, 'grouped'],
    ]);
    // Nothing public names a member or an origin.
    expect(JSON.stringify(events)).not.toContain(String(ORIGIN.latitude));

    const nearby = await settle(me.dataSource.rides.getNearby({ viewport: CITY, limit: 100 }));
    const ids = nearby.items.map((item) => item.id);
    expect(ids).not.toContain(aida.id);
    // The viewer's own group is left out of their discovery; a stranger sees it once.
    expect(ids).not.toContain(group.id);
    const stranger = await rider(simulator, 9, { request: false });
    const theirs = await settle(stranger.dataSource.rides.getNearby({ viewport: CITY, limit: 100 }));
    expect(theirs.items.filter((item) => item.id === group.id)).toHaveLength(1);
  });

  it('gives two first joins of one ride a single canonical group', async () => {
    const simulator = world();
    const aida = soloRideOf(simulator, 'Aida');
    const first = await rider(simulator, 1);
    const second = await rider(simulator, 2);

    const outcomes = await joinTogether([
      [first, { kind: 'ride', id: aida.id }],
      [second, { kind: 'ride', id: aida.id }],
    ]);

    const results = fulfilled(outcomes);
    expect(results).toHaveLength(2);
    expect(new Set(results.map((result) => result.group.id)).size).toBe(1);
    const groups = [...simulator.state.groups.values()].filter((group) =>
      group.members.some((member) => member.rideRequestId === aida.id),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.members.map((member) => member.rideRequestId)).toEqual([aida.id, first.rideId, second.rideId]);
    expect(groups[0]?.coordinatorId).toBe(aida.userId);
  });

  it('answers a join of an ended ride with TARGET_UNAVAILABLE and keeps the joiner’s request active', async () => {
    const simulator = world();
    // Bakyt's request reaches its deadline 20 seconds after activation.
    const bakyt = soloRideOf(simulator, 'Bakyt');
    const me = await rider(simulator, 1);
    await jest.advanceTimersByTimeAsync(20 * SECOND);

    await expect(join(me, { kind: 'ride', id: bakyt.id })).rejects.toEqual(sourceError('TARGET_UNAVAILABLE'));
    await expect(join(me, { kind: 'ride', id: 'ride_unknown' })).rejects.toEqual(sourceError('TARGET_UNAVAILABLE'));
    await expect(settle(me.dataSource.rides.getOwnRequest())).resolves.toMatchObject({ status: 'active', version: 1 });
  });
});

describe('joining a group', () => {
  it('adds the joiner as the last member, keeps the group forming and tells the members', async () => {
    const simulator = world();
    const forming = seededGroup(simulator, 'forming');
    const before = forming.version;
    const me = await rider(simulator, 1);
    const events = recordEvents(simulator);

    const { group, rideRequest } = await join(me, { kind: 'group', id: forming.id });

    expect(group).toMatchObject({ id: forming.id, status: 'forming', version: before + 1 });
    expect(group.members).toHaveLength(GROUP_POLICY.capacity);
    expect(group.members.at(-1)).toMatchObject({ rideRequestId: me.rideId, user: { id: me.userId } });
    expect(rideRequest).toMatchObject({ status: 'grouped', groupId: forming.id });
    const memberEvent = events.find((event) => event.type === 'group.changed');
    expect(GroupChangedEventSchema.parse(memberEvent)).toMatchObject({
      audience: { kind: 'group', groupId: forming.id },
      payload: { groupId: forming.id, version: before + 1, reason: 'member_joined' },
    });
    const upserted = events.find((event) => event.type === 'nearby.upserted');
    expect(upserted).toMatchObject({ payload: { item: { id: forming.id, memberCount: 4, status: 'forming' } } });
  });

  it('gives the last seat to one of two simultaneous joins; the other gets GROUP_FULL and keeps its request', async () => {
    const simulator = world();
    const forming = seededGroup(simulator, 'forming');
    const first = await rider(simulator, 1);
    const second = await rider(simulator, 2);

    const outcomes = await joinTogether([
      [first, { kind: 'group', id: forming.id }],
      [second, { kind: 'group', id: forming.id }],
    ]);

    expect(fulfilled(outcomes)).toHaveLength(1);
    expect(rejected(outcomes)).toEqual([sourceError('GROUP_FULL')]);
    expect(forming.members).toHaveLength(GROUP_POLICY.capacity);
    const loser = outcomes[0]?.status === 'rejected' ? first : second;
    await expect(settle(loser.dataSource.rides.getOwnRequest())).resolves.toMatchObject({
      status: 'active',
      groupId: null,
      version: 1,
    });
  });

  it('never seats a fifth member, whether the joiner names the group or one of its rides', async () => {
    const simulator = world();
    const forming = seededGroup(simulator, 'forming');
    await join(await rider(simulator, 1), { kind: 'group', id: forming.id });
    const late = await rider(simulator, 2);

    await expect(join(late, { kind: 'group', id: forming.id })).rejects.toEqual(sourceError('GROUP_FULL'));
    const memberRide = forming.members[0]?.rideRequestId ?? '';
    await expect(join(late, { kind: 'ride', id: memberRide })).rejects.toEqual(sourceError('GROUP_FULL'));
    expect(forming.members).toHaveLength(GROUP_POLICY.capacity);
  });

  it('resolves a ride that already joined a group to that group', async () => {
    const simulator = world();
    const aida = soloRideOf(simulator, 'Aida');
    const first = await rider(simulator, 1);
    const { group } = await join(first, { kind: 'ride', id: aida.id });
    const second = await rider(simulator, 2);

    const result = await join(second, { kind: 'ride', id: aida.id });

    expect(result.group).toMatchObject({ id: group.id, version: 2 });
    expect(result.group.members.map((member) => member.rideRequestId)).toEqual([aida.id, first.rideId, second.rideId]);
  });

  it('refuses a ready group with GROUP_CLOSED and an ended one with TARGET_UNAVAILABLE', async () => {
    const simulator = world();
    const ready = seededGroup(simulator, 'ready');
    const forming = seededGroup(simulator, 'forming');
    const me = await rider(simulator, 1);

    await expect(join(me, { kind: 'group', id: ready.id })).rejects.toEqual(sourceError('GROUP_CLOSED'));
    await expect(join(me, { kind: 'ride', id: ready.members[0]?.rideRequestId ?? '' })).rejects.toEqual(
      sourceError('GROUP_CLOSED'),
    );
    // Scenario A's forming group was created six minutes ago and closes at its 30-minute deadline.
    await jest.advanceTimersByTimeAsync(GROUP_POLICY.lifetimeSeconds * SECOND - 6 * MINUTE);
    expect(forming.status).toBe('cancelled');
    const later = await rider(simulator, 2);
    await expect(join(later, { kind: 'group', id: forming.id })).rejects.toEqual(sourceError('TARGET_UNAVAILABLE'));
    await expect(join(later, { kind: 'group', id: 'group_unknown' })).rejects.toEqual(
      sourceError('TARGET_UNAVAILABLE'),
    );
  });
});

describe('the joiner’s own request', () => {
  it('checks it in the contract’s order before the target', async () => {
    const simulator = world();
    const aida = soloRideOf(simulator, 'Aida');
    const ready = seededGroup(simulator, 'ready');
    const me = await rider(simulator, 1);
    const other = await rider(simulator, 2);

    // Another rider's request, or an unknown one, is not the caller's.
    await expect(join({ ...me, rideId: other.rideId }, { kind: 'group', id: ready.id })).rejects.toEqual(
      sourceError('FORBIDDEN'),
    );
    await expect(join({ ...me, rideId: 'ride_unknown' }, { kind: 'group', id: ready.id })).rejects.toEqual(
      sourceError('FORBIDDEN'),
    );
    // The caller's own ride as the target is an invalid input.
    await expect(join(me, { kind: 'ride', id: me.rideId })).rejects.toEqual(sourceError('VALIDATION_FAILED'));

    await join(me, { kind: 'ride', id: aida.id });
    // Grouped comes before the target's own state.
    await expect(join(me, { kind: 'group', id: ready.id })).rejects.toEqual(sourceError('ALREADY_IN_GROUP'));
  });

  it('refuses an expired request with RIDE_EXPIRED and a cancelled one with INVALID_TRANSITION', async () => {
    const simulator = world();
    const forming = seededGroup(simulator, 'forming');
    const expiring = await rider(simulator, 1);
    const cancelling = await rider(simulator, 2);
    await settle(
      cancelling.dataSource.rides.cancel(cancelling.rideId, { operationId: nextOperationId(), expectedVersion: 1 }),
    );

    await expect(join(cancelling, { kind: 'group', id: forming.id })).rejects.toEqual(
      sourceError('INVALID_TRANSITION'),
    );
    // The request's 15-minute window ends before the seeded group's 30-minute deadline.
    await jest.advanceTimersByTimeAsync(15 * MINUTE);
    // Tokens last 15 minutes too, so the rider signs in again on the same number.
    const again = await rider(simulator, 1, { request: false });
    await expect(join({ ...again, rideId: expiring.rideId }, { kind: 'group', id: forming.id })).rejects.toEqual(
      sourceError('RIDE_EXPIRED'),
    );
  });

  it('needs a signed-in caller', async () => {
    const simulator = world();
    const forming = seededGroup(simulator, 'forming');
    const anonymous = createMockDataSource(simulator);

    await expect(
      settle(
        anonymous.groups.join({
          operationId: nextOperationId(),
          rideRequestId: 'ride_1',
          target: { kind: 'group', id: forming.id },
        }),
      ),
    ).rejects.toEqual(sourceError('UNAUTHENTICATED'));
  });
});

describe('retrying a join', () => {
  it('returns the original result for the same operation ID, without joining twice', async () => {
    const simulator = world();
    const aida = soloRideOf(simulator, 'Aida');
    const me = await rider(simulator, 1);
    const id = nextOperationId();
    const original = await join(me, { kind: 'ride', id: aida.id }, id);
    const events = recordEvents(simulator);

    await expect(join(me, { kind: 'ride', id: aida.id }, id)).resolves.toEqual(original);
    expect(events).toEqual([]);
    expect(simulator.state.groups.get(original.group.id)?.members).toHaveLength(2);
    // The same ID with another target is a conflict, not a new join.
    const forming = seededGroup(simulator, 'forming');
    await expect(join(me, { kind: 'group', id: forming.id }, id)).rejects.toEqual(sourceError('IDEMPOTENCY_CONFLICT'));
  });

  it('recovers a join whose answer was lost after it committed', async () => {
    const simulator = world();
    const forming = seededGroup(simulator, 'forming');
    const me = await rider(simulator, 1);
    const id = nextOperationId();
    simulator.failNext({ kind: 'network', afterCommit: true }, 'groups.join');

    await expect(join(me, { kind: 'group', id: forming.id }, id)).rejects.toEqual(
      expect.objectContaining({ kind: 'network' }),
    );
    expect(forming.members).toHaveLength(GROUP_POLICY.capacity);

    const retried = await join(me, { kind: 'group', id: forming.id }, id);
    expect(retried.group.members).toHaveLength(GROUP_POLICY.capacity);
    expect(retried.rideRequest).toMatchObject({ status: 'grouped', groupId: forming.id });
  });
});

describe('a formed group’s deadline', () => {
  it('cancels the group and its members’ requests 30 minutes after it formed', async () => {
    const simulator = world('empty-neighborhood');
    const target = await rider(simulator, 1);
    const me = await rider(simulator, 2);
    const { group } = await join(me, { kind: 'ride', id: target.rideId });

    // Past the requests' own 15-minute windows, the group's deadline governs them.
    for (let minute = 0; minute < 29; minute += 1) await jest.advanceTimersByTimeAsync(MINUTE);
    expect(simulator.state.groups.get(group.id)?.status).toBe('forming');
    expect(simulator.state.rides.get(me.rideId)?.status).toBe('grouped');
    await jest.advanceTimersByTimeAsync(MINUTE);

    expect(simulator.state.groups.get(group.id)).toMatchObject({ status: 'cancelled', closure: { reason: 'expired' } });
    expect(simulator.state.rides.get(me.rideId)?.status).toBe('cancelled');
    expect(simulator.state.rides.get(target.rideId)?.status).toBe('cancelled');
  });
});
