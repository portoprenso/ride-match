import { LOCATION_POLICY } from '@ride-match/contracts';

import { distanceMeters } from './geometry';
import type { GroupRecord, MockWorld } from './world';

/** A brisk walking pace for the supplied estimate, in metres per minute. */
const WALKING_METERS_PER_MINUTE = 80;

/**
 * The viewer's walking estimate to the group's point, in whole minutes: the straight-line
 * distance from the viewer's own exact origin at a brisk pace, rounded up. A supplied value for
 * this viewer only; `null` without a point, for a viewer who is not a member, or beyond
 * `LOCATION_POLICY.maxWalkingMinutes`. The origin behind it is never returned.
 */
export function walkingMinutes(world: MockWorld, group: GroupRecord, viewerId: string): number | null {
  if (group.meetingPoint === null) return null;
  const member = group.members.find((entry) => entry.userId === viewerId);
  const ride = member === undefined ? undefined : world.rides.get(member.rideRequestId);
  if (ride === undefined) return null;
  const minutes = Math.ceil(
    distanceMeters(ride.origin.coordinates, group.meetingPoint.coordinates) / WALKING_METERS_PER_MINUTE,
  );
  return minutes > LOCATION_POLICY.maxWalkingMinutes ? null : minutes;
}
