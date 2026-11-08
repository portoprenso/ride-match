import type { BlockUserResultDto } from '@ride-match/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { queryKeys, type SignedInViewer } from '../../data/queryKeys';

/**
 * Brings the viewer's reads in line after a block or unblock: the block list is read again from
 * its first page, and discovery and matches are reread, since a block hides each rider from the
 * other both ways and an unblock lets them pair again (no event announces an unblock).
 */
export function refreshAfterBlockChange(queryClient: QueryClient, viewer: SignedInViewer): void {
  const scope = queryKeys.viewer(viewer);
  void queryClient.invalidateQueries({ queryKey: queryKeys.blockList(viewer) });
  void queryClient.invalidateQueries({ queryKey: [...scope, 'nearby'] });
  void queryClient.invalidateQueries({ queryKey: [...scope, 'matches'] });
}

/**
 * Applies a block's leave, like an ordinary leave: the group's private reads (detail and chat)
 * are removed at once, so nothing from it can show again, and the viewer's request is the
 * cancelled one the source returned. Nothing happens when the block left no group.
 */
export function applyBlockLeave(queryClient: QueryClient, viewer: SignedInViewer, result: BlockUserResultDto): void {
  const left = result.leftGroup;
  if (left === null) return;
  void queryClient.cancelQueries({ queryKey: queryKeys.group(viewer, left.groupId) });
  queryClient.removeQueries({ queryKey: queryKeys.group(viewer, left.groupId) });
  queryClient.setQueryData(queryKeys.ownRequest(viewer), left.rideRequest);
  void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser(viewer) });
}
