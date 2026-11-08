import type { SubscriptionRequest } from '@ride-match/contracts';
import { focusManager, onlineManager, type QueryClient } from '@tanstack/react-query';

import type { AppStateSource } from '../platform/appState';
import type { ConnectionState, EventOperations, EventSubscription } from './AppDataSource';
import { toDataError, type DataError } from './errors';
import { queryKeys, type Viewer } from './queryKeys';
import { createEventSynchronizer, type EventSynchronizer } from './synchronizeEvents';

/** Who the app reads as, and notice when that changes; the auth session supplies it. */
export type ViewerSource = {
  getViewer(): Viewer;
  /** Calls `listener` after every change that may change the viewer, until the returned function is called. */
  subscribe(listener: () => void): () => void;
};

export type SyncCoordinatorOptions = {
  queryClient: QueryClient;
  events: EventOperations;
  viewer: ViewerSource;
  appState: AppStateSource;
  /** A synchronizer of `queryClient`; one is built unless a test passes its own. */
  synchronizer?: EventSynchronizer;
};

/** Called when the source refuses a watched subscription, for example `MEMBERSHIP_REQUIRED`. */
export type SubscriptionErrorListener = (error: DataError) => void;

/**
 * Keeps the app's cached reads and realtime subscriptions true to one identity and one live
 * connection (`docs/api/realtime.md`, synchronization and reconnection):
 *
 * - Features `watch` the logical subscriptions they need; the coordinator subscribes them for
 *   the current viewer, feeds their events to the {@link EventSynchronizer} and ends them when
 *   the last watcher releases. `user` and `group` subscriptions are made only for a signed-in
 *   viewer.
 * - Identity change (sign-in, sign-out, an expired session, a demo reset): every subscription
 *   ends, events still arriving from them are dropped, the previous rider's reads are cancelled
 *   and removed so no late result can bring their private data back, what the synchronizer
 *   learned is forgotten, and the watched subscriptions are made again for the new viewer.
 * - Reconnect: the source ends subscriptions when the connection drops; when it returns they
 *   are made again and the viewer's reads are invalidated, so on-screen data is read anew.
 *   Query's online state follows the connection, so reads wait for it instead of failing, and
 *   foreground return refetches stale reads on screen (Query's focus follows `AppState`).
 * - Scenario start (demo controls): like a reconnect into a new world, with nothing learned kept.
 *
 * Nothing is queued while offline: mutations do not wait for the connection (see
 * `createQueryClient`).
 */
export type SyncCoordinator = {
  /** The synchronizer it feeds. */
  readonly synchronizer: EventSynchronizer;
  /**
   * Connects Query's focus and online state to the app and the connection and starts following
   * the viewer and connection. Call once; `dispose` undoes it.
   */
  start(): void;
  /**
   * Keeps `request` subscribed while held. Equal requests share one subscription. Resolves
   * nothing: a refusal reaches `onError`, and the request is tried again after the next
   * reconnect or identity change. Returns the release.
   */
  watch(request: SubscriptionRequest, onError?: SubscriptionErrorListener): () => void;
  /**
   * The demo controls started a scenario: the source ended every subscription and forgot
   * everything, so forget what was learned and subscribe again. The demo screen clears the
   * cached reads.
   */
  resetWorld(): void;
  /** Ends every subscription and undoes `start`. */
  dispose(): void;
};

type Watched = {
  request: SubscriptionRequest;
  holders: number;
  onError: Set<SubscriptionErrorListener>;
  /** The live subscription, or the attempt making it, for the current generation. */
  live: Promise<EventSubscription | null> | null;
};

function viewerId(viewer: Viewer): string {
  return viewer.kind === 'user' ? `user:${viewer.userId}` : 'anonymous';
}

/** Builds the coordinator. Nothing happens until `start`. */
export function createSyncCoordinator({
  queryClient,
  events,
  viewer: viewerSource,
  appState,
  synchronizer = createEventSynchronizer(queryClient),
}: SyncCoordinatorOptions): SyncCoordinator {
  const watched = new Map<string, Watched>();
  let viewer = viewerSource.getViewer();
  let connection: ConnectionState = 'disconnected';
  // Incremented whenever every subscription ends: events and acknowledgements carrying an older
  // generation are ignored, so nothing from a previous identity, connection or world applies.
  let generation = 0;
  let started = false;
  let disposed = false;
  const stops: (() => void)[] = [];

  const canSubscribe = (request: SubscriptionRequest) => request.kind === 'nearby' || viewer.kind === 'user';

  function subscribe(entry: Watched) {
    if (disposed || connection !== 'connected' || !canSubscribe(entry.request)) return;
    const made = generation;
    const forViewer = viewer;
    entry.live = events
      .subscribe(entry.request, (event) => {
        if (made === generation) synchronizer.apply(event, forViewer);
      })
      .then(
        (subscription) => {
          // Released, or every subscription ended, while the acknowledgement was on its way.
          if (made !== generation || watched.get(keyOf(entry.request)) !== entry) {
            void subscription.unsubscribe();
            return null;
          }
          readAgainCovered(entry.request, forViewer);
          return subscription;
        },
        (error: unknown) => {
          if (made === generation) {
            entry.live = null;
            const failure = toDataError(error);
            for (const listener of entry.onError) listener(failure);
          }
          return null;
        },
      );
  }

  /**
   * A change between a private read and its subscription's acknowledgement reaches nobody, so
   * once a `user` or `group` subscription is live, the reads it keeps current are read again.
   * Nearby subscriptions need none: each viewport's read starts with the subscription.
   */
  function readAgainCovered(request: SubscriptionRequest, forViewer: Viewer) {
    if (forViewer.kind !== 'user') return;
    if (request.kind === 'group') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.group(forViewer, request.groupId) });
    } else if (request.kind === 'user') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ownRequest(forViewer) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser(forViewer) });
    }
  }

  function unsubscribe(entry: Watched) {
    const live = entry.live;
    entry.live = null;
    void live?.then((subscription) => subscription?.unsubscribe());
  }

  /** Ends every subscription and drops whatever they still deliver. */
  function endAll() {
    generation += 1;
    for (const entry of watched.values()) unsubscribe(entry);
  }

  function subscribeAll() {
    for (const entry of watched.values()) if (entry.live === null) subscribe(entry);
  }

  function onViewerChange() {
    const next = viewerSource.getViewer();
    if (viewerId(next) === viewerId(viewer)) return;
    const previous = viewer;
    viewer = next;
    endAll();
    synchronizer.reset();
    if (previous.kind === 'user') {
      // The previous rider's private reads: cancelled first, so a read in flight cannot settle
      // into the cache, then removed. Public reads (place search) stay.
      const scope = queryKeys.viewer(previous);
      void queryClient.cancelQueries({ queryKey: scope });
      queryClient.removeQueries({ queryKey: scope });
    }
    subscribeAll();
  }

  function onConnection(next: ConnectionState) {
    const previous = connection;
    connection = next;
    onlineManager.setOnline(next === 'connected');
    if (next === 'disconnected') {
      // The source ended every subscription with the connection.
      endAll();
      return;
    }
    if (previous === 'disconnected') {
      subscribeAll();
      // Anything may have changed while disconnected: read what is on screen again.
      void queryClient.invalidateQueries({ queryKey: queryKeys.viewer(viewer) });
    }
  }

  return {
    synchronizer,

    start() {
      if (started || disposed) return;
      started = true;
      focusManager.setEventListener((setFocused) => {
        const subscription = appState.addEventListener('change', (state) => setFocused(state === 'active'));
        return () => subscription.remove();
      });
      onlineManager.setEventListener(() => undefined);
      stops.push(viewerSource.subscribe(onViewerChange));
      onViewerChange();
      // Reports the current state at once, which subscribes everything watched so far.
      stops.push(events.watchConnection(onConnection));
    },

    watch(request, onError) {
      const key = keyOf(request);
      let entry = watched.get(key);
      if (!entry) {
        entry = { request, holders: 0, onError: new Set(), live: null };
        watched.set(key, entry);
        subscribe(entry);
      }
      entry.holders += 1;
      if (onError) entry.onError.add(onError);
      const held = entry;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        held.holders -= 1;
        if (onError) held.onError.delete(onError);
        if (held.holders > 0) return;
        watched.delete(key);
        unsubscribe(held);
      };
    },

    resetWorld() {
      endAll();
      synchronizer.reset();
      subscribeAll();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      endAll();
      watched.clear();
      for (const stop of stops.splice(0)) stop();
      synchronizer.dispose();
      if (started) {
        focusManager.setEventListener(() => undefined);
        onlineManager.setOnline(true);
      }
    },
  };
}

/** Equal requests share one subscription; the request is small, plain JSON. */
function keyOf(request: SubscriptionRequest): string {
  return JSON.stringify(request);
}
