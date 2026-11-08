import type { OwnRideRequestDto } from '@ride-match/contracts';
import { useQuery } from '@tanstack/react-query';

import { useDataSource } from '../../data/DataSourceProvider';
import { ownRequestQuery } from '../../data/queries';
import { useViewer } from '../auth/AuthSessionProvider';

/**
 * The signed-in rider's current or latest request (`GET /me/ride-request`), or `null` when
 * anonymous, before the read answers, or when they never created one. A failed read also gives
 * `null` here: callers that act on it (the review) read it themselves and handle the failure.
 */
export function useOwnRequest(): OwnRideRequestDto | null {
  const dataSource = useDataSource();
  const viewer = useViewer();
  const query = useQuery({
    ...ownRequestQuery(dataSource, viewer.kind === 'user' ? viewer : { kind: 'user', userId: '' }),
    enabled: viewer.kind === 'user',
  });
  return viewer.kind === 'user' ? (query.data ?? null) : null;
}

/** Whether a request is live (`active` or `grouped`): one at a time per rider. */
export function isLive(request: OwnRideRequestDto | null): request is OwnRideRequestDto {
  return request !== null && (request.status === 'active' || request.status === 'grouped');
}
