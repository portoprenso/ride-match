import type { Id, NearbyQueryInput, SearchPlacesInput } from '@ride-match/contracts';

/** A signed-in reader, identified by their user ID. */
export type SignedInViewer = { kind: 'user'; userId: Id };

/**
 * Who a read is for. Most results depend on it: discovery hides the viewer's own request and
 * anyone either side blocked, and private reads exist only for a signed-in user.
 */
export type Viewer = { kind: 'anonymous' } | SignedInViewer;

/** The viewer before anyone signs in. */
export const ANONYMOUS_VIEWER: Viewer = { kind: 'anonymous' };

function viewerScope(viewer: Viewer) {
  return viewer.kind === 'user' ? (['viewer', 'user', viewer.userId] as const) : (['viewer', 'anonymous'] as const);
}

/**
 * Query keys for every data-source read. Each key holds the parameters that change the result,
 * so different inputs never share a cache entry.
 *
 * - Keys for results the viewer can change start with the viewer's scope, so one user's cached
 *   results never serve another, or an anonymous reader. Removing `viewer(…)` drops them all
 *   when the identity changes; only `public` keys survive.
 * - `group(…)` is the prefix of everything private about one group (its detail and chat), so
 *   removing it clears that data when access to the group ends.
 * - Keys hold only IDs and coarse inputs, never exact locations, tokens or message text,
 *   because developer tools and logs may show them.
 *
 * Chat history and the block list are paged; their feature cards decide the page parameters,
 * which stay out of these keys.
 */
export const queryKeys = {
  /** Every viewer-scoped key of `viewer`. */
  viewer: (viewer: Viewer) => viewerScope(viewer),
  placeSearch: (input: SearchPlacesInput) => ['public', 'places', 'search', input] as const,
  nearby: (viewer: Viewer, input: NearbyQueryInput) => [...viewerScope(viewer), 'nearby', input] as const,
  ride: (viewer: Viewer, rideId: Id) => [...viewerScope(viewer), 'rides', rideId] as const,
  groupPreview: (viewer: Viewer, groupId: Id) => [...viewerScope(viewer), 'groupPreviews', groupId] as const,
  currentUser: (viewer: SignedInViewer) => [...viewerScope(viewer), 'me'] as const,
  ownRequest: (viewer: SignedInViewer) => [...viewerScope(viewer), 'ownRequest'] as const,
  matches: (viewer: SignedInViewer, rideId: Id) => [...viewerScope(viewer), 'matches', rideId] as const,
  /** Every private key of one group. */
  group: (viewer: SignedInViewer, groupId: Id) => [...viewerScope(viewer), 'groups', groupId] as const,
  groupDetail: (viewer: SignedInViewer, groupId: Id) => [...queryKeys.group(viewer, groupId), 'detail'] as const,
  chatHistory: (viewer: SignedInViewer, groupId: Id) => [...queryKeys.group(viewer, groupId), 'messages'] as const,
  blockList: (viewer: SignedInViewer) => [...viewerScope(viewer), 'blocks'] as const,
};
