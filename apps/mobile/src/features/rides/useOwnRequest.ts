import type { OwnRideRequestDto } from '@ride-match/contracts';
import { useQuery } from '@tanstack/react-query';

import { useDataSource } from '../../data/DataSourceProvider';
import { ownRequestQuery } from '../../data/queries';
import { useEventSubscription } from '../../data/SyncProvider';
import { useViewer } from '../auth/AuthSessionProvider';

const USER_EVENTS = { kind: 'user' } as const;

/**
 * The signed-in rider's current or latest request (`GET /me/ride-request`), kept current: a
 * `user` subscription delivers `ride.changed`, which makes the read refresh (SYNC-001), and Query
 * reads it again on foreground return. `request` is `null` when anonymous, before the read
 * answers, or when they never created one; a failed read keeps the last answer. `refresh` reads
 * it again, for a deadline the device saw pass. `known` is whether the source has answered for
 * this rider yet, so `null` can be told apart from "not read yet".
 */
export function useOwnRequest(): { request: OwnRideRequestDto | null; known: boolean; refresh: () => void } {
  const dataSource = useDataSource();
  const viewer = useViewer();
  const signedIn = viewer.kind === 'user';
  const query = useQuery({
    ...ownRequestQuery(dataSource, signedIn ? viewer : { kind: 'user', userId: '' }),
    enabled: signedIn,
  });
  useEventSubscription(signedIn ? USER_EVENTS : null);
  return {
    request: signedIn ? (query.data ?? null) : null,
    known: signedIn && query.data !== undefined,
    refresh: () => void query.refetch(),
  };
}

/** Whether a request is live (`active` or `grouped`): one at a time per rider. */
export function isLive(request: OwnRideRequestDto | null): request is OwnRideRequestDto {
  return request !== null && (request.status === 'active' || request.status === 'grouped');
}

/**
 * What home's request card shows (screens 10 and 27):
 *
 * - `searching`: active, with whole seconds left in the source's search window.
 * - `ending`: still active on the source, but the device saw the deadline pass: no action is
 *   offered while the source's expiry is read (a background return lands here first).
 * - `grouped`: it joined a group; group screens come with GROUP-002.
 * - `expired`: the source ended the search window (27).
 * - `none`: nothing to show: no request, or one cancelled or completed.
 *
 * @param now Device time; the countdown is presentation only, the source's status decides.
 */
export type OwnRequestState =
  | { kind: 'searching'; request: OwnRideRequestDto; secondsLeft: number }
  | { kind: 'ending'; request: OwnRideRequestDto }
  | { kind: 'grouped'; request: OwnRideRequestDto }
  | { kind: 'expired'; request: OwnRideRequestDto }
  | { kind: 'none' };

export function describeOwnRequest(request: OwnRideRequestDto | null, now: number): OwnRequestState {
  if (request === null) return { kind: 'none' };
  switch (request.status) {
    case 'active': {
      const secondsLeft = Math.ceil((Date.parse(request.expiresAt) - now) / 1000);
      return secondsLeft > 0 ? { kind: 'searching', request, secondsLeft } : { kind: 'ending', request };
    }
    case 'grouped':
      return { kind: 'grouped', request };
    case 'expired':
      return { kind: 'expired', request };
    case 'cancelled':
    case 'completed':
      return { kind: 'none' };
  }
}

/** "14:32" minutes and seconds, for the search window's countdown. */
export function formatCountdown(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60);
  return `${minutes}:${String(secondsLeft % 60).padStart(2, '0')}`;
}
