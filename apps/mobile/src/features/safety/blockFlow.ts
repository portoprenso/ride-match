import type { RideGroupDto } from '@ride-match/contracts';

import type { DataError } from '../../data/errors';

/** What the block confirmation (design 43) says, from where the viewer met the rider. */
export type BlockConsequences = {
  /** Whether blocking also makes the viewer leave a live group they share with the rider. */
  leaves: boolean;
  title: string;
  message: string;
  /** The danger note for a block-and-leave: the viewer's request and private access end. */
  warning: string | null;
  /** What happens to the group, or to a closed group's history; `null` when nothing is shared. */
  detail: string | null;
  confirmLabel: string;
};

/**
 * The consequences of blocking `targetId`, as the confirmation explains them before anything is
 * sent. `group` is the group where the viewer met the rider, or `null` outside a group.
 *
 * - **A live group both are in:** block and leave. With only the two of them, the group closes
 *   when the viewer leaves; otherwise the others stay, and a leaving coordinator hands over to
 *   the earliest remaining member. The others are never told about the block.
 * - **A closed group:** the block changes nothing in it; its read-only history stays until it
 *   expires.
 * - **No shared group:** only future pairing is affected.
 *
 * The source decides what actually happens; this only words what the contract promises.
 */
export function describeBlockConsequences(
  group: RideGroupDto | null,
  viewerId: string,
  target: { id: string; displayName: string },
): BlockConsequences {
  const live = group !== null && (group.status === 'forming' || group.status === 'ready');
  const shared =
    group !== null &&
    group.members.some((entry) => entry.user.id === viewerId) &&
    group.members.some((entry) => entry.user.id === target.id);
  const message = 'You won’t be paired with this rider while signed in.';

  if (live && shared) {
    const others = group.members.length - 1;
    const detail =
      others <= 1
        ? 'Only the two of you are in this group, so it closes when you leave.'
        : group.coordinatorId === viewerId
          ? 'Other members stay in the group, and the earliest remaining member becomes coordinator.'
          : 'Other members stay in the group. The normal leave and coordinator rules still apply.';
    return {
      leaves: true,
      title: 'Block and leave this group?',
      message,
      warning:
        'Because you share a group, blocking also removes you from it and cancels your request. Your access to private chat ends immediately.',
      detail,
      confirmLabel: 'Block and leave',
    };
  }
  return {
    leaves: false,
    title: `Block ${target.displayName}?`,
    message,
    warning: null,
    detail: shared ? 'This closed group isn’t changed. Its read-only history stays until it expires.' : null,
    confirmLabel: `Block ${target.displayName}`,
  };
}

/**
 * What a failed block means for the viewer:
 *
 * - `unknown`: no answer, or the service was busy. The block may have been made, so nothing
 *   claims either way; confirming again resends the same operation ID, which returns the
 *   original result (its leave included) instead of blocking twice.
 * - `rejected`: the source refused it, so nothing changed; the next attempt is a new operation.
 */
export type BlockFailure = { kind: 'unknown' | 'rejected'; message: string };

export function describeBlockError(error: DataError): BlockFailure {
  switch (error.code) {
    case 'VALIDATION_FAILED':
    case 'IDEMPOTENCY_CONFLICT':
      return { kind: 'rejected', message: 'This rider can’t be blocked.' };
    case 'NOT_FOUND':
      return { kind: 'rejected', message: 'This rider is no longer available.' };
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return { kind: 'rejected', message: 'Your session ended. Sign in again to block this rider.' };
    default:
      return {
        kind: 'unknown',
        message: 'We couldn’t confirm the block. Try again; it won’t be applied twice.',
      };
  }
}
