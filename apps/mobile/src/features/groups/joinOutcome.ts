import { GROUP_POLICY, type NearbyItemDto } from '@ride-match/contracts';

import type { DataError } from '../../data/errors';
import { departureText } from '../discovery/nearbyItems';

/**
 * What a refused or unanswered join means for the confirmation (designs 29, 30 and 55). The
 * source checks everything again when the join arrives, so each answer describes the target or
 * the rider's request as they are now, never what the rider saw before:
 *
 * - `full`: the last seat went to someone else (`GROUP_FULL`, design 29).
 * - `closed`: the group is ready and stopped taking riders (`GROUP_CLOSED`).
 * - `gone`: the ride or group ended or was removed (`TARGET_UNAVAILABLE`, design 55).
 * - `blocked`: the rider blocked someone in it (`BLOCKED_RELATIONSHIP`).
 * - `grouped`: the rider's request is already in a group (`ALREADY_IN_GROUP`).
 * - `request-ended`: the rider's request expired or ended (`RIDE_EXPIRED`, `INVALID_TRANSITION`).
 * - `sign-in`: the session ended; the session flow takes over.
 * - `unknown`: no answer, or the service was busy: the join may have happened (design 30).
 *   Checking reads the rider's request; retrying resends the same operation ID, which cannot
 *   join twice.
 * - `refused`: anything else; nothing changed.
 *
 * In every case but `unknown` nothing was joined and no seat is held. The rider's own request is
 * left as it was, so one created just before the join stays active.
 */
export type JoinFailure =
  'full' | 'closed' | 'gone' | 'blocked' | 'grouped' | 'request-ended' | 'sign-in' | 'unknown' | 'refused';

export function describeJoinError(error: DataError): JoinFailure {
  switch (error.code) {
    case 'GROUP_FULL':
      return 'full';
    case 'GROUP_CLOSED':
      return 'closed';
    case 'TARGET_UNAVAILABLE':
      return 'gone';
    case 'BLOCKED_RELATIONSHIP':
      return 'blocked';
    case 'ALREADY_IN_GROUP':
      return 'grouped';
    case 'RIDE_EXPIRED':
    case 'INVALID_TRANSITION':
      return 'request-ended';
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return 'sign-in';
    case 'SERVICE_UNAVAILABLE':
      return 'unknown';
    case null:
      return error.kind === 'network' ? 'unknown' : 'refused';
    default:
      return 'refused';
  }
}

/** The words of the join confirmation (design 12) for a target the source has just confirmed. */
export type JoinPlan = {
  /** "Join Aida" for a solo rider, "Join this group" for a group. */
  action: string;
  headline: string;
  summary: string;
  /** Such as "2 people after joining". */
  occupancy: string;
  departure: string;
  /** Who coordinates after joining, when the confirmation can say so from public data. */
  coordinator: string | null;
};

/**
 * Describes joining `item`. A solo ride forms a group of two that its rider coordinates; a group
 * gains one member. Only public fields are used: the rider's display name, the destination, the
 * departure and the group's member count.
 */
export function describeJoinPlan(item: NearbyItemDto, now: number): JoinPlan {
  const departure = departureText(item.departureAt, now);
  if (item.kind === 'ride') {
    const name = item.user.displayName;
    return {
      action: `Join ${name}`,
      headline: 'Start a group together.',
      summary: `You and ${name} are heading towards ${item.destination.label}.`,
      occupancy: '2 people after joining',
      departure,
      coordinator: `${name} becomes the coordinator`,
    };
  }
  const after = Math.min(item.memberCount + 1, GROUP_POLICY.capacity);
  return {
    action: 'Join this group',
    headline: 'Join this group.',
    summary: `The group is heading towards ${item.destination.label}.`,
    occupancy: `${after} ${after === 1 ? 'person' : 'people'} after joining`,
    departure,
    coordinator: null,
  };
}
