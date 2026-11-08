import type { OwnRideRequestDto, RideMatchDto } from '@ride-match/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { useDataSource } from '../../data/DataSourceProvider';
import { matchesQuery } from '../../data/queries';
import { useViewer } from '../auth/AuthSessionProvider';
import { itemKey } from '../discovery/nearbyItems';

/**
 * The supplied matches of the rider's active request (`GET /rides/{rideId}/matches`), best first,
 * or `null` without an active request. `matches.changed` makes the read refresh (SYNC-001). A
 * match whose `expiresAt` the device has passed is dropped at once, before the source announces
 * it; the device never extends or invents one.
 *
 * Analytics: `match_found` once per match per set version, with its level and target kind.
 *
 * @param now Device time, to drop matches whose time is up.
 */
export function useOwnMatches(request: OwnRideRequestDto | null, now: number): readonly RideMatchDto[] | null {
  const dataSource = useDataSource();
  const viewer = useViewer();
  const analytics = useAnalytics();
  const active = viewer.kind === 'user' && request !== null && request.status === 'active';
  const query = useQuery({
    ...matchesQuery(dataSource, viewer.kind === 'user' ? viewer : { kind: 'user', userId: '' }, request?.id ?? ''),
    enabled: active,
  });
  const set = active ? query.data : undefined;
  useEffect(() => {
    if (set === undefined || request === null) return;
    for (const match of set.matches) {
      analytics.trackOnce(`match_found:${request.id}:${set.version}:${itemKey(match.target)}`, 'match_found', {
        level: match.level,
        kind: match.target.kind,
      });
    }
  }, [analytics, set, request]);
  if (!active) return null;
  return (set?.matches ?? []).filter((match) => Date.parse(match.expiresAt) > now);
}
