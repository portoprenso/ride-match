import type { GroupStatus, RideGroupDto } from '@ride-match/contracts';

import type { DataError } from '../../data/errors';

/** A status change the coordinator can ask for (`PATCH /groups/{groupId}/status`). */
export type StatusChange = Extract<GroupStatus, 'ready' | 'forming' | 'completed' | 'cancelled'>;

/**
 * The lifecycle controls a member sees for the group's current status (designs 13, 16, 32, 49):
 *
 * - Only the coordinator gets status changes. While forming: "Mark group ready", enabled only
 *   with a meeting point (`needsPoint` says why it is disabled), and "Cancel group". While ready:
 *   "Reopen group for joining", "Mark group complete" and "Cancel group".
 * - Every member of a live group, the coordinator included, may leave.
 * - A closed group offers nothing.
 *
 * The source checks role, status, version and the point again; these only decide what to show.
 */
export type GroupControls = {
  changes: StatusChange[];
  /** "Mark group ready" is shown but disabled: the group has no meeting point yet. */
  needsPoint: boolean;
  canLeave: boolean;
};

export function groupControls(group: RideGroupDto, viewerId: string): GroupControls {
  const live = group.status === 'forming' || group.status === 'ready';
  const coordinator = live && group.coordinatorId === viewerId;
  if (!coordinator) return { changes: [], needsPoint: false, canLeave: live };
  if (group.status === 'forming') {
    return {
      changes: group.meetingPoint === null ? ['cancelled'] : ['ready', 'cancelled'],
      needsPoint: group.meetingPoint === null,
      canLeave: true,
    };
  }
  return { changes: ['forming', 'completed', 'cancelled'], needsPoint: false, canLeave: true };
}

/** The button for each change. */
export const CHANGE_LABELS: Record<StatusChange, string> = {
  ready: 'Mark group ready',
  forming: 'Reopen group for joining',
  completed: 'Mark group complete',
  cancelled: 'Cancel group',
};

/**
 * What a refused or unanswered status change or leave means:
 *
 * - `revoked`: the viewer is no longer a member (`MEMBERSHIP_REQUIRED`, `HISTORY_EXPIRED`): the
 *   group's private data must leave the screen (design 37).
 * - `reread`: the group changed under the viewer (`VERSION_CONFLICT`, `INVALID_TRANSITION`,
 *   `GROUP_CLOSED`, `FORBIDDEN` after a role change): read it again and show the current state;
 *   nothing was changed.
 * - `retry`: no answer, or the service was busy: the change may have happened. Retrying resends
 *   the same operation ID, which cannot apply it twice.
 * - `sign-in`: the session ended.
 */
export type ActionFailure = { kind: 'revoked' | 'reread' | 'retry' | 'sign-in'; message: string };

export function describeActionError(error: DataError): ActionFailure {
  switch (error.code) {
    case 'MEMBERSHIP_REQUIRED':
    case 'HISTORY_EXPIRED':
      return { kind: 'revoked', message: 'You no longer have access to this group.' };
    case 'VERSION_CONFLICT':
      return { kind: 'reread', message: 'The group changed. Check it, then try again.' };
    case 'INVALID_TRANSITION':
      return { kind: 'reread', message: 'The group can’t change to that right now. Check it, then try again.' };
    case 'GROUP_CLOSED':
      return { kind: 'reread', message: 'This group has already closed.' };
    case 'FORBIDDEN':
      return { kind: 'reread', message: 'Only the coordinator can do that.' };
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return { kind: 'sign-in', message: 'Your session ended. Sign in again to continue.' };
    default:
      return {
        kind: 'retry',
        message: 'We couldn’t confirm the change. Try again: it won’t be applied twice.',
      };
  }
}

/** Why a closed group ended, in the words of design 18; the reason never says anyone blocked anyone. */
export function describeClosure(group: RideGroupDto): { title: string; headline: string; body: string } {
  switch (group.closure?.reason) {
    case 'completed':
      return {
        title: 'Group completed',
        headline: 'Thanks for going along.',
        body: 'The coordinator marked this group complete.',
      };
    case 'coordinator_cancelled':
      return { title: 'Group cancelled', headline: 'This group was cancelled.', body: 'The coordinator cancelled it.' };
    case 'expired':
      return {
        title: 'Group closed',
        headline: 'This group expired.',
        body: 'Its time ran out before it was completed.',
      };
    case 'members_left':
      return {
        title: 'Group closed',
        headline: 'This group closed.',
        body: 'Everyone else left, so the group couldn’t continue.',
      };
    default:
      return { title: 'Group closed', headline: 'This group has closed.', body: '' };
  }
}
