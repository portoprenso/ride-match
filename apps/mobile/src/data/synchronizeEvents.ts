import {
  DomainEventSchema,
  type DomainEventDto,
  type Id,
  type JoinTargetDto,
  type NearbyItemDto,
  type NearbyQueryInput,
  type NearbySnapshotDto,
  type SubscriptionRequest,
} from '@ride-match/contracts';
import type { Query, QueryClient, QueryKey } from '@tanstack/react-query';

import type { EventForRequest, EventOperations, EventSubscription } from './AppDataSource';
import { queryKeys, type SignedInViewer, type Viewer } from './queryKeys';

/**
 * What {@link EventSynchronizer.apply} did with an event:
 *
 * - `applied`: the cache was patched, or the affected reads were invalidated.
 * - `duplicate`: an event with this ID was already applied.
 * - `stale`: the app already knows this or a newer version of the resource.
 * - `not-for-viewer`: a private event for another user, or for a group the viewer can no longer
 *   read (`docs/api/realtime.md`: such events are dropped, not only unsubscribed).
 * - `invalid`: the event breaks the contract; the viewer's reads are invalidated, as after a
 *   missed event.
 */
export type EventOutcome = 'applied' | 'duplicate' | 'stale' | 'not-for-viewer' | 'invalid';

/**
 * Applies realtime events to the Query cache so that events and reads converge on the newest
 * canonical state, whatever order they arrive in (`docs/api/realtime.md`, synchronization):
 *
 * - Each event applies once (deduplicated by event ID) and only if it is newer than the version
 *   the app knows for its resource. Versions are compared only within one resource.
 * - `nearby.upserted` patches cached discovery snapshots that hold the item (full public
 *   payload), and the item's ride or group preview read. Snapshots that do not hold it, or that
 *   carry match previews, are invalidated instead, since only the source knows their ordering,
 *   limit and previews.
 * - `nearby.removed` leaves a tombstone, removes the item from snapshots and invalidates its
 *   preview read; no older upsert or snapshot can bring it back.
 * - `ride.changed`, `matches.changed` and `group.changed` invalidate the owner's or member's
 *   reads that hold an older version; `chat.message.created` invalidates the group's chat until
 *   CHAT-001-C merges messages; `access.revoked` removes the group's private data, unless a
 *   newer group version shows the viewer rejoined, and later events of that group are dropped.
 * - Snapshot/event race: whenever a read succeeds, its result is checked against what events
 *   taught. A snapshot item older than a known upsert is replaced by it, one older than a
 *   tombstone is dropped, and a single-resource read older than a known version is read again
 *   once. A newer read raises the known version instead, so later stale events are ignored.
 *
 * What it knows is kept per viewer, so one rider's tombstones never hide items from another.
 * Subscribing, resubscribing after reconnecting and resetting on identity or scenario changes
 * are the caller's (SYNC-001-B), through {@link synchronizeSubscription} and `reset`.
 */
export type EventSynchronizer = {
  /** Applies one event for `viewer`, the identity the subscription was made for. */
  apply(event: unknown, viewer: Viewer): EventOutcome;
  /** Forgets every event ID and version, for example when the identity or the scenario changes. */
  reset(): void;
  /** Stops watching reads. Events applied later still work but no read is reconciled. */
  dispose(): void;
};

export type EventSynchronizerOptions = {
  /** How many recent event IDs are remembered for deduplication; 1,000 unless given. */
  rememberedEvents?: number;
  /**
   * Called with only the `type` of an event that failed validation (never its payload, which
   * may hold private data). Logs a warning unless given.
   */
  onInvalidEvent?: (type: string) => void;
};

/** What events and reads taught about one resource, for one viewer. */
type Known = {
  version: number;
  /** The newest public payload, from an upsert or a snapshot, for patching later snapshots. */
  item: NearbyItemDto | null;
  /** A `nearby.removed` tombstone at `version`. */
  removed: boolean;
  /** `access.revoked` at `version`: the viewer may no longer read this group's private data. */
  revoked: boolean;
};

type ViewerState = {
  resources: Map<string, Known>;
};

/** Reads whose results carry one resource's version, by the key segment after the viewer scope. */
type SingleResourceKind = 'rides' | 'groupPreviews' | 'ownRequest' | 'matches' | 'groups';

const DEFAULT_REMEMBERED_EVENTS = 1000;

// Public versions (discovery items and their preview reads) and private ones (the owner's own
// request, a member's group) are tracked apart. They share version numbers but not events: the
// public tombstone of the rider's own ride, or of their group, carries the same version as the
// private change that caused it, and must not make that private change look already known.
const rideKey = (id: Id) => `ride:${id}`;
const groupKey = (id: Id) => `group:${id}`;
const ownRideKey = (id: Id) => `own-ride:${id}`;
const memberGroupKey = (id: Id) => `member-group:${id}`;
const matchesKey = (rideId: Id) => `matches:${rideId}`;
const targetKey = (target: JoinTargetDto) => `${target.kind}:${target.id}`;

function viewerId(viewer: Viewer): string {
  return viewer.kind === 'user' ? `user:${viewer.userId}` : 'anonymous';
}

/** Splits a viewer-scoped query key into its viewer and the rest; `null` for public keys. */
function splitViewerKey(key: QueryKey): { viewer: Viewer; rest: readonly unknown[] } | null {
  if (key[0] !== 'viewer') return null;
  if (key[1] === 'anonymous') return { viewer: { kind: 'anonymous' }, rest: key.slice(2) };
  if (key[1] === 'user' && typeof key[2] === 'string') return { viewer: { kind: 'user', userId: key[2] }, rest: key.slice(3) };
  return null;
}

function hasVersion(value: unknown): value is { id?: Id; version: number } {
  return typeof value === 'object' && value !== null && typeof (value as { version?: unknown }).version === 'number';
}

/** The public read of one nearby item, without the discovery-only `kind`. */
function withoutKind(item: NearbyItemDto) {
  const { kind: _kind, ...rest } = item;
  return rest;
}

/**
 * Builds the synchronizer over the app's Query cache. It starts watching reads at once; call
 * `dispose` when the cache goes away.
 */
export function createEventSynchronizer(queryClient: QueryClient, options: EventSynchronizerOptions = {}): EventSynchronizer {
  const remembered = options.rememberedEvents ?? DEFAULT_REMEMBERED_EVENTS;
  const onInvalidEvent =
    options.onInvalidEvent ?? ((type: string) => console.warn(`Ignored an invalid realtime event (${type}); rereading.`));
  const seenEvents = new Set<string>();
  const viewers = new Map<string, ViewerState>();
  // The known version each follow-up read was scheduled for, by query hash, so a source that
  // keeps answering with an older version is not reread forever.
  const followUps = new Map<string, number>();
  // Snapshots that were being read when an item they did not hold was upserted, by query hash,
  // with the items' keys. Query joins an invalidation to a first read in flight instead of
  // starting another, so the read that lands may predate the item.
  const upsertedDuringRead = new Map<string, Set<string>>();

  function stateOf(viewer: Viewer): ViewerState {
    const id = viewerId(viewer);
    let state = viewers.get(id);
    if (!state) {
      state = { resources: new Map() };
      viewers.set(id, state);
    }
    return state;
  }

  function remember(eventId: string) {
    seenEvents.add(eventId);
    if (seenEvents.size > remembered) {
      const oldest = seenEvents.values().next().value;
      if (oldest !== undefined) seenEvents.delete(oldest);
    }
  }

  /** Records what is now known about a resource; returns `false` when `version` is not newer. */
  function learn(state: ViewerState, key: string, version: number, change: Partial<Omit<Known, 'version'>>): boolean {
    const known = state.resources.get(key);
    if (known && version <= known.version) return false;
    state.resources.set(key, {
      version,
      item: change.item ?? null,
      removed: change.removed ?? false,
      revoked: change.revoked ?? false,
    });
    return true;
  }

  function invalidate(queryKey: QueryKey, exact = true) {
    void queryClient.invalidateQueries({ queryKey, exact });
  }

  /** Invalidates the read at `queryKey` unless it already holds `version` or newer. */
  function invalidateIfOlder(queryKey: QueryKey, version: number) {
    const data = queryClient.getQueryData(queryKey);
    if (hasVersion(data) && data.version >= version) return;
    invalidate(queryKey);
  }

  function nearbyQueries(viewer: Viewer): Query[] {
    return queryClient.getQueryCache().findAll({ queryKey: [...queryKeys.viewer(viewer), 'nearby'] });
  }

  /**
   * Brings one snapshot up to what is known: newer upserts replace older items, tombstones drop
   * them, and newer snapshot items teach their versions. `snapshot` is what to store, or `null`
   * when nothing changed; `reread` is set when an item is older than a version known only from a
   * private event, which has no public payload to patch with.
   */
  function reconcileSnapshot(
    state: ViewerState,
    snapshot: NearbySnapshotDto,
  ): { snapshot: NearbySnapshotDto | null; reread: number | null } {
    let changed = false;
    let reread: number | null = null;
    const dropped = new Set<string>();
    const items: NearbyItemDto[] = [];
    for (const item of snapshot.items) {
      const key = targetKey(item);
      const known = state.resources.get(key);
      if (known && known.version > item.version) {
        if (known.removed) {
          changed = true;
          dropped.add(key);
        } else if (known.item !== null) {
          changed = true;
          items.push(known.item);
        } else {
          reread = Math.max(reread ?? 0, known.version);
          items.push(item);
        }
        continue;
      }
      if (known?.removed && known.version >= item.version) {
        changed = true;
        dropped.add(key);
        continue;
      }
      if (!known || item.version > known.version) learn(state, key, item.version, { item });
      items.push(item);
    }
    if (!changed) return { snapshot: null, reread };
    return {
      snapshot: {
        ...snapshot,
        items,
        previews: snapshot.previews.filter((preview) => !dropped.has(targetKey(preview.target))),
      },
      reread,
    };
  }

  /** Reads `query` once more for the known `version`, at most once per version. */
  function followUp(query: Query, version: number) {
    if (followUps.get(query.queryHash) === version) return;
    followUps.set(query.queryHash, version);
    // After the cache finishes notifying about the read that just landed.
    void Promise.resolve().then(() => invalidate(query.queryKey));
  }

  /** Reconciles a read that just succeeded with what events taught. */
  function reconcileRead(query: Query) {
    const split = splitViewerKey(query.queryKey);
    const data = query.state.data;
    if (!split || data === undefined) return;
    const state = stateOf(split.viewer);
    const [segment, id] = split.rest;

    if (segment === 'nearby') {
      const { snapshot, reread } = reconcileSnapshot(state, data as NearbySnapshotDto);
      if (snapshot) queryClient.setQueryData(query.queryKey, snapshot);
      let needed = reread;
      const missed = upsertedDuringRead.get(query.queryHash);
      if (missed) {
        upsertedDuringRead.delete(query.queryHash);
        const held = new Set((snapshot ?? (data as NearbySnapshotDto)).items.map(targetKey));
        for (const key of missed) {
          const known = state.resources.get(key);
          if (known && !known.removed && !held.has(key)) needed = Math.max(needed ?? 0, known.version);
        }
      }
      if (needed !== null) followUp(query, needed);
      return;
    }

    let key: string | null = null;
    switch (segment as SingleResourceKind) {
      case 'rides':
        key = rideKey(id as Id);
        break;
      case 'groupPreviews':
        key = groupKey(id as Id);
        break;
      case 'ownRequest':
        key = hasVersion(data) && data.id !== undefined ? ownRideKey(data.id) : null;
        break;
      case 'matches':
        key = matchesKey(id as Id);
        break;
      case 'groups':
        // Only the group detail carries the group's version; chat pages do not.
        key = split.rest[2] === 'detail' ? memberGroupKey(id as Id) : null;
        break;
    }
    if (key === null || !hasVersion(data)) return;

    const known = state.resources.get(key);
    // An older read finished after a newer event: read once more for the known version.
    if (known && known.version > data.version) followUp(query, known.version);
    // A newer read teaches its version; for a group it also ends a revocation (the viewer rejoined).
    else learn(state, key, data.version, {});
  }

  const stopWatching = queryClient.getQueryCache().subscribe((cacheEvent) => {
    if (cacheEvent.type === 'updated' && cacheEvent.action.type === 'success') reconcileRead(cacheEvent.query);
  });

  function isForViewer(event: DomainEventDto, viewer: Viewer, state: ViewerState): boolean {
    const audience = event.audience;
    if (audience.kind === 'public') return true;
    if (viewer.kind !== 'user') return false;
    if (audience.kind === 'user') return audience.userId === viewer.userId;
    const known = state.resources.get(memberGroupKey(audience.groupId));
    if (!known?.revoked) return true;
    // A group event newer than the revocation means the viewer rejoined; a message has no group version.
    return event.type === 'group.changed' && event.payload.version > known.version;
  }

  function applyNearbyUpsert(state: ViewerState, viewer: Viewer, item: NearbyItemDto): EventOutcome {
    const key = targetKey(item);
    if (!learn(state, key, item.version, { item })) return 'stale';
    for (const query of nearbyQueries(viewer)) {
      const snapshot = query.state.data as NearbySnapshotDto | undefined;
      const input = query.queryKey.at(-1) as NearbyQueryInput | undefined;
      const index = snapshot?.items.findIndex((held) => targetKey(held) === key) ?? -1;
      if (!snapshot || index < 0 || input?.destinationPlaceId !== undefined) {
        if (query.state.fetchStatus === 'fetching') {
          const missed = upsertedDuringRead.get(query.queryHash) ?? new Set<string>();
          missed.add(key);
          upsertedDuringRead.set(query.queryHash, missed);
        }
        invalidate(query.queryKey);
        continue;
      }
      const items = [...snapshot.items];
      items[index] = item;
      queryClient.setQueryData(query.queryKey, { ...snapshot, items });
    }
    const previewKey = item.kind === 'ride' ? queryKeys.ride(viewer, item.id) : queryKeys.groupPreview(viewer, item.id);
    const held = queryClient.getQueryData(previewKey);
    if (hasVersion(held) && held.version < item.version) queryClient.setQueryData(previewKey, withoutKind(item));
    return 'applied';
  }

  function applyNearbyRemoval(state: ViewerState, viewer: Viewer, target: JoinTargetDto, version: number): EventOutcome {
    const key = targetKey(target);
    const known = state.resources.get(key);
    if (known && (version < known.version || (version === known.version && known.removed))) return 'stale';
    state.resources.set(key, { version, item: null, removed: true, revoked: false });
    for (const query of nearbyQueries(viewer)) {
      const snapshot = query.state.data as NearbySnapshotDto | undefined;
      if (!snapshot) continue;
      const next = reconcileSnapshot(state, snapshot).snapshot;
      if (next) queryClient.setQueryData(query.queryKey, next);
    }
    invalidate(target.kind === 'ride' ? queryKeys.ride(viewer, target.id) : queryKeys.groupPreview(viewer, target.id));
    return 'applied';
  }

  function applyPrivate(state: ViewerState, viewer: SignedInViewer, event: DomainEventDto): EventOutcome {
    switch (event.type) {
      case 'ride.changed': {
        const { rideRequestId, version } = event.payload;
        // No public payload: a snapshot holding an older item is reread instead of patched.
        if (!learn(state, ownRideKey(rideRequestId), version, {})) return 'stale';
        invalidateIfOlder(queryKeys.ownRequest(viewer), version);
        invalidateIfOlder(queryKeys.ride(viewer, rideRequestId), version);
        // The current user's request and group references may have changed (for example `grouped`).
        invalidate(queryKeys.currentUser(viewer));
        return 'applied';
      }
      case 'matches.changed': {
        const { rideRequestId, version } = event.payload;
        if (!learn(state, matchesKey(rideRequestId), version, {})) return 'stale';
        invalidateIfOlder(queryKeys.matches(viewer, rideRequestId), version);
        return 'applied';
      }
      case 'group.changed': {
        const { groupId, version } = event.payload;
        if (!learn(state, memberGroupKey(groupId), version, {})) return 'stale';
        invalidateIfOlder(queryKeys.groupDetail(viewer, groupId), version);
        invalidateIfOlder(queryKeys.groupPreview(viewer, groupId), version);
        return 'applied';
      }
      case 'chat.message.created':
        invalidate(queryKeys.chatHistory(viewer, event.payload.message.groupId));
        return 'applied';
      case 'access.revoked': {
        const { groupId, version } = event.payload;
        const known = state.resources.get(memberGroupKey(groupId));
        if (known && (known.version > version || (known.version === version && known.revoked))) return 'stale';
        state.resources.set(memberGroupKey(groupId), { version, item: null, removed: false, revoked: true });
        const privateKey = queryKeys.group(viewer, groupId);
        void queryClient.cancelQueries({ queryKey: privateKey });
        queryClient.removeQueries({ queryKey: privateKey });
        invalidate(queryKeys.currentUser(viewer));
        return 'applied';
      }
      default:
        return 'not-for-viewer';
    }
  }

  return {
    apply(input, viewer) {
      const parsed = DomainEventSchema.safeParse(input);
      if (!parsed.success) {
        const type = typeof input === 'object' && input !== null ? (input as { type?: unknown }).type : undefined;
        onInvalidEvent(typeof type === 'string' ? type : 'unknown');
        invalidate(queryKeys.viewer(viewer), false);
        return 'invalid';
      }
      const event = parsed.data;
      if (seenEvents.has(event.id)) return 'duplicate';
      const state = stateOf(viewer);
      if (!isForViewer(event, viewer, state)) return 'not-for-viewer';
      remember(event.id);

      switch (event.type) {
        case 'nearby.upserted':
          return applyNearbyUpsert(state, viewer, event.payload.item);
        case 'nearby.removed':
          return applyNearbyRemoval(state, viewer, event.payload.target, event.payload.version);
        default:
          // `isForViewer` admitted a private event only for a signed-in viewer.
          return applyPrivate(state, viewer as SignedInViewer, event);
      }
    },

    reset() {
      seenEvents.clear();
      viewers.clear();
      followUps.clear();
      upsertedDuringRead.clear();
    },

    dispose() {
      stopWatching();
    },
  };
}

/**
 * Subscribes to one logical scope and applies every event it delivers through `synchronizer`
 * for `viewer`. Resolves with the subscription, or rejects with the subscription error; the
 * caller unsubscribes and resubscribes as the viewport, identity or connection change.
 */
export function synchronizeSubscription<Request extends SubscriptionRequest>(
  events: EventOperations,
  synchronizer: EventSynchronizer,
  request: Request,
  viewer: Viewer,
): Promise<EventSubscription> {
  return events.subscribe(request, (event: EventForRequest<Request>) => {
    synchronizer.apply(event, viewer);
  });
}
