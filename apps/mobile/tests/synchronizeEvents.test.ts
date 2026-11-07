import {
  EVENT_SCHEMA_VERSION,
  type DomainEventDto,
  type MapViewport,
  type NearbyItemDto,
  type NearbyQueryInput,
  type NearbySnapshotDto,
} from '@ride-match/contracts';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import type { AppDataSource } from '../src/data/AppDataSource';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { nearbyQuery } from '../src/data/queries';
import { ANONYMOUS_VIEWER, queryKeys, type SignedInViewer } from '../src/data/queryKeys';
import { createEventSynchronizer, synchronizeSubscription, type EventSynchronizer } from '../src/data/synchronizeEvents';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

const START = Date.parse('2026-11-07T09:00:00.000Z');
const SECOND = 1000;
/** The whole covered city, within the 0.5° span limit. */
const CITY: MapViewport = { southWest: { latitude: 42.75, longitude: 74.4 }, northEast: { latitude: 43.1, longitude: 74.8 } };
const CITY_READ: NearbyQueryInput = { viewport: CITY, limit: 100 };
const RIDER: SignedInViewer = { kind: 'user', userId: 'user_rider' };
const OTHER_RIDER: SignedInViewer = { kind: 'user', userId: 'user_other' };

let simulators: Simulator<MockWorld>[] = [];
let clients: QueryClient[] = [];
let synchronizers: EventSynchronizer[] = [];
let observers: (() => void)[] = [];
let eventCount = 0;

function source() {
  const simulator = createMockSimulator('active-neighborhood', { latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS } });
  simulators.push(simulator);
  return { simulator, dataSource: createMockDataSource(simulator) };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const onInvalidEvent = jest.fn();
  const synchronizer = createEventSynchronizer(client, { onInvalidEvent });
  synchronizers.push(synchronizer);
  return { client, synchronizer, onInvalidEvent };
}

/** Keeps a query active, as a mounted screen would, so invalidation refetches it. */
function observe(client: QueryClient, options: ReturnType<typeof nearbyQuery>) {
  const observer = new QueryObserver(client, options);
  observers.push(observer.subscribe(() => undefined));
  return observer;
}

/** A valid event envelope with a fresh ID. */
function envelope(id = `evt_test_${(eventCount += 1)}`): Pick<DomainEventDto, 'id' | 'schemaVersion' | 'occurredAt'> {
  return { id, schemaVersion: EVENT_SCHEMA_VERSION, occurredAt: new Date(START).toISOString() };
}

const upserted = (item: NearbyItemDto, id?: string): DomainEventDto => ({
  ...envelope(id),
  type: 'nearby.upserted',
  audience: { kind: 'public' },
  payload: { item },
});

const removed = (item: NearbyItemDto, version: number): DomainEventDto => ({
  ...envelope(),
  type: 'nearby.removed',
  audience: { kind: 'public' },
  payload: { target: { kind: item.kind, id: item.id }, version, reason: 'unavailable' },
});

const rideChanged = (userId: string, rideRequestId: string, version: number): DomainEventDto => ({
  ...envelope(),
  type: 'ride.changed',
  audience: { kind: 'user', userId },
  payload: { rideRequestId, version, status: 'active' },
});

const groupChanged = (groupId: string, version: number): DomainEventDto => ({
  ...envelope(),
  type: 'group.changed',
  audience: { kind: 'group', groupId },
  payload: { groupId, version, reason: 'member_joined' },
});

const accessRevoked = (userId: string, groupId: string, version: number): DomainEventDto => ({
  ...envelope(),
  type: 'access.revoked',
  audience: { kind: 'user', userId },
  payload: { groupId, version, reason: 'left' },
});

/** A real snapshot of the city from the mock source, for valid items. */
async function citySnapshot(dataSource: AppDataSource): Promise<NearbySnapshotDto> {
  return settle(dataSource.rides.getNearby(CITY_READ));
}

const bump = <Item extends NearbyItemDto>(item: Item, version: number): Item => ({ ...item, version });
const itemsOf = (client: QueryClient) => client.getQueryData<NearbySnapshotDto>(queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ))?.items;
const isInvalidated = (client: QueryClient, key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated ?? false;

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  for (const stop of observers) stop();
  for (const synchronizer of synchronizers) synchronizer.dispose();
  for (const client of clients) client.clear();
  for (const simulator of simulators) simulator.dispose();
  observers = [];
  synchronizers = [];
  clients = [];
  simulators = [];
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('nearby events against a held snapshot', () => {
  async function held() {
    const { dataSource } = source();
    const sync = setup();
    const snapshot = await citySnapshot(dataSource);
    sync.client.setQueryData(queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ), snapshot);
    const [first] = snapshot.items;
    if (!first) throw new Error('the scenario has items');
    return { ...sync, snapshot, first };
  }

  it('applies a newer upsert in place, once, and ignores duplicates and older versions', async () => {
    const { client, synchronizer, first } = await held();
    const newer = bump(first, first.version + 1);
    const event = upserted(newer);

    expect(synchronizer.apply(event, ANONYMOUS_VIEWER)).toBe('applied');
    expect(synchronizer.apply(event, ANONYMOUS_VIEWER)).toBe('duplicate');
    expect(synchronizer.apply(upserted(first), ANONYMOUS_VIEWER)).toBe('stale');
    expect(synchronizer.apply(upserted(newer), ANONYMOUS_VIEWER)).toBe('stale');

    expect(itemsOf(client)?.[0]).toEqual(newer);
  });

  it('converges whatever order a removal and older upserts arrive in', async () => {
    const { client, synchronizer, first } = await held();
    const v2 = bump(first, first.version + 1);
    const v3 = first.version + 2;

    // The removal arrives before an upsert it supersedes.
    expect(synchronizer.apply(removed(first, v3), ANONYMOUS_VIEWER)).toBe('applied');
    expect(synchronizer.apply(upserted(v2), ANONYMOUS_VIEWER)).toBe('stale');
    expect(itemsOf(client)?.map((item) => item.id)).not.toContain(first.id);

    // A newer upsert than the tombstone brings it back.
    const v4 = bump(first, first.version + 3);
    expect(synchronizer.apply(upserted(v4), ANONYMOUS_VIEWER)).toBe('applied');
    expect(isInvalidated(client, queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ))).toBe(true);
  });

  it('keeps a tombstone against a later snapshot that still holds the older item', async () => {
    const { client, synchronizer, snapshot, first } = await held();
    synchronizer.apply(removed(first, first.version), ANONYMOUS_VIEWER);

    // A read that started before the removal lands afterwards.
    client.setQueryData(queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ), snapshot);

    expect(itemsOf(client)?.map((item) => item.id)).not.toContain(first.id);
    expect(itemsOf(client)).toHaveLength(snapshot.items.length - 1);
  });

  it('patches a later older snapshot with the newer upsert it missed', async () => {
    const { client, synchronizer, snapshot, first } = await held();
    const newer = bump(first, first.version + 1);
    synchronizer.apply(upserted(newer), ANONYMOUS_VIEWER);

    client.setQueryData(queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ), snapshot);

    expect(itemsOf(client)?.[0]).toEqual(newer);
  });

  it('invalidates a snapshot that does not hold an upserted item, and one with match previews', async () => {
    const { dataSource } = source();
    const { client, synchronizer } = setup();
    const snapshot = await citySnapshot(dataSource);
    const [first, ...rest] = snapshot.items;
    if (!first) throw new Error('the scenario has items');
    const withPreviews: NearbyQueryInput = { ...CITY_READ, destinationPlaceId: 'place_asia_mall' };
    client.setQueryData(queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ), { ...snapshot, items: rest });
    client.setQueryData(queryKeys.nearby(ANONYMOUS_VIEWER, withPreviews), snapshot);

    synchronizer.apply(upserted(bump(first, first.version + 1)), ANONYMOUS_VIEWER);

    expect(isInvalidated(client, queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ))).toBe(true);
    expect(isInvalidated(client, queryKeys.nearby(ANONYMOUS_VIEWER, withPreviews))).toBe(true);
  });

  it('updates a held ride or group preview with a newer public payload', async () => {
    const { client, synchronizer, first } = await held();
    const previewKey = first.kind === 'ride' ? queryKeys.ride(ANONYMOUS_VIEWER, first.id) : queryKeys.groupPreview(ANONYMOUS_VIEWER, first.id);
    const { kind: _kind, ...publicRead } = first;
    client.setQueryData(previewKey, publicRead);

    synchronizer.apply(upserted(bump(first, first.version + 1)), ANONYMOUS_VIEWER);

    expect(client.getQueryData(previewKey)).toEqual({ ...publicRead, version: first.version + 1 });
  });

  it('keeps what it learned per viewer', async () => {
    const { client, synchronizer, snapshot, first } = await held();
    synchronizer.apply(removed(first, first.version), RIDER);

    // The rider's tombstone (say, from a block) does not hide the item from anonymous browsing.
    client.setQueryData(queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ), snapshot);
    expect(itemsOf(client)?.map((item) => item.id)).toContain(first.id);
  });
});

describe('private events', () => {
  it('drops events for another user and never applies them to the cache', () => {
    const { client, synchronizer } = setup();
    client.setQueryData(queryKeys.ownRequest(RIDER), { id: 'ride_own', version: 3 });

    expect(synchronizer.apply(rideChanged(OTHER_RIDER.userId, 'ride_own', 9), RIDER)).toBe('not-for-viewer');
    expect(synchronizer.apply(rideChanged(RIDER.userId, 'ride_own', 9), ANONYMOUS_VIEWER)).toBe('not-for-viewer');
    expect(isInvalidated(client, queryKeys.ownRequest(RIDER))).toBe(false);
  });

  it('rereads the own request only for a newer version', () => {
    const { client, synchronizer } = setup();
    client.setQueryData(queryKeys.ownRequest(RIDER), { id: 'ride_own', version: 3 });

    expect(synchronizer.apply(rideChanged(RIDER.userId, 'ride_own', 3), RIDER)).toBe('stale');
    expect(isInvalidated(client, queryKeys.ownRequest(RIDER))).toBe(false);

    expect(synchronizer.apply(rideChanged(RIDER.userId, 'ride_own', 4), RIDER)).toBe('applied');
    expect(isInvalidated(client, queryKeys.ownRequest(RIDER))).toBe(true);
    expect(isInvalidated(client, queryKeys.currentUser(RIDER))).toBe(false); // not cached, nothing to mark
  });

  it('rereads once more when an older group read lands after a newer event', async () => {
    const { client, synchronizer } = setup();
    const detailKey = queryKeys.groupDetail(RIDER, 'group_1');
    synchronizer.apply(groupChanged('group_1', 5), RIDER);
    const invalidate = jest.spyOn(client, 'invalidateQueries');

    client.setQueryData(detailKey, { id: 'group_1', version: 4 });
    await Promise.resolve();
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: detailKey, exact: true });

    // The source answering with version 4 again is not reread forever.
    invalidate.mockClear();
    client.setQueryData(detailKey, { id: 'group_1', version: 4, again: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('removes a revoked group’s private data and drops its later events, unless the rider rejoined', () => {
    const { client, synchronizer } = setup();
    client.setQueryData(queryKeys.groupDetail(RIDER, 'group_1'), { id: 'group_1', version: 4 });
    client.setQueryData(queryKeys.chatHistory(RIDER, 'group_1'), { messages: [] });

    expect(synchronizer.apply(accessRevoked(RIDER.userId, 'group_1', 5), RIDER)).toBe('applied');
    expect(client.getQueryData(queryKeys.groupDetail(RIDER, 'group_1'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.chatHistory(RIDER, 'group_1'))).toBeUndefined();
    expect(synchronizer.apply(groupChanged('group_1', 5), RIDER)).toBe('not-for-viewer');

    // A newer group version means the rider is a member again.
    expect(synchronizer.apply(groupChanged('group_1', 6), RIDER)).toBe('applied');
  });

  it('ignores a revocation older than the group version held after rejoining', () => {
    const { client, synchronizer } = setup();
    client.setQueryData(queryKeys.groupDetail(RIDER, 'group_1'), { id: 'group_1', version: 7 });

    expect(synchronizer.apply(accessRevoked(RIDER.userId, 'group_1', 5), RIDER)).toBe('stale');
    expect(client.getQueryData(queryKeys.groupDetail(RIDER, 'group_1'))).toEqual({ id: 'group_1', version: 7 });
  });
});

describe('invalid events and reset', () => {
  it('treats an invalid event as missed: reports its type only and rereads the viewer’s data', () => {
    const { client, synchronizer, onInvalidEvent } = setup();
    client.setQueryData(queryKeys.ownRequest(RIDER), { id: 'ride_own', version: 3 });

    expect(synchronizer.apply({ ...rideChanged(RIDER.userId, 'ride_own', 4), schemaVersion: 2 }, RIDER)).toBe('invalid');

    expect(onInvalidEvent).toHaveBeenCalledWith('ride.changed');
    expect(isInvalidated(client, queryKeys.ownRequest(RIDER))).toBe(true);
  });

  it('forgets event IDs and versions on reset', () => {
    const { client, synchronizer } = setup();
    client.setQueryData(queryKeys.ownRequest(RIDER), { id: 'ride_own', version: 3 });
    const event = rideChanged(RIDER.userId, 'ride_own', 4);
    synchronizer.apply(event, RIDER);

    synchronizer.reset();

    expect(synchronizer.apply(event, RIDER)).toBe('applied');
  });
});

describe('with the mock source', () => {
  /**
   * A data source whose nearby reads are taken at once but delivered only when `release` is
   * called, as a slow network would deliver a snapshot taken before later events.
   */
  function delayedReads(dataSource: AppDataSource) {
    const pending: (() => void)[] = [];
    const delayed: AppDataSource = {
      ...dataSource,
      rides: {
        ...dataSource.rides,
        getNearby: async (input, options) => {
          const snapshot = await dataSource.rides.getNearby(input, options);
          await new Promise<void>((resolve) => pending.push(resolve));
          return snapshot;
        },
      },
    };
    return { delayed, release: () => pending.splice(0).forEach((resolve) => resolve()) };
  }

  it('keeps a removal that arrives while an older snapshot is in flight', async () => {
    const { simulator, dataSource } = source();
    const { client, synchronizer } = setup();
    await settle(synchronizeSubscription(dataSource.events, synchronizer, { kind: 'nearby', viewport: CITY }, ANONYMOUS_VIEWER));
    const expiring = [...simulator.state.rides.values()].find((ride) => ride.expiresAt === START + 20 * SECOND);
    const { delayed, release } = delayedReads(dataSource);

    // The read is taken just before the ride expires at 20 s and delivered after its removal.
    await jest.advanceTimersByTimeAsync(20 * SECOND - 3 * MOCK_LATENCY_MS);
    const read = client.fetchQuery(nearbyQuery(delayed, ANONYMOUS_VIEWER, CITY_READ));
    await jest.advanceTimersByTimeAsync(MOCK_LATENCY_MS);
    await jest.advanceTimersByTimeAsync(5 * MOCK_LATENCY_MS);
    release();
    const delivered = await read;

    expect(delivered.items.map((item) => item.id)).toContain(expiring?.id);
    expect(itemsOf(client)?.map((item) => item.id)).not.toContain(expiring?.id);
  });

  it('converges on a ride that appears while the first snapshot is in flight', async () => {
    const { simulator, dataSource } = source();
    const { client, synchronizer } = setup();
    await settle(synchronizeSubscription(dataSource.events, synchronizer, { kind: 'nearby', viewport: CITY }, ANONYMOUS_VIEWER));
    let releaseFirst = true;
    const { delayed, release } = delayedReads(dataSource);
    // Only the first read is delayed; the follow-up read after the event answers at once.
    const firstReadDelayed: AppDataSource = {
      ...dataSource,
      rides: {
        ...dataSource.rides,
        getNearby: (input, options) => {
          if (releaseFirst) {
            releaseFirst = false;
            return delayed.rides.getNearby(input, options);
          }
          return dataSource.rides.getNearby(input, options);
        },
      },
    };

    await jest.advanceTimersByTimeAsync(8 * SECOND - 3 * MOCK_LATENCY_MS);
    observe(client, nearbyQuery(firstReadDelayed, ANONYMOUS_VIEWER, CITY_READ));
    await jest.advanceTimersByTimeAsync(MOCK_LATENCY_MS);
    // The ride appears while the first read is in flight; Query joins the invalidation to that
    // read, so the synchronizer reads again once the older snapshot lands.
    await jest.advanceTimersByTimeAsync(5 * MOCK_LATENCY_MS);
    release();
    await jest.advanceTimersByTimeAsync(5 * MOCK_LATENCY_MS);

    const appeared = [...simulator.state.rides.values()].find((ride) => ride.createdAt === START + 8 * SECOND);
    expect(appeared).toBeDefined();
    expect(itemsOf(client)?.map((item) => item.id)).toContain(appeared?.id);
  });
});
