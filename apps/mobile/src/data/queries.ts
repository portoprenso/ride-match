import type { Id, NearbyQueryInput, SearchPlacesInput } from '@ride-match/contracts';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';

import type { AppDataSource } from './AppDataSource';
import { withDataErrors, type DataError } from './errors';
import { queryKeys, type SignedInViewer, type Viewer } from './queryKeys';

declare module '@tanstack/react-query' {
  interface Register {
    // Query and mutation functions wrap their call in `withDataErrors`, so failures are DataErrors.
    defaultError: DataError;
  }
}

/*
 * Query options for the data source's unpaged reads, for feature hooks to pass to `useQuery`,
 * for example `useQuery(nearbyQuery(useDataSource(), viewer, input))`.
 *
 * Each pairs the read with its key from `queryKeys` and passes Query's abort signal to the
 * data source. Query aborts that signal when a read becomes obsolete, such as the previous
 * viewport's read after the map moves, or a read nothing displays any more, so a late result
 * never replaces a newer one. Failures arrive as `DataError`s.
 */

export function placeSearchQuery(dataSource: AppDataSource, input: SearchPlacesInput) {
  return queryOptions({
    queryKey: queryKeys.placeSearch(input),
    queryFn: ({ signal }) => withDataErrors(dataSource.places.search(input, { signal })),
  });
}

export function nearbyQuery(dataSource: AppDataSource, viewer: Viewer, input: NearbyQueryInput) {
  return queryOptions({
    queryKey: queryKeys.nearby(viewer, input),
    queryFn: ({ signal }) => withDataErrors(dataSource.rides.getNearby(input, { signal })),
  });
}

export function rideQuery(dataSource: AppDataSource, viewer: Viewer, rideId: Id) {
  return queryOptions({
    queryKey: queryKeys.ride(viewer, rideId),
    queryFn: ({ signal }) => withDataErrors(dataSource.rides.getRide(rideId, { signal })),
  });
}

export function groupPreviewQuery(dataSource: AppDataSource, viewer: Viewer, groupId: Id) {
  return queryOptions({
    queryKey: queryKeys.groupPreview(viewer, groupId),
    queryFn: ({ signal }) => withDataErrors(dataSource.groups.getPreview(groupId, { signal })),
  });
}

export function currentUserQuery(dataSource: AppDataSource, viewer: SignedInViewer) {
  return queryOptions({
    queryKey: queryKeys.currentUser(viewer),
    queryFn: ({ signal }) => withDataErrors(dataSource.auth.getCurrentUser({ signal })),
  });
}

export function ownRequestQuery(dataSource: AppDataSource, viewer: SignedInViewer) {
  return queryOptions({
    queryKey: queryKeys.ownRequest(viewer),
    queryFn: ({ signal }) => withDataErrors(dataSource.rides.getOwnRequest({ signal })),
  });
}

export function matchesQuery(dataSource: AppDataSource, viewer: SignedInViewer, rideId: Id) {
  return queryOptions({
    queryKey: queryKeys.matches(viewer, rideId),
    queryFn: ({ signal }) => withDataErrors(dataSource.rides.getMatches(rideId, { signal })),
  });
}

export function groupDetailQuery(dataSource: AppDataSource, viewer: SignedInViewer, groupId: Id) {
  return queryOptions({
    queryKey: queryKeys.groupDetail(viewer, groupId),
    queryFn: ({ signal }) => withDataErrors(dataSource.groups.getGroup(groupId, { signal })),
  });
}

/** How many messages each chat history page asks for: enough to fill a screen and a little more. */
export const CHAT_PAGE_SIZE = 30;

/**
 * A group's chat history as Query pages (`GET /groups/{groupId}/messages`): the first page is the
 * latest messages, and each next page the older ones before it, read with the previous page's
 * `olderCursor` until the source says nothing is older. Pages hold the source's messages as
 * they came; the screen merges them by message ID and orders them by sequence.
 *
 * A `chat.message.created` event invalidates the key, which reads the latest page again and
 * the older pages from the fresh cursors (catch-up after a gap arrives with CHAT-001-C).
 */
export function chatHistoryQuery(dataSource: AppDataSource, viewer: SignedInViewer, groupId: Id) {
  return infiniteQueryOptions({
    queryKey: queryKeys.chatHistory(viewer, groupId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      withDataErrors(
        dataSource.chat.getHistory(
          groupId,
          pageParam === null ? { limit: CHAT_PAGE_SIZE } : { beforeCursor: pageParam, limit: CHAT_PAGE_SIZE },
          { signal },
        ),
      ),
    getNextPageParam: (page) => page.olderCursor ?? undefined,
  });
}

/** How many blocked riders each block-list page asks for (at most `SAFETY_POLICY.maxBlockListPageSize`). */
export const BLOCK_PAGE_SIZE = 20;

/**
 * The viewer's block list as Query pages (`GET /me/blocks`), newest block first, each next page
 * read with the previous page's `nextCursor`. A block or unblock shifts later pages, so both
 * invalidate the key, which reads the pages again from the first.
 */
export function blockListQuery(dataSource: AppDataSource, viewer: SignedInViewer) {
  return infiniteQueryOptions({
    queryKey: queryKeys.blockList(viewer),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      withDataErrors(
        dataSource.safety.listBlocks(
          pageParam === null ? { limit: BLOCK_PAGE_SIZE } : { cursor: pageParam, limit: BLOCK_PAGE_SIZE },
          { signal },
        ),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
