import type { NotificationPayloadDto } from '@ride-match/contracts';
import type { QueryClient } from '@tanstack/react-query';

import type { AppDataSource } from '../../data/AppDataSource';
import { isRetryableRead, toDataError } from '../../data/errors';
import { groupDetailQuery, ownRequestQuery } from '../../data/queries';
import type { SignedInViewer } from '../../data/queryKeys';

/**
 * Where a notification tap leads:
 *
 * - `home`: the map, which shows the rider's active request and its supplied matches.
 * - `group` and `chat`: the group screen, or its chat (opened above the group screen).
 * - `unavailable`: the generic "Plans have changed." screen (46), which names nothing.
 */
export type NotificationDestination =
  { kind: 'home' } | { kind: 'group'; groupId: string } | { kind: 'chat'; groupId: string } | { kind: 'unavailable' };

export const UNAVAILABLE: NotificationDestination = { kind: 'unavailable' };

/**
 * Whether a failed read only says that the source could not answer now (a lost connection, an
 * outage, a rate limit), rather than that the target is gone or not the rider's.
 */
function couldNotCheck(error: unknown): boolean {
  const failure = toDataError(error);
  return isRetryableRead(failure) || failure.code === 'RATE_LIMITED';
}

/**
 * Decides where a valid notification leads, from the source's current answer with the signed-in
 * rider's session (NOTIFICATION-001-C). The payload is a hint, never a grant: it only says what
 * to read.
 *
 * - `matches.available`: the rider's own request is read; only while it is still that request
 *   and still `active` does the tap open the map, where the request card shows the matches the
 *   source supplies now. A replaced, grouped, cancelled or expired request is unavailable.
 * - `group.member_joined` and `group.ready`: the group is read; the screen opens only when the
 *   source lets this rider read it (a closed group within its history shows its closed state).
 * - `chat.message_created`: the same group read decides; the chat then syncs its own history.
 * - A definite refusal (not a member, unknown, expired history, no session) is unavailable, and
 *   nothing from the payload is shown. When the source could not answer at all, the target screen
 *   opens anyway: it reads with the same session, shows nothing it is refused, and offers its
 *   own retry.
 *
 * The reads go through the query cache with the screens' own keys, so the screen that opens
 * starts from the answer just read.
 */
export async function resolveNotification(
  payload: NotificationPayloadDto,
  viewer: SignedInViewer,
  dataSource: AppDataSource,
  queryClient: QueryClient,
): Promise<NotificationDestination> {
  switch (payload.kind) {
    case 'matches.available': {
      try {
        const request = await queryClient.fetchQuery({ ...ownRequestQuery(dataSource, viewer), staleTime: 0 });
        return request !== null && request.id === payload.rideRequestId && request.status === 'active'
          ? { kind: 'home' }
          : UNAVAILABLE;
      } catch (error) {
        return couldNotCheck(error) ? { kind: 'home' } : UNAVAILABLE;
      }
    }
    case 'group.member_joined':
    case 'group.ready':
    case 'chat.message_created': {
      const destination: NotificationDestination =
        payload.kind === 'chat.message_created'
          ? { kind: 'chat', groupId: payload.groupId }
          : { kind: 'group', groupId: payload.groupId };
      try {
        await queryClient.fetchQuery({ ...groupDetailQuery(dataSource, viewer, payload.groupId), staleTime: 0 });
        return destination;
      } catch (error) {
        return couldNotCheck(error) ? destination : UNAVAILABLE;
      }
    }
  }
}
