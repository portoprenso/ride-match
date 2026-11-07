import { NEARBY_POLICY, type NearbyQueryInput, type NearbySnapshotDto } from '@ride-match/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { Region } from 'react-native-maps';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { countBucket } from '../../analytics/events';
import type { ConnectionState } from '../../data/AppDataSource';
import { useDataSource } from '../../data/DataSourceProvider';
import type { DataError } from '../../data/errors';
import { nearbyQuery } from '../../data/queries';
import { useEventSubscription } from '../../data/SyncProvider';
import { useConnectionState } from '../../data/useConnectionState';
import { useViewer } from '../auth/AuthSessionProvider';
import { toViewport } from './viewport';

/**
 * What home can honestly say about nearby activity (screens 02, 23, 24, 25 and 54):
 *
 * - `too-wide`: the map shows more than discovery reads; nothing was read.
 * - `loading`: the first read for this view is on its way; this is not an empty area.
 * - `offline`: nothing was read yet and the connection is down, so reads wait for it.
 * - `failed`: this view's read failed, with no snapshot of it; nobody can say whether anyone is
 *   nearby. `unsupported` when the view is outside the covered area.
 * - `active` / `empty`: a fresh snapshot with items, or with none. `updating` while a moved view
 *   is being read and the previous view's snapshot is still shown.
 * - `stale`: the last snapshot is shown but cannot be refreshed (offline, or this view's refresh
 *   failed); `updatedAt` is when it was last true. Moving the map while offline keeps showing the
 *   last view this way, since the new view's read waits for the connection.
 */
export type DiscoveryState =
  | { kind: 'too-wide' }
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'failed'; unsupported: boolean }
  | { kind: 'active'; snapshot: NearbySnapshotDto; updating: boolean }
  | { kind: 'empty'; updating: boolean }
  | { kind: 'stale'; snapshot: NearbySnapshotDto; updatedAt: number; offline: boolean };

type DiscoveryInputs = {
  viewportReadable: boolean;
  connection: ConnectionState;
  data: NearbySnapshotDto | undefined;
  /** The shown snapshot belongs to the previous view while this one is read. */
  placeholder: boolean;
  error: DataError | null;
  updatedAt: number;
};

/** The discovery state for a read's current values; pure, so every combination is testable. */
export function describeDiscovery({
  viewportReadable,
  connection,
  data,
  placeholder,
  error,
  updatedAt,
}: DiscoveryInputs): DiscoveryState {
  if (!viewportReadable) return { kind: 'too-wide' };
  // A failure with no snapshot of this view, or while the previous view's snapshot stands in for
  // it, is about this view: say it failed, never "nobody nearby" and never the other view's items.
  if (error !== null && (data === undefined || placeholder)) {
    return { kind: 'failed', unsupported: error.code === 'UNSUPPORTED_AREA' };
  }
  if (data === undefined) return connection === 'disconnected' ? { kind: 'offline' } : { kind: 'loading' };
  // A snapshot that can no longer be refreshed is shown as the last view, never as current.
  if (connection === 'disconnected' || error !== null) {
    return { kind: 'stale', snapshot: data, updatedAt, offline: connection === 'disconnected' };
  }
  return data.items.length > 0
    ? { kind: 'active', snapshot: data, updating: placeholder }
    : { kind: 'empty', updating: placeholder };
}

/**
 * Nearby public activity for the visible map region, kept current while it is on screen.
 *
 * - The region becomes a coarse viewport (`toViewport`); each viewport is its own Query read,
 *   so a read for a view the user moved away from is aborted and can never replace the newer
 *   one. While a moved view is read, the previous snapshot stays shown as `updating`.
 * - A nearby subscription for the same viewport keeps the snapshot current (SYNC-001); it moves
 *   with the viewport and ends with the screen.
 * - Nothing here moves the camera.
 * - Analytics: `nearby_activity_exposed` is tracked when a read for the current view completes
 *   while connected (a fresh snapshot, never a placeholder, stale or failed one), with the
 *   count's bucket and whether the source truncated the list. Realtime updates do not count as
 *   new exposures.
 *
 * @param region The visible map region, or `null` while there is no map to read for.
 */
export function useNearbyDiscovery(region: Readonly<Region> | null): DiscoveryState & { retry: () => void } {
  const dataSource = useDataSource();
  const viewer = useViewer();
  const analytics = useAnalytics();
  const connection = useConnectionState();
  const viewport = region === null ? null : toViewport(region);
  const input: NearbyQueryInput | null = viewport === null ? null : { viewport, limit: NEARBY_POLICY.maxItems };

  const query = useQuery({
    // A disabled read still needs options; this input is never sent.
    ...nearbyQuery(dataSource, viewer, input ?? UNUSED_INPUT),
    enabled: input !== null,
    placeholderData: keepPreviousData,
  });
  useEventSubscription(viewport === null ? null : { kind: 'nearby', viewport });

  // One exposure per completed read for the current view, not per render or realtime patch.
  const wasFetching = useRef(false);
  const fetching = query.fetchStatus === 'fetching';
  useEffect(() => {
    const finished = wasFetching.current && !fetching;
    wasFetching.current = fetching;
    if (!finished || query.isPlaceholderData || query.isError || connection !== 'connected') return;
    const snapshot = query.data;
    if (snapshot === undefined) return;
    analytics.track('nearby_activity_exposed', {
      countBucket: countBucket(snapshot.items.length),
      truncated: snapshot.truncated,
    });
  }, [fetching, query.data, query.isPlaceholderData, query.isError, connection, analytics]);

  const state = describeDiscovery({
    viewportReadable: viewport !== null,
    connection,
    data: query.data,
    placeholder: query.isPlaceholderData,
    error: query.error,
    updatedAt: query.dataUpdatedAt,
  });
  return { ...state, retry: () => void query.refetch() };
}

const UNUSED_INPUT: NearbyQueryInput = {
  viewport: { southWest: { latitude: 0, longitude: 0 }, northEast: { latitude: 0.01, longitude: 0.01 } },
  limit: 1,
};
