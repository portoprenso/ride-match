import {
  NearbyRemovedEventSchema,
  NearbyUpsertedEventSchema,
  OwnRideRequestSchema,
  RIDE_POLICY,
  RideChangedEventSchema,
  RideMatchSetSchema,
  type ApiErrorCode,
  type CreateRideRequestInput,
  type DomainEventDto,
  type MapViewport,
} from '@ride-match/contracts';

import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import { distanceMeters } from '../src/data/mock/geometry';
import { publicAreaFor } from '../src/data/mock/rides';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

const START = Date.parse('2026-11-01T09:00:00.000Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
// Ofcom's range for fiction: synthetic numbers that reach no one.
const DEMO_NUMBER = '+447700900123';
const OTHER_DEMO_NUMBER = '+447700900456';

/** A synthetic exact pickup point in the demo city, never shown publicly. */
const ORIGIN = { latitude: 42.8712, longitude: 74.5934 };
const CITY: MapViewport = {
  southWest: { latitude: 42.75, longitude: 74.4 },
  northEast: { latitude: 43.1, longitude: 74.8 },
};

let simulators: Simulator<MockWorld>[] = [];

/** An empty neighbourhood, so the only request is the rider's own, and the token it sends. */
function source(scenario: 'empty-neighborhood' | 'match-appears' = 'empty-neighborhood') {
  const simulator = createMockSimulator(scenario, {
    latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS },
  });
  simulators.push(simulator);
  const session = { accessToken: null as string | null };
  const dataSource = createMockDataSource(simulator, { accessToken: () => session.accessToken });
  return { simulator, dataSource, session };
}
type Source = ReturnType<typeof source>;

const sourceError = (code: ApiErrorCode) =>
  expect.objectContaining({ kind: 'source', body: expect.objectContaining({ code }) });

async function signIn(mock: Source, phoneNumber = DEMO_NUMBER) {
  const challenge = await settle(mock.dataSource.auth.requestOtp({ phoneNumber }));
  const session = await settle(mock.dataSource.auth.verifyOtp({ challengeId: challenge.id, code: DEMO_OTP_CODE }));
  mock.session.accessToken = session.accessToken;
  return session;
}

let operations = 0;
/** A deterministic synthetic UUID for operation `n`, as `OperationIdSchema` requires. */
const operationId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** A create input with a fresh device fix and a new operation ID, unless overridden. */
function createInput(overrides: Partial<CreateRideRequestInput> = {}): CreateRideRequestInput {
  operations += 1;
  return {
    operationId: operationId(operations),
    origin: {
      source: 'device',
      coordinates: ORIGIN,
      accuracyMeters: 20,
      capturedAt: new Date(Date.now()).toISOString(),
    },
    destinationPlaceId: 'place_asia_mall',
    departureOffsetMinutes: 5,
    ...overrides,
  };
}

const create = (mock: Source, input = createInput()) => settle(mock.dataSource.rides.create(input));
const cancel = (mock: Source, rideId: string, expectedVersion: number, id = operationId(++operations)) =>
  settle(mock.dataSource.rides.cancel(rideId, { operationId: id, expectedVersion }));
const readCity = (mock: Source) => settle(mock.dataSource.rides.getNearby({ viewport: CITY, limit: 100 }));

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

describe('creating a ride request', () => {
  it('publishes an active request with the chosen departure and the source’s 15-minute lifetime', async () => {
    const mock = source();
    const { user } = await signIn(mock);
    const created = await create(mock);

    expect(OwnRideRequestSchema.parse(created)).toEqual(created);
    expect(created).toMatchObject({
      status: 'active',
      groupId: null,
      version: 1,
      user,
      origin: { coordinates: ORIGIN },
    });
    const createdAt = Date.parse(created.expiresAt) - RIDE_POLICY.activeLifetimeSeconds * SECOND;
    expect(Date.parse(created.departureAt) - createdAt).toBe(5 * MINUTE);
    // The public area holds the origin without being it.
    expect(distanceMeters(created.publicOrigin.center, ORIGIN)).toBeLessThan(created.publicOrigin.radiusMeters);
    expect(created.publicOrigin.center).not.toEqual(ORIGIN);

    await expect(settle(mock.dataSource.rides.getOwnRequest())).resolves.toEqual(created);
    await expect(settle(mock.dataSource.auth.getCurrentUser())).resolves.toMatchObject({ rideRequestId: created.id });
    const publicView = await settle(mock.dataSource.rides.getRide(created.id));
    expect(publicView).not.toHaveProperty('origin');
    expect(publicView).not.toHaveProperty('status');
  });

  it('announces it to discovery without the origin, and to its owner only', async () => {
    const mock = source();
    await signIn(mock);
    const events = recordEvents(mock.simulator);
    const created = await create(mock);

    const [upserted, changed] = events;
    expect(NearbyUpsertedEventSchema.parse(upserted)).toEqual(upserted);
    expect(JSON.stringify(upserted)).not.toContain(String(ORIGIN.latitude));
    expect(RideChangedEventSchema.parse(changed)).toMatchObject({
      audience: { kind: 'user', userId: created.user.id },
      payload: { rideRequestId: created.id, status: 'active', version: 1 },
    });
  });

  it('accepts a confirmed manual point however old the confirmation, and refuses a stale device fix', async () => {
    const mock = source();
    await signIn(mock);
    const stale = createInput({
      origin: {
        source: 'device',
        coordinates: ORIGIN,
        accuracyMeters: 20,
        capturedAt: new Date(Date.now() - 2 * MINUTE).toISOString(),
      },
    });

    await expect(create(mock, stale)).rejects.toEqual(sourceError('LOCATION_STALE'));
    await expect(
      create(mock, createInput({ origin: { source: 'manual', coordinates: ORIGIN } })),
    ).resolves.toMatchObject({
      origin: { source: 'manual' },
    });
  });

  it('refuses an anonymous caller, an unknown place, and a pickup outside the demo city', async () => {
    const mock = source();
    await expect(create(mock)).rejects.toEqual(sourceError('UNAUTHENTICATED'));
    await signIn(mock);

    await expect(create(mock, createInput({ destinationPlaceId: 'place_nowhere' }))).rejects.toEqual(
      sourceError('VALIDATION_FAILED'),
    );
    await expect(
      create(mock, createInput({ origin: { source: 'manual', coordinates: { latitude: 41, longitude: 70 } } })),
    ).rejects.toEqual(sourceError('UNSUPPORTED_AREA'));
  });

  it('allows one live request, and returns the original for a retry with the same operation ID', async () => {
    const mock = source();
    await signIn(mock);
    const input = createInput();
    const events = recordEvents(mock.simulator);
    const created = await create(mock, input);

    // A lost acknowledgement, retried: the same request, no second record or event.
    await expect(create(mock, input)).resolves.toEqual(created);
    expect(events).toHaveLength(2);
    // The same ID with a changed input is a conflict; a new ID meets the one-live-request rule.
    await expect(create(mock, { ...input, departureOffsetMinutes: 10 })).rejects.toEqual(
      sourceError('IDEMPOTENCY_CONFLICT'),
    );
    await expect(create(mock)).rejects.toEqual(sourceError('ACTIVE_REQUEST_EXISTS'));
    expect([...mock.simulator.state.rides.values()]).toHaveLength(1);
  });

  it('leaves the rider’s own request out of their discovery, not anyone else’s', async () => {
    const mock = source();
    await signIn(mock);
    const created = await create(mock);

    expect((await readCity(mock)).items).toEqual([]);
    mock.session.accessToken = null;
    expect((await readCity(mock)).items).toEqual([expect.objectContaining({ kind: 'ride', id: created.id })]);
  });

  it('does not send the owner’s nearby subscription their own request, but sends their user subscription its change', async () => {
    const mock = source();
    await signIn(mock);
    const nearby: unknown[] = [];
    const user: unknown[] = [];
    await settle(mock.dataSource.events.subscribe({ kind: 'nearby', viewport: CITY }, (event) => nearby.push(event)));
    await settle(mock.dataSource.events.subscribe({ kind: 'user' }, (event) => user.push(event)));

    await create(mock);

    expect(nearby).toEqual([]);
    expect(user).toEqual([expect.objectContaining({ type: 'ride.changed' })]);
  });
});

describe('cancelling and expiry', () => {
  const ONCE = operationId(9_999);
  it('cancels an active request once, removing it from discovery', async () => {
    const mock = source();
    await signIn(mock);
    const created = await create(mock);
    const events = recordEvents(mock.simulator);

    const cancelled = await cancel(mock, created.id, 1, ONCE);
    expect(cancelled).toMatchObject({ status: 'cancelled', version: 2 });
    expect(NearbyRemovedEventSchema.parse(events[0])).toMatchObject({ payload: { reason: 'unavailable', version: 2 } });
    await expect(cancel(mock, created.id, 1, ONCE)).resolves.toEqual(cancelled);
    await expect(cancel(mock, created.id, 2)).rejects.toEqual(sourceError('INVALID_TRANSITION'));
    await expect(settle(mock.dataSource.rides.getRide(created.id))).rejects.toEqual(sourceError('TARGET_UNAVAILABLE'));
    await expect(settle(mock.dataSource.rides.getOwnRequest())).resolves.toEqual(cancelled);

    // A cancelled request no longer counts: a new one may be created.
    await expect(create(mock)).resolves.toMatchObject({ status: 'active' });
  });

  it('checks the state before the version, and refuses another rider’s request', async () => {
    const mock = source();
    await signIn(mock);
    const created = await create(mock);

    await expect(cancel(mock, created.id, 7)).rejects.toEqual(sourceError('VERSION_CONFLICT'));
    // GROUP-001 will group requests; until then the test groups one in the world.
    const record = mock.simulator.state.rides.get(created.id)!;
    record.status = 'grouped';
    record.groupId = 'group_test';
    await expect(cancel(mock, created.id, 7)).rejects.toEqual(sourceError('USE_LEAVE_GROUP'));
    record.status = 'active';
    record.groupId = null;

    await signIn(mock, OTHER_DEMO_NUMBER);
    await expect(cancel(mock, created.id, 1)).rejects.toEqual(sourceError('FORBIDDEN'));
    await expect(cancel(mock, 'ride_unknown', 1)).rejects.toEqual(sourceError('NOT_FOUND'));
  });

  it('expires at its deadline, after which cancelling says so and a new request can start', async () => {
    const mock = source();
    await signIn(mock);
    const created = await create(mock);

    mock.simulator.advanceTime(RIDE_POLICY.activeLifetimeSeconds * SECOND);
    // The access token outlived its own lifetime meanwhile; the same demo rider signs in again.
    await signIn(mock);

    await expect(settle(mock.dataSource.rides.getOwnRequest())).resolves.toMatchObject({
      id: created.id,
      status: 'expired',
      version: 2,
    });
    await expect(cancel(mock, created.id, 2)).rejects.toEqual(sourceError('RIDE_EXPIRED'));
    // The source's clock now runs ahead of the device's, so a device fix would read as old; a
    // confirmed point does not age.
    await expect(
      create(mock, createInput({ origin: { source: 'manual', coordinates: ORIGIN } })),
    ).resolves.toMatchObject({
      status: 'active',
    });
    mock.session.accessToken = null;
    expect((await readCity(mock)).items).toEqual([
      expect.objectContaining({ id: expect.not.stringMatching(created.id) }),
    ]);
  });

  it('answers null before any request', async () => {
    const mock = source();
    await signIn(mock);
    await expect(settle(mock.dataSource.rides.getOwnRequest())).resolves.toBeNull();
  });
});

describe('publicAreaFor', () => {
  it('covers its grid cell, so any origin in the cell lies inside, never at a precise point', () => {
    for (const origin of [
      ORIGIN,
      { latitude: 42.87001, longitude: 74.59999 },
      { latitude: 42.87999, longitude: 74.59001 },
    ]) {
      const area = publicAreaFor(origin);
      expect(area.center).toEqual({ latitude: 42.875, longitude: 74.595 });
      expect(distanceMeters(area.center, origin)).toBeLessThan(area.radiusMeters);
    }
  });
});

describe('supplied matches of the own request (scenario C)', () => {
  it('supplies one excellent match five seconds after creation, then drops it when it expires', async () => {
    const mock = source('match-appears');
    await signIn(mock);
    const events = recordEvents(mock.simulator);
    const created = await create(mock);
    const read = () => settle(mock.dataSource.rides.getMatches(created.id));

    await expect(read()).resolves.toEqual({ version: 1, matches: [] });
    mock.simulator.advanceTime(5 * SECOND);
    const set = await read();
    expect(RideMatchSetSchema.parse(set)).toEqual(set);
    expect(set).toMatchObject({
      version: 2,
      matches: [{ level: 'excellent', additionalMinutes: 2, target: { kind: 'ride' } }],
    });
    const aida = await settle(mock.dataSource.rides.getRide(set.matches[0]!.target.id));
    expect(aida.user.displayName).toBe('Aida');
    expect(events.filter((event) => event.type === 'matches.changed')).toEqual([
      expect.objectContaining({
        audience: { kind: 'user', userId: created.user.id },
        payload: { rideRequestId: created.id, version: 2 },
      }),
    ]);

    mock.simulator.advanceTime(3 * MINUTE);
    await signIn(mock);
    await expect(read()).resolves.toEqual({ version: 3, matches: [] });
  });

  it('has no matches once the request is cancelled, and none for another rider to read', async () => {
    const mock = source('match-appears');
    await signIn(mock);
    const created = await create(mock);
    mock.simulator.advanceTime(5 * SECOND);
    await cancel(mock, created.id, 1);

    await expect(settle(mock.dataSource.rides.getMatches(created.id))).resolves.toMatchObject({ matches: [] });
    await signIn(mock, OTHER_DEMO_NUMBER);
    await expect(settle(mock.dataSource.rides.getMatches(created.id))).rejects.toEqual(sourceError('FORBIDDEN'));
  });

  it('a lost acknowledgement leaves one request, which the retry returns', async () => {
    const mock = source();
    await signIn(mock);
    const input = createInput();
    mock.simulator.failNext({ kind: 'network', afterCommit: true }, 'rides.create');

    await expect(create(mock, input)).rejects.toMatchObject({ kind: 'network' });
    const current = await settle(mock.dataSource.rides.getOwnRequest());
    expect(current).toMatchObject({ status: 'active' });
    await expect(create(mock, input)).resolves.toEqual(current);
    expect([...mock.simulator.state.rides.values()]).toHaveLength(1);
  });
});
