import { QueryClient } from '@tanstack/react-query';

import { isRetryableRead, toDataError } from '../data/errors';

/** Most automatic retries of one failed read. */
export const MAX_READ_RETRIES = 2;

/**
 * Builds the app's Query cache, once per launch.
 *
 * - Reads retry up to {@link MAX_READ_RETRIES} times, and only when a retry may succeed: a lost
 *   answer or a temporarily unavailable source. A refusal, such as `MEMBERSHIP_REQUIRED`, is
 *   shown at once.
 * - Mutations never retry automatically: a change whose outcome is unknown is retried only on
 *   purpose, with the same operation ID, and nothing is queued while offline.
 *
 * The sync coordinator (SYNC-001-B) connects Query's focus to `AppState` and its online state to
 * the data source's connection: reads wait while disconnected and resume on reconnect.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => failureCount < MAX_READ_RETRIES && isRetryableRead(toDataError(error)),
      },
      // A mutation never waits for the connection: Query would otherwise hold it while offline
      // and send it on reconnect, an automatic offline queue the product rules out.
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}
