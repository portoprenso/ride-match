import {
  DomainEventSchema,
  GroupPreviewSchema,
  NearbySnapshotSchema,
  PlaceSearchResultsSchema,
  PublicEventSchema,
  RideRequestSchema,
  type ApiErrorCode,
  type CoordinatesDto,
  type DomainEventDto,
  type MapViewport,
  type PublicEventDto,
  type SearchPlacesInput,
} from '@ride-match/contracts';

import type { AppDataSource } from '../src/data/AppDataSource';
import { DataSourceUnavailableError } from '../src/data/errors';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import { distanceMeters } from '../src/data/mock/geometry';
import { isMockScenarioKey, MOCK_SCENARIO_KEYS, type MockScenarioKey } from '../src/data/mock/scenarios';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

const START = Date.parse('2026-11-01T09:00:00.000Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const LATENCY_MS = MOCK_LATENCY_MS;

/** The whole covered city, within the 0.5° span limit. */
const CITY: MapViewport = { southWest: { latitude: 42.75, longitude: 74.4 }, northEast: { latitude: 43.1, longitude: 74.8 } };
/** Around the Tunguch district only, which holds the ready group's public area and nothing else. */
const TUNGUCH: MapViewport = { southWest: { latitude: 42.84, longitude: 74.65 }, northEast: { latitude: 42.86, longitude: 74.67 } };
const OUTSIDE: MapViewport = { southWest: { latitude: 41, longitude: 70 }, northEast: { latitude: 41.1, longitude: 70.1 } };

let simulators: Simulator<MockWorld>[] = [];
function source(scenario: MockScenarioKey = 'active-neighborhood') {
  const simulator = createMockSimulator(scenario, { latencyMs: { min: LATENCY_MS, max: LATENCY_MS } });
  simulators.push(simulator);
  return { simulator, dataSource: createMockDataSource(simulator) };
}


const sourceError = (code: ApiErrorCode) => expect.objectContaining({ kind: 'source', body: expect.objectContaining({ code }) });

const readCity = (dataSource: AppDataSource, limit = 100) => settle(dataSource.rides.getNearby({ viewport: CITY, limit }));

const searchCity = (dataSource: AppDataSource, input: Partial<SearchPlacesInput>) =>
  settle(
    dataSource.places.search({ area: { center: { latitude: 42.87, longitude: 74.6 }, radiusMeters: 50_000 }, limit: 20, ...input }),
  );

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

/** Every `{ latitude, longitude }` pair anywhere inside a value. */
function coordinatesIn(value: unknown, found: CoordinatesDto[] = []): CoordinatesDto[] {
  if (Array.isArray(value)) {
    for (const entry of value) coordinatesIn(entry, found);
  } else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.latitude === 'number' && typeof record.longitude === 'number') {
      found.push({ latitude: record.latitude, longitude: record.longitude });
    }
    for (const entry of Object.values(record)) coordinatesIn(entry, found);
  }
  return found;
}

/** Fails if `output` contains any exact origin or meeting point of the world. */
function expectNoPrivatePoints(world: MockWorld, output: unknown) {
  const points = coordinatesIn(output);
  const privatePoints = [
    ...[...world.rides.values()].map((ride) => ride.origin.coordinates),
    ...[...world.groups.values()].flatMap((group) => (group.meetingPoint === null ? [] : [group.meetingPoint.coordinates])),
  ];
  expect(privatePoints.length).toBeGreaterThan(0);
  for (const point of privatePoints) expect(points).not.toContainEqual(point);
}

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

describe('scenarios', () => {
  it('knows only the implemented scenario keys', () => {
    expect(MOCK_SCENARIO_KEYS).toEqual(['active-neighborhood', 'empty-neighborhood', 'match-appears', 'map-density']);
    expect(isMockScenarioKey('empty-neighborhood')).toBe(true);
    expect(isMockScenarioKey('group-formation')).toBe(false);
    expect(isMockScenarioKey('toString')).toBe(false);
  });

  it('seeds map-density with a hundred items, each group counted once, and truncates past the limit', async () => {
    const { simulator, dataSource } = source('map-density');
    const snapshot = await readCity(dataSource);

    expect(NearbySnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.items).toHaveLength(100);
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.items.filter((item) => item.kind === 'ride')).toHaveLength(75);
    expect(snapshot.items.filter((item) => item.kind === 'group')).toHaveLength(25);
    // 75 solo requests plus two grouped requests per group, which appear only as their group.
    expect(simulator.state.rides.size).toBe(125);
    // Every item lies inside the demo city's opening view.
    for (const item of snapshot.items) {
      expect(item.publicOrigin.center.latitude).toBeGreaterThan(42.81);
      expect(item.publicOrigin.center.latitude).toBeLessThan(42.93);
    }
    const limited = await readCity(dataSource, 40);
    expect(limited.items).toHaveLength(40);
    expect(limited.truncated).toBe(true);
  });

  it('seeds active-neighborhood with six solo rides and two groups, showing each rider once', async () => {
    const { simulator, dataSource } = source();
    const snapshot = await readCity(dataSource);

    expect(NearbySnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.previews).toEqual([]);
    const rides = snapshot.items.filter((item) => item.kind === 'ride');
    const groups = snapshot.items.filter((item) => item.kind === 'group');
    expect(rides).toHaveLength(6);
    expect(groups.map((group) => [group.status, group.memberCount])).toEqual(
      expect.arrayContaining([
        ['forming', 3],
        ['ready', 2],
      ]),
    );
    expect(groups).toHaveLength(2);

    // A grouped rider appears only through their group: no ride item for their request or for them.
    const grouped = [...simulator.state.rides.values()].filter((ride) => ride.status === 'grouped');
    expect(grouped).toHaveLength(5);
    const riderIds = rides.map((ride) => ride.user.id);
    expect(new Set(riderIds).size).toBe(6);
    for (const ride of grouped) {
      expect(ids(rides)).not.toContain(ride.id);
      expect(riderIds).not.toContain(ride.userId);
    }
  });

  it('keeps the seeded world consistent', () => {
    const world = source().simulator.state;
    const rides = [...world.rides.values()];

    for (const user of world.users.values()) {
      const live = rides.filter((ride) => ride.userId === user.id && (ride.status === 'active' || ride.status === 'grouped'));
      expect(live).toHaveLength(1);
    }
    for (const group of world.groups.values()) {
      expect(group.members.map((member) => member.userId)).toContain(group.coordinatorId);
      expect(group.departureAt).toBeLessThan(group.expiresAt);
      expect(group.meetingPoint !== null || group.status === 'forming').toBe(true);
      for (const member of group.members) {
        expect(member.joinedAt).toBeGreaterThanOrEqual(group.createdAt);
        expect(world.rides.get(member.rideRequestId)).toMatchObject({ userId: member.userId, status: 'grouped', groupId: group.id });
      }
    }
    for (const ride of rides) expect(ride.departureAt).toBeLessThan(ride.expiresAt);
  });

  it('places each exact origin inside its public area, but never at its center', () => {
    const world = source().simulator.state;

    for (const ride of world.rides.values()) {
      const offset = distanceMeters(ride.origin.coordinates, ride.publicOrigin.center);
      expect(offset).toBeGreaterThan(50);
      expect(offset).toBeLessThan(ride.publicOrigin.radiusMeters);
    }
  });

  it('seeds empty-neighborhood with no activity, and nothing appears later', async () => {
    const { simulator, dataSource } = source('empty-neighborhood');
    const events = recordEvents(simulator);

    await expect(readCity(dataSource)).resolves.toEqual({ items: [], truncated: false, previews: [] });
    await jest.advanceTimersByTimeAsync(30 * MINUTE);
    expect(events).toEqual([]);
    expect(simulator.stats().scheduledTasks).toBe(0);
    expect((await searchCity(dataSource, { query: 'asia' })).map((place) => place.id)).toEqual(['place_asia_mall']);
  });
});

describe('places.search', () => {
  it('lists the places inside the area, nearest its center first, without a query', async () => {
    const { dataSource } = source();
    const places = await settle(
      dataSource.places.search({ area: { center: { latitude: 42.88, longitude: 74.6 }, radiusMeters: 1_000 }, limit: 20 }),
    );

    expect(PlaceSearchResultsSchema.safeParse(places).success).toBe(true);
    expect(ids(places)).toEqual(['place_ala_too', 'place_philharmonic', 'place_bishkek_park']);
  });

  it('ranks matches by relevance before distance, ignoring case, up to the limit', async () => {
    const { dataSource } = source();

    // A label that starts with the text, then a word that does, then a detail that contains it.
    expect(ids(await searchCity(dataSource, { query: 'MA' }))).toEqual([
      'place_manas_airport',
      'place_asia_mall',
      'place_osh_bazaar',
      'place_dordoi_bazaar',
    ]);
    expect(ids(await searchCity(dataSource, { query: 'ma', limit: 2 }))).toEqual(['place_manas_airport', 'place_asia_mall']);
    expect(await searchCity(dataSource, { query: 'no such place' })).toEqual([]);
  });

  it('refuses an area outside the covered city', async () => {
    const { dataSource } = source();

    await expect(
      settle(dataSource.places.search({ area: { center: { latitude: 41, longitude: 70 }, radiusMeters: 1_000 }, limit: 5 })),
    ).rejects.toEqual(sourceError('UNSUPPORTED_AREA'));
  });

  it.each([
    ['a limit of zero', { limit: 0 }],
    ['untrimmed text', { query: ' asia' }],
    ['a precise center', { area: { center: { latitude: 42.874_321, longitude: 74.6 }, radiusMeters: 1_000 } }],
  ])('refuses %s', async (_case, input) => {
    const { dataSource } = source();

    await expect(searchCity(dataSource, input)).rejects.toEqual(sourceError('VALIDATION_FAILED'));
  });

  it('keeps place IDs across resets', async () => {
    const { simulator, dataSource } = source();
    const before = await searchCity(dataSource, {});

    simulator.reset();
    expect(await searchCity(dataSource, {})).toEqual(before);
    expect(before).toHaveLength(12);
  });

  it('cancels a search whose signal aborts', async () => {
    const { simulator, dataSource } = source();
    const controller = new AbortController();
    const search = dataSource.places.search(
      { area: { center: { latitude: 42.87, longitude: 74.6 }, radiusMeters: 5_000 }, limit: 5 },
      { signal: controller.signal },
    );

    controller.abort();
    await expect(search).rejects.toMatchObject({ kind: 'aborted' });
    expect(simulator.stats().pendingOperations).toBe(0);
  });
});

describe('rides.getNearby', () => {
  it('keeps the items nearest the viewport center and says when it left some out', async () => {
    const { dataSource } = source();
    const all = await readCity(dataSource);
    const nearest = await readCity(dataSource, 3);

    expect(nearest.truncated).toBe(true);
    expect(nearest.items).toEqual(all.items.slice(0, 3));
    const center = { latitude: 42.925, longitude: 74.6 };
    const distances = all.items.map((item) => distanceMeters(center, item.publicOrigin.center));
    expect(distances).toEqual([...distances].sort((first, second) => first - second));
  });

  it('shows only items whose public area lies in the viewport', async () => {
    const { dataSource } = source();
    const snapshot = await settle(dataSource.rides.getNearby({ viewport: TUNGUCH, limit: 100 }));

    expect(snapshot.items).toEqual([expect.objectContaining({ kind: 'group', status: 'ready' })]);
  });

  describe('supplied matches for a destination (DESTINATION-001-A)', () => {
    const readFor = (dataSource: AppDataSource, destinationPlaceId?: string, departureOffsetMinutes?: 0 | 5 | 10, limit = 100) =>
      settle(dataSource.rides.getNearby({ viewport: CITY, destinationPlaceId, departureOffsetMinutes, limit }));
    /** Each preview as "Name level +minutes" (a group as "group"), to read the fixtures at a glance. */
    const describePreviews = (snapshot: Awaited<ReturnType<typeof readFor>>) =>
      snapshot.previews.map((preview) => {
        const item = snapshot.items.find((entry) => entry.kind === preview.target.kind && entry.id === preview.target.id)!;
        const who = item.kind === 'ride' ? item.user.displayName : 'group';
        return `${who} ${preview.level} +${preview.additionalMinutes}`;
      });

    it('returns no previews without a destination, and leaves the items unchanged with one', async () => {
      const { dataSource } = source();
      const general = await readFor(dataSource);
      const withDestination = await readFor(dataSource, 'place_asia_mall');

      expect(general.previews).toEqual([]);
      expect(withDestination.items).toEqual(general.items);
      expect(NearbySnapshotSchema.parse(withDestination)).toEqual(withDestination);
    });

    it('gives the scenario’s matches for the destination, in the items’ order, for returned items only', async () => {
      const { dataSource } = source();
      const snapshot = await readFor(dataSource, 'place_asia_mall');

      expect(describePreviews(snapshot)).toEqual(
        snapshot.items.flatMap((item) =>
          item.kind === 'ride' && item.user.displayName === 'Aida'
            ? ['Aida excellent +0']
            : item.kind === 'ride' && item.user.displayName === 'Elnura'
              ? ['Elnura good +5']
              : [],
        ),
      );
      expect(describePreviews(await readFor(dataSource, 'place_tsum'))).toEqual(
        expect.arrayContaining(['group excellent +0', 'Farkhat good +2', 'Bakyt possible +7']),
      );
    });

    it('leaves out a match whose departure choices exclude the read’s', async () => {
      const { dataSource } = source();

      expect(describePreviews(await readFor(dataSource, 'place_vefa_center', 0))).toEqual(['Elnura excellent +0']);
      expect(describePreviews(await readFor(dataSource, 'place_vefa_center', 5)).sort()).toEqual([
        'Aida good +4',
        'Elnura excellent +0',
      ]);
    });

    it('keeps unrelated activity with no previews for a destination nobody matches', async () => {
      const { dataSource } = source();
      const snapshot = await readFor(dataSource, 'place_western_bus_station');

      expect(snapshot.previews).toEqual([]);
      expect(snapshot.items).toHaveLength(8);
    });

    it('drops a match once its item leaves discovery, and adds the appearing ride’s', async () => {
      const { simulator, dataSource } = source();
      expect(describePreviews(await readFor(dataSource, 'place_ala_too'))).toContain('Bakyt excellent +0');
      expect(describePreviews(await readFor(dataSource, 'place_osh_bazaar'))).toEqual([]);

      simulator.advanceTime(21 * SECOND);

      const alaToo = await readFor(dataSource, 'place_ala_too');
      expect(describePreviews(alaToo)).not.toContain('Bakyt excellent +0');
      expect(describePreviews(alaToo)).toContain('group good +3');
      expect(describePreviews(await readFor(dataSource, 'place_osh_bazaar'))).toEqual(['Nurlan excellent +0']);
    });

    it('previews only items within the limit, and repeats exactly', async () => {
      const { dataSource } = source('map-density');
      const all = await readFor(dataSource, 'place_asia_mall');
      const few = await readFor(dataSource, 'place_asia_mall', undefined, 10);

      expect(all.previews.length).toBeGreaterThan(few.previews.length);
      const targets = new Set(few.items.map((item) => `${item.kind}:${item.id}`));
      for (const preview of few.previews) expect(targets).toContain(`${preview.target.kind}:${preview.target.id}`);
      expect(await readFor(dataSource, 'place_asia_mall')).toEqual(all);
      expect(NearbySnapshotSchema.parse(all)).toEqual(all);
    });
  });

  it('refuses a viewport outside the covered city', async () => {
    const { dataSource } = source();

    await expect(settle(dataSource.rides.getNearby({ viewport: OUTSIDE, limit: 10 }))).rejects.toEqual(
      sourceError('UNSUPPORTED_AREA'),
    );
  });

  it.each([
    ['a viewport wider than 0.5°', { viewport: { ...CITY, northEast: { latitude: 43.3, longitude: 74.8 } }, limit: 10 }],
    ['an unknown destination', { viewport: CITY, destinationPlaceId: 'place_unknown', limit: 10 }],
  ])('refuses %s', async (_case, input) => {
    const { dataSource } = source();

    await expect(settle(dataSource.rides.getNearby(input))).rejects.toEqual(sourceError('VALIDATION_FAILED'));
  });
});

describe('public ride and group views', () => {
  it('shows each discovery item the same way on its own', async () => {
    const { dataSource } = source();
    const { items } = await readCity(dataSource);

    for (const { kind, ...view } of items) {
      if (kind === 'ride') {
        const ride = await settle(dataSource.rides.getRide(view.id));
        expect(RideRequestSchema.safeParse(ride).success).toBe(true);
        expect(ride).toEqual(view);
      } else {
        const preview = await settle(dataSource.groups.getPreview(view.id));
        expect(GroupPreviewSchema.safeParse(preview).success).toBe(true);
        expect(preview).toEqual(view);
      }
    }
  });

  it('answers TARGET_UNAVAILABLE for a grouped ride and unknown targets', async () => {
    const { simulator, dataSource } = source();
    const grouped = [...simulator.state.rides.values()].find((ride) => ride.status === 'grouped');

    await expect(settle(dataSource.rides.getRide(grouped?.id ?? ''))).rejects.toEqual(sourceError('TARGET_UNAVAILABLE'));
    await expect(settle(dataSource.rides.getRide('ride_unknown'))).rejects.toEqual(sourceError('TARGET_UNAVAILABLE'));
    await expect(settle(dataSource.groups.getPreview('group_unknown'))).rejects.toEqual(sourceError('TARGET_UNAVAILABLE'));
  });

  it('keeps exact origins and meeting points out of every public output', async () => {
    const { simulator, dataSource } = source();
    const snapshot = await readCity(dataSource);
    const views: unknown[] = [];
    for (const item of snapshot.items) {
      views.push(
        item.kind === 'ride'
          ? await settle(dataSource.rides.getRide(item.id))
          : await settle(dataSource.groups.getPreview(item.id)),
      );
    }

    expectNoPrivatePoints(simulator.state, [snapshot, views]);
  });
});

describe('nearby subscriptions and timed events', () => {
  /** Subscribes to `viewport` and collects the events it delivers. */
  async function subscribe(dataSource: AppDataSource, viewport: MapViewport) {
    const events: PublicEventDto[] = [];
    const subscription = await settle(dataSource.events.subscribe({ kind: 'nearby', viewport }, (event) => events.push(event)));
    return { events, subscription };
  }

  it('shows a ride appearing at 8 seconds and another expiring at 20 seconds, live and in reads', async () => {
    const { simulator, dataSource } = source();
    const { events, subscription } = await subscribe(dataSource, CITY);
    expect(subscription.ack).toEqual({ subscriptionId: expect.any(String), subscription: { kind: 'nearby', viewport: CITY } });

    await jest.advanceTimersByTimeAsync(8 * SECOND);
    expect(events).toEqual([
      expect.objectContaining({ type: 'nearby.upserted', payload: { item: expect.objectContaining({ kind: 'ride' }) } }),
    ]);
    const [first] = events;
    const appeared = first?.type === 'nearby.upserted' ? first.payload.item : undefined;
    expect(appeared).toMatchObject({ user: { displayName: 'Nurlan' } });
    expect(ids((await readCity(dataSource)).items)).toContain(appeared?.id);

    const expiring = [...simulator.state.rides.values()].find((ride) => ride.expiresAt === START + 20 * SECOND);
    await jest.advanceTimersByTimeAsync(12 * SECOND);
    expect(events[1]).toMatchObject({
      type: 'nearby.removed',
      payload: { target: { kind: 'ride', id: expiring?.id }, version: 2, reason: 'expired' },
    });
    expect(ids((await readCity(dataSource)).items)).not.toContain(expiring?.id);
    await expect(settle(dataSource.rides.getRide(expiring?.id ?? ''))).rejects.toEqual(sourceError('TARGET_UNAVAILABLE'));
    for (const event of events) expect(PublicEventSchema.safeParse(event).success).toBe(true);
  });

  it('delivers only events about items in the subscribed viewport, removals included', async () => {
    const { simulator, dataSource } = source();
    const { events } = await subscribe(dataSource, TUNGUCH);
    const ready = [...simulator.state.groups.values()].find((group) => group.status === 'ready');

    await jest.advanceTimersByTimeAsync(30 * SECOND);
    expect(events).toEqual([]);
    await jest.advanceTimersByTimeAsync((ready?.expiresAt ?? 0) - Date.now());
    expect(events).toEqual([
      expect.objectContaining({ type: 'nearby.removed', payload: { target: { kind: 'group', id: ready?.id }, version: 4, reason: 'expired' } }),
    ]);
  });

  it('stops delivering after unsubscribing, and a disconnection ends every subscription', async () => {
    const { simulator, dataSource } = source();
    const first = await subscribe(dataSource, CITY);
    const second = await subscribe(dataSource, CITY);

    await first.subscription.unsubscribe();
    await expect(first.subscription.unsubscribe()).resolves.toBeUndefined();
    simulator.setConnection('disconnected');
    expect(simulator.stats().eventListeners).toBe(0);
    await jest.advanceTimersByTimeAsync(30 * SECOND);
    expect([...first.events, ...second.events]).toEqual([]);
  });

  it('leaves no listener behind when the acknowledgement is lost', async () => {
    const { simulator, dataSource } = source();
    simulator.failNext({ kind: 'network', afterCommit: true }, 'events.subscribe');

    await expect(subscribe(dataSource, CITY)).rejects.toMatchObject({ kind: 'network' });
    expect(simulator.stats().eventListeners).toBe(0);
  });

  it('refuses invalid and uncovered viewports, an anonymous user subscription, and group subscriptions for now', async () => {
    const { dataSource } = source();
    const wide = { ...CITY, northEast: { latitude: 43.3, longitude: 74.8 } };

    await expect(subscribe(dataSource, wide)).rejects.toEqual(sourceError('VALIDATION_FAILED'));
    await expect(subscribe(dataSource, OUTSIDE)).rejects.toEqual(sourceError('UNSUPPORTED_AREA'));
    await expect(settle(dataSource.events.subscribe({ kind: 'user' }, () => {}))).rejects.toEqual(
      sourceError('UNAUTHENTICATED'),
    );
    await expect(dataSource.events.subscribe({ kind: 'group', groupId: 'group_1' }, () => {})).rejects.toThrow(
      DataSourceUnavailableError,
    );
  });

  it('reports the simulated connection state', () => {
    const { simulator, dataSource } = source();
    const states: string[] = [];
    const stop = dataSource.events.watchConnection((state) => states.push(state));

    simulator.setConnection('disconnected');
    stop();
    simulator.setConnection('connected');
    expect(states).toEqual(['connected', 'disconnected']);
  });
});

describe('a full active-neighborhood run', () => {
  it('raises only valid events without private points, and closes every ride and group at its deadline', async () => {
    const { simulator, dataSource } = source();
    const events = recordEvents(simulator);

    await jest.advanceTimersByTimeAsync(31 * MINUTE);

    for (const event of events) expect(DomainEventSchema.safeParse(event).success).toBe(true);
    expectNoPrivatePoints(simulator.state, events);
    const count = (type: DomainEventDto['type']) => events.filter((event) => event.type === type).length;
    // One ride appears; seven rides and two groups end; seven expired and five cancelled requests reach their owners.
    expect([count('nearby.upserted'), count('nearby.removed'), count('ride.changed'), count('group.changed')]).toEqual([1, 9, 12, 2]);
    expect(events.filter((event) => event.audience.kind === 'public')).toHaveLength(10);

    const { rides, groups } = simulator.state;
    expect([...rides.values()].map((ride) => ride.status).sort()).toEqual([
      ...Array<string>(5).fill('cancelled'),
      ...Array<string>(7).fill('expired'),
    ]);
    for (const group of groups.values()) {
      expect(group).toMatchObject({ status: 'cancelled', closure: { reason: 'expired', closedAt: group.expiresAt } });
    }
    expect(simulator.stats().scheduledTasks).toBe(0);
    await expect(readCity(dataSource)).resolves.toEqual({ items: [], truncated: false, previews: [] });
  });

  it('starts the scenario over on reset, timed events included', async () => {
    const { simulator, dataSource } = source();
    await jest.advanceTimersByTimeAsync(31 * MINUTE);

    simulator.reset();
    expect((await readCity(dataSource)).items).toHaveLength(8);
    await jest.advanceTimersByTimeAsync(8 * SECOND);
    expect((await readCity(dataSource)).items).toHaveLength(9);
  });
});

describe('operations without a mock yet', () => {
  it('reject at once as unavailable, without simulated latency', async () => {
    const { dataSource } = source();

    await expect(dataSource.chat.send('group_1', {} as never)).rejects.toThrow(DataSourceUnavailableError);
    await expect(dataSource.safety.report({} as never)).rejects.toThrow(
      'The mock data source does not support this operation yet.',
    );
  });
});
