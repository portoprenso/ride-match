import {
  GROUP_POLICY,
  GroupChangedEventSchema,
  JoinGroupResultSchema,
  LeaveGroupResultSchema,
  NearbyRemovedEventSchema,
  NearbyUpsertedEventSchema,
  RideChangedEventSchema,
  RideGroupSchema,
  type ApiErrorCode,
  type DomainEventDto,
  type GroupStatus,
  type JoinGroupInput,
  type JoinGroupResultDto,
  type MapViewport,
} from '@ride-match/contracts';

import type { AppDataSource } from '../src/data/AppDataSource';
import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { distanceMeters } from '../src/data/mock/geometry';
import { MEETING_POINT_DELAY_MS, replaceMeetingPoint, withdrawMeetingPoint } from '../src/data/mock/meetingPoints';
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
async function rider(
  simulator: Simulator<MockWorld>,
  n: number,
  options: { request?: boolean; origin?: { latitude: number; longitude: number } } = {},
): Promise<Rider> {
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
      origin: { source: 'manual', coordinates: options.origin ?? ORIGIN },
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

/** A group formed in the empty neighbourhood: rider 1's ride, joined by riders 2.. in order. */
async function formedGroup(simulator: Simulator<MockWorld>, size: number) {
  const riders = [await rider(simulator, 1)];
  let groupId = '';
  for (let n = 2; n <= size; n += 1) {
    const joiner = await rider(simulator, n);
    groupId = (await join(joiner, { kind: 'ride', id: riders[0]?.rideId ?? '' })).group.id;
    riders.push(joiner);
  }
  return { riders, groupId };
}

const leave = (who: Rider, groupId: string, id = nextOperationId()) =>
  settle(who.dataSource.groups.leave(groupId, { operationId: id }));
const readGroup = (who: Rider, groupId: string) => settle(who.dataSource.groups.getGroup(groupId));

describe('leaving a group', () => {
  it('removes the member at once, cancels their request and keeps the group forming for the rest', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 3);
    const [coordinator, second, third] = riders as [Rider, Rider, Rider];
    const events = recordEvents(simulator);

    const result = await leave(third, groupId);

    expect(LeaveGroupResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({ groupId, rideRequest: { id: third.rideId, status: 'cancelled', groupId } });
    await expect(readGroup(third, groupId)).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    const group = RideGroupSchema.parse(await readGroup(second, groupId));
    expect(group).toMatchObject({ status: 'forming', coordinatorId: coordinator.userId, version: 3 });
    expect(group.members.map((member) => member.user.id)).toEqual([coordinator.userId, second.userId]);

    expect(events.map((event) => event.type)).toEqual(['nearby.upserted', 'group.changed', 'ride.changed']);
    expect(events[0]).toMatchObject({ payload: { item: { id: groupId, memberCount: 2 } } });
    expect(GroupChangedEventSchema.parse(events[1]).payload).toEqual({ groupId, version: 3, reason: 'member_left' });
    expect(events[2]).toMatchObject({ audience: { userId: third.userId }, payload: { status: 'cancelled' } });
    // Nothing brings the request back, and the rider may publish a new one.
    await expect(settle(third.dataSource.rides.getOwnRequest())).resolves.toMatchObject({ status: 'cancelled' });
    await expect(
      settle(
        third.dataSource.rides.create({
          operationId: nextOperationId(),
          origin: { source: 'manual', coordinates: ORIGIN },
          destinationPlaceId: 'place_tsum',
          departureOffsetMinutes: 0,
        }),
      ),
    ).resolves.toMatchObject({ status: 'active' });
  });

  it('hands the coordinator role to the earliest remaining member', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 4);
    const [coordinator, second, third, fourth] = riders as [Rider, Rider, Rider, Rider];

    await leave(coordinator, groupId);

    const group = await readGroup(fourth, groupId);
    expect(group.coordinatorId).toBe(second.userId);
    expect(group.members.map((member) => member.user.id)).toEqual([second.userId, third.userId, fourth.userId]);
  });

  it('returns a ready group to forming, keeping its meeting point', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 3);
    const [, second, third] = riders as [Rider, Rider, Rider];
    // Marking ready arrives with GROUP-001-C; the test sets the state the source would reach.
    const record = simulator.state.groups.get(groupId);
    if (record === undefined) throw new Error('No group.');
    record.status = 'ready';
    record.meetingPoint = { id: 'meeting_test', label: 'Synthetic corner', coordinates: { ...ORIGIN } };

    await leave(third, groupId);

    expect(await readGroup(second, groupId)).toMatchObject({
      status: 'forming',
      meetingPoint: { id: 'meeting_test', label: 'Synthetic corner' },
    });
  });

  it('cancels a group left with one member, who keeps read access for an hour', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 2);
    const [coordinator, second] = riders as [Rider, Rider];
    const events = recordEvents(simulator);

    await leave(coordinator, groupId);

    const group = RideGroupSchema.parse(await readGroup(second, groupId));
    expect(group).toMatchObject({
      status: 'cancelled',
      coordinatorId: second.userId,
      closure: { reason: 'members_left' },
      version: 2,
    });
    expect(group.members.map((member) => member.user.id)).toEqual([second.userId]);
    expect(Date.parse(group.closure?.historyExpiresAt ?? '') - Date.parse(group.closure?.closedAt ?? '')).toBe(
      GROUP_POLICY.historyRetentionSeconds * SECOND,
    );
    await expect(settle(second.dataSource.rides.getOwnRequest())).resolves.toMatchObject({
      status: 'cancelled',
      groupId,
    });
    expect(events.map((event) => event.type)).toEqual([
      'nearby.removed',
      'group.changed',
      'ride.changed',
      'ride.changed',
    ]);
    expect(NearbyRemovedEventSchema.parse(events[0]).payload).toEqual({
      target: { kind: 'group', id: groupId },
      version: 2,
      reason: 'unavailable',
    });
    expect(events[1]).toMatchObject({ payload: { reason: 'cancelled' } });
    // The remaining member cannot leave a closed group.
    await expect(leave(second, groupId)).rejects.toEqual(sourceError('GROUP_CLOSED'));

    // The group's own deadline later finds it closed and changes nothing.
    for (let minute = 0; minute < 60; minute += 1) await jest.advanceTimersByTimeAsync(MINUTE);
    expect(simulator.state.groups.get(groupId)?.closure?.reason).toBe('members_left');
    // Tokens last 15 minutes, so the member signs in again on the same number.
    const again = await rider(simulator, 2, { request: false });
    await expect(readGroup(again, groupId)).rejects.toEqual(sourceError('HISTORY_EXPIRED'));
  });

  it('returns the original result for a repeated leave and refuses a new one', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 3);
    const third = riders[2] as Rider;
    const id = nextOperationId();
    const original = await leave(third, groupId, id);
    const events = recordEvents(simulator);

    await expect(leave(third, groupId, id)).resolves.toEqual(original);
    expect(events).toEqual([]);
    await expect(leave(third, groupId)).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    await expect(leave(third, 'group_other', id)).rejects.toEqual(sourceError('IDEMPOTENCY_CONFLICT'));
    expect(simulator.state.groups.get(groupId)?.members).toHaveLength(2);
  });

  it('recovers a leave whose answer was lost after it committed', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 3);
    const third = riders[2] as Rider;
    const id = nextOperationId();
    simulator.failNext({ kind: 'network', afterCommit: true }, 'groups.leave');

    await expect(leave(third, groupId, id)).rejects.toEqual(expect.objectContaining({ kind: 'network' }));
    await expect(leave(third, groupId, id)).resolves.toMatchObject({ rideRequest: { status: 'cancelled' } });
    expect(simulator.state.groups.get(groupId)?.members).toHaveLength(2);
  });

  it('answers non-members, unknown groups and anonymous callers without revealing the group', async () => {
    const simulator = world('empty-neighborhood');
    const { groupId } = await formedGroup(simulator, 2);
    const stranger = await rider(simulator, 9);

    await expect(leave(stranger, groupId)).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    await expect(readGroup(stranger, groupId)).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    await expect(readGroup(stranger, 'group_unknown')).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    const anonymous = createMockDataSource(simulator);
    await expect(settle(anonymous.groups.getGroup(groupId))).rejects.toEqual(sourceError('UNAUTHENTICATED'));
    await expect(settle(anonymous.groups.leave(groupId, { operationId: nextOperationId() }))).rejects.toEqual(
      sourceError('UNAUTHENTICATED'),
    );
  });
});

/** Gives a group a synthetic meeting point, as the source will (MEETING-001-A). */
function supplyMeetingPoint(simulator: Simulator<MockWorld>, groupId: string) {
  const record = simulator.state.groups.get(groupId);
  if (record === undefined) throw new Error('No group.');
  record.meetingPoint = { id: 'meeting_test', label: 'Synthetic corner', coordinates: { ...ORIGIN } };
  record.version += 1;
  return record;
}

const setStatus = (who: Rider, groupId: string, status: GroupStatus, expectedVersion: number, id = nextOperationId()) =>
  settle(who.dataSource.groups.updateStatus(groupId, { operationId: id, status, expectedVersion }));

describe('the coordinator’s status changes', () => {
  it('marks a group with a meeting point ready, which stops joins, and reopens it', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 2);
    const coordinator = riders[0] as Rider;
    const record = supplyMeetingPoint(simulator, groupId);
    const events = recordEvents(simulator);

    const ready = await setStatus(coordinator, groupId, 'ready', record.version);

    expect(RideGroupSchema.parse(ready)).toMatchObject({ status: 'ready', version: 3, closure: null });
    expect(events.map((event) => event.type)).toEqual(['nearby.upserted', 'group.changed']);
    expect(events[0]).toMatchObject({ payload: { item: { id: groupId, status: 'ready' } } });
    expect(GroupChangedEventSchema.parse(events[1]).payload).toEqual({ groupId, version: 3, reason: 'ready' });
    const late = await rider(simulator, 3);
    await expect(join(late, { kind: 'group', id: groupId })).rejects.toEqual(sourceError('GROUP_CLOSED'));

    const reopened = await setStatus(coordinator, groupId, 'forming', 3);
    expect(reopened).toMatchObject({ status: 'forming', version: 4, meetingPoint: { id: 'meeting_test' } });
    expect(events.at(-1)).toMatchObject({ payload: { reason: 'reopened', version: 4 } });
    await expect(join(late, { kind: 'group', id: groupId })).resolves.toMatchObject({ group: { version: 5 } });
  });

  it('refuses transitions the status does not allow, including ready without a meeting point', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 2);
    const coordinator = riders[0] as Rider;

    await expect(setStatus(coordinator, groupId, 'ready', 1)).rejects.toEqual(sourceError('INVALID_TRANSITION'));
    await expect(setStatus(coordinator, groupId, 'forming', 1)).rejects.toEqual(sourceError('INVALID_TRANSITION'));
    await expect(setStatus(coordinator, groupId, 'completed', 1)).rejects.toEqual(sourceError('INVALID_TRANSITION'));
    const record = supplyMeetingPoint(simulator, groupId);
    await setStatus(coordinator, groupId, 'ready', record.version);
    await expect(setStatus(coordinator, groupId, 'ready', 3)).rejects.toEqual(sourceError('INVALID_TRANSITION'));
    expect(record).toMatchObject({ status: 'ready', version: 3 });
  });

  it('checks role, closure and version in the contract’s order', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 3);
    const [coordinator, member] = riders as [Rider, Rider];
    const stranger = await rider(simulator, 9);

    await expect(setStatus(stranger, groupId, 'cancelled', 2)).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    await expect(setStatus(stranger, 'group_unknown', 'cancelled', 1)).rejects.toEqual(
      sourceError('MEMBERSHIP_REQUIRED'),
    );
    // A member who is not the coordinator is refused before the version is looked at.
    await expect(setStatus(member, groupId, 'cancelled', 1)).rejects.toEqual(sourceError('FORBIDDEN'));
    // A stale version is a conflict, even for a transition that is not allowed.
    await expect(setStatus(coordinator, groupId, 'completed', 1)).rejects.toEqual(sourceError('VERSION_CONFLICT'));

    await setStatus(coordinator, groupId, 'cancelled', 2);
    // Closed comes before the version.
    await expect(setStatus(coordinator, groupId, 'forming', 1)).rejects.toEqual(sourceError('GROUP_CLOSED'));
    await expect(setStatus(member, groupId, 'forming', 3)).rejects.toEqual(sourceError('FORBIDDEN'));
  });

  it('returns the original group for a repeated change and refuses a reused ID with another input', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 2);
    const coordinator = riders[0] as Rider;
    const record = supplyMeetingPoint(simulator, groupId);
    const id = nextOperationId();
    const original = await setStatus(coordinator, groupId, 'ready', record.version, id);
    const events = recordEvents(simulator);

    // The point made it version 2; the change answered version 3.
    await expect(setStatus(coordinator, groupId, 'ready', 3, id)).rejects.toEqual(sourceError('IDEMPOTENCY_CONFLICT'));
    await expect(setStatus(coordinator, groupId, 'ready', 2, id)).resolves.toEqual(original);
    expect(events).toEqual([]);
  });
});

describe('closing a group', () => {
  it('completes a ready group and its members’ requests, keeping the history for an hour', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 3);
    const [coordinator, member] = riders as [Rider, Rider];
    const record = supplyMeetingPoint(simulator, groupId);
    await setStatus(coordinator, groupId, 'ready', record.version);
    const events = recordEvents(simulator);

    // Formed (1), joined (2), given a point (3), ready (4).
    const completed = RideGroupSchema.parse(await setStatus(coordinator, groupId, 'completed', 4));

    expect(completed).toMatchObject({ status: 'completed', closure: { reason: 'completed' }, version: 5 });
    expect(completed.members).toHaveLength(3);
    expect(Date.parse(completed.closure?.historyExpiresAt ?? '') - Date.parse(completed.closure?.closedAt ?? '')).toBe(
      GROUP_POLICY.historyRetentionSeconds * SECOND,
    );
    for (const who of riders) {
      await expect(settle(who.dataSource.rides.getOwnRequest())).resolves.toMatchObject({
        status: 'completed',
        groupId,
      });
    }
    expect(events.map((event) => event.type)).toEqual([
      'nearby.removed',
      'group.changed',
      'ride.changed',
      'ride.changed',
      'ride.changed',
    ]);
    expect(events[0]).toMatchObject({ payload: { reason: 'unavailable' } });
    expect(events[1]).toMatchObject({ payload: { reason: 'completed' } });

    // Read-only: no leave, no change; every member at closure can still read it.
    await expect(leave(member, groupId)).rejects.toEqual(sourceError('GROUP_CLOSED'));
    await expect(readGroup(member, groupId)).resolves.toMatchObject({ status: 'completed' });
    for (let minute = 0; minute < 60; minute += 1) await jest.advanceTimersByTimeAsync(MINUTE);
    const again = await rider(simulator, 2, { request: false });
    await expect(readGroup(again, groupId)).rejects.toEqual(sourceError('HISTORY_EXPIRED'));
  });

  it('cancels a forming group with its members’ requests', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 2);
    const [coordinator, member] = riders as [Rider, Rider];

    const cancelled = await setStatus(coordinator, groupId, 'cancelled', 1);

    expect(cancelled).toMatchObject({ status: 'cancelled', closure: { reason: 'coordinator_cancelled' } });
    await expect(settle(member.dataSource.rides.getOwnRequest())).resolves.toMatchObject({ status: 'cancelled' });
    await expect(readGroup(member, groupId)).resolves.toMatchObject({ status: 'cancelled' });
    const nearby = await settle(member.dataSource.rides.getNearby({ viewport: CITY, limit: 100 }));
    expect(nearby.items.map((item) => item.id)).not.toContain(groupId);
  });

  it('expires a ready group at its deadline, dated at the deadline even after time in the background', async () => {
    const simulator = world('empty-neighborhood');
    const { riders, groupId } = await formedGroup(simulator, 2);
    const coordinator = riders[0] as Rider;
    const record = supplyMeetingPoint(simulator, groupId);
    await setStatus(coordinator, groupId, 'ready', record.version);

    // The app was in the background past the deadline; the task runs late.
    simulator.advanceTime(GROUP_POLICY.lifetimeSeconds * SECOND + 10 * MINUTE);
    await jest.advanceTimersByTimeAsync(0);

    expect(record).toMatchObject({ status: 'cancelled', closure: { reason: 'expired', closedAt: record.expiresAt } });
    expect(record.closure?.historyExpiresAt).toBe(record.expiresAt + GROUP_POLICY.historyRetentionSeconds * SECOND);
    expect(simulator.state.rides.get(coordinator.rideId)?.status).toBe('cancelled');
    // Only the source's deadline and the coordinator's changes close a group; time alone does nothing else.
    expect(record.version).toBe(4);
  });
});

/** A second synthetic pickup, about 1.5 km from the first, so the two members' walks differ. */
const FARTHER = { latitude: 42.8822, longitude: 74.6055 };

describe('meeting points', () => {
  it('suggests a curated place after the group forms, for its members only', async () => {
    const simulator = world('empty-neighborhood');
    const target = await rider(simulator, 1);
    const me = await rider(simulator, 2, { origin: FARTHER });
    const { group } = await join(me, { kind: 'ride', id: target.rideId });
    expect(group.meetingPoint).toBeNull();
    const events = recordEvents(simulator);

    await jest.advanceTimersByTimeAsync(MEETING_POINT_DELAY_MS);

    const read = RideGroupSchema.parse(await readGroup(me, group.id));
    expect(read.version).toBe(group.version + 1);
    expect(read.meetingPoint).toMatchObject({ label: expect.stringMatching(/ · main entrance$/) });
    // Never the group's own destination.
    expect(read.meetingPoint?.label.startsWith(read.destination.label)).toBe(false);
    expect(events.map((event) => event.type)).toEqual(['group.changed']);
    expect(GroupChangedEventSchema.parse(events[0])).toMatchObject({
      audience: { kind: 'group', groupId: group.id },
      payload: { reason: 'meeting_point_changed', version: read.version },
    });
    // The public preview never carries it.
    const preview = await settle(me.dataSource.groups.getPreview(group.id));
    expect(JSON.stringify(preview)).not.toContain(String(read.meetingPoint?.coordinates.latitude));
  });

  it('gives each member their own walking estimate without changing the group', async () => {
    const simulator = world('empty-neighborhood');
    const target = await rider(simulator, 1);
    const me = await rider(simulator, 2, { origin: FARTHER });
    const { group } = await join(me, { kind: 'ride', id: target.rideId });
    await jest.advanceTimersByTimeAsync(MEETING_POINT_DELAY_MS);

    const mine = await readGroup(me, group.id);
    const theirs = await readGroup(target, group.id);
    const point = mine.meetingPoint!;
    const minutes = (from: typeof ORIGIN) => Math.ceil(distanceMeters(from, point.coordinates) / 80);
    expect(mine.meetingPoint?.walkingMinutes).toBe(minutes(FARTHER));
    expect(theirs.meetingPoint?.walkingMinutes).toBe(minutes(ORIGIN));
    expect(mine.meetingPoint?.walkingMinutes).not.toBe(theirs.meetingPoint?.walkingMinutes);
    expect(theirs.version).toBe(mine.version);
    // The estimate never reveals the origin behind it.
    expect(JSON.stringify(mine)).not.toContain(String(FARTHER.latitude));
  });

  it('returns a ready group to forming when the point is replaced, under a new ID', async () => {
    const simulator = world('empty-neighborhood');
    const target = await rider(simulator, 1);
    const me = await rider(simulator, 2);
    const { group } = await join(me, { kind: 'ride', id: target.rideId });
    await jest.advanceTimersByTimeAsync(MEETING_POINT_DELAY_MS);
    const first = await readGroup(target, group.id);
    await setStatus(target, group.id, 'ready', first.version);
    const events = recordEvents(simulator);

    simulator.schedule(0, (context) => replaceMeetingPoint(context, group.id));
    await jest.advanceTimersByTimeAsync(0);

    const replaced = await readGroup(target, group.id);
    expect(replaced).toMatchObject({ status: 'forming', version: first.version + 2 });
    expect(replaced.meetingPoint?.id).not.toBe(first.meetingPoint?.id);
    expect(replaced.meetingPoint?.label).not.toBe(first.meetingPoint?.label);
    expect(events.map((event) => event.type)).toEqual(['nearby.upserted', 'group.changed']);
    expect(events[0]).toMatchObject({ payload: { item: { status: 'forming' } } });
    expect(JSON.stringify(events[0])).not.toContain(String(replaced.meetingPoint?.coordinates.latitude));
  });

  it('withdraws the point, which stops the group from being marked ready', async () => {
    const simulator = world('empty-neighborhood');
    const target = await rider(simulator, 1);
    const me = await rider(simulator, 2);
    const { group } = await join(me, { kind: 'ride', id: target.rideId });
    await jest.advanceTimersByTimeAsync(MEETING_POINT_DELAY_MS);

    simulator.schedule(0, (context) => withdrawMeetingPoint(context, group.id));
    await jest.advanceTimersByTimeAsync(0);

    const withdrawn = await readGroup(target, group.id);
    expect(withdrawn.meetingPoint).toBeNull();
    await expect(setStatus(target, group.id, 'ready', withdrawn.version)).rejects.toEqual(
      sourceError('INVALID_TRANSITION'),
    );
  });

  it('never changes a closed group’s point', async () => {
    const simulator = world('empty-neighborhood');
    const target = await rider(simulator, 1);
    const me = await rider(simulator, 2);
    const { group } = await join(me, { kind: 'ride', id: target.rideId });
    await setStatus(target, group.id, 'cancelled', 1);
    // The scheduled supply finds the group closed.
    await jest.advanceTimersByTimeAsync(MEETING_POINT_DELAY_MS);
    simulator.schedule(0, (context) => replaceMeetingPoint(context, group.id));
    await jest.advanceTimersByTimeAsync(0);

    expect(simulator.state.groups.get(group.id)).toMatchObject({ meetingPoint: null, version: 2 });
  });

  it('suggests a point for a seeded forming group without one, after activation', async () => {
    const simulator = world();
    const forming = seededGroup(simulator, 'forming');
    expect(forming.meetingPoint).toBeNull();

    await jest.advanceTimersByTimeAsync(MEETING_POINT_DELAY_MS);

    expect(forming.meetingPoint).toMatchObject({ label: expect.stringMatching(/ · main entrance$/) });
    // The ready group already had its point and keeps it.
    expect(seededGroup(simulator, 'ready').meetingPoint?.label).toBe('Tunguch, main bus stop');
  });
});
