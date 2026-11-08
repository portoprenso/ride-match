import type { CoordinatesDto } from '@ride-match/contracts';

import { distanceMeters } from './geometry';
import type { Schedule } from './lifecycle';
import { CURATED_PLACES } from './places';
import { groupChanged, nearbyUpserted, toNearbyItemDto } from './serializers';
import type { WorkContext } from './simulator';
import { isLiveGroup, type GroupRecord, type MeetingPointRecord, type MockWorld } from './world';

/*
 * Meeting points (docs/api/groups.md, "Meeting points"; MEETING-001-A). The source suggests one
 * shared public place for each group and may replace or withdraw it. The mock picks from the
 * curated catalog by straight-line distance; it never optimizes a point or computes a route.
 *
 * Update policy:
 *
 * - **Supply:** `MEETING_POINT_DELAY_MS` after a group forms (or after activation, for a seeded
 *   live group without one), the curated place nearest the group's public area that is not its
 *   destination, labelled as its main entrance.
 * - **Replace:** another curated place, the next nearest, with a new point ID.
 * - **Withdraw:** the point becomes `null`.
 * - A change raises the group's version and tells its members (`group.changed`,
 *   `meeting_point_changed`). A ready group returns to forming, so its coordinator must confirm
 *   the new point (or wait for one) by marking it ready again; discovery shows the new status.
 * - Closed groups never change. The point stays member-only: it is never in a preview or a
 *   public event.
 */

type Context = WorkContext<MockWorld>;

/** How long after a group forms the source suggests its meeting point. */
export const MEETING_POINT_DELAY_MS = 10_000;

/**
 * The suggested point for `group`: the curated place nearest its public area (never anyone's
 * exact location), excluding its destination and any place in `exclude`. `null` when none is
 * left.
 */
function suggestPoint(
  context: Context,
  group: GroupRecord,
  exclude: readonly CoordinatesDto[],
): MeetingPointRecord | null {
  const centre = group.publicOrigin.center;
  const candidates = CURATED_PLACES.filter(
    (place) =>
      place.id !== group.destinationPlaceId &&
      !exclude.some(
        (taken) => taken.latitude === place.coordinates.latitude && taken.longitude === place.coordinates.longitude,
      ),
  ).sort((first, second) => distanceMeters(centre, first.coordinates) - distanceMeters(centre, second.coordinates));
  const place = candidates[0];
  if (place === undefined) return null;
  return {
    id: context.ids.next('meeting'),
    coordinates: { latitude: place.coordinates.latitude, longitude: place.coordinates.longitude },
    label: `${place.label} · main entrance`,
  };
}

/**
 * Sets a live group's meeting point to `next` (a new point, or `null` to withdraw it), applying
 * the update policy above. Does nothing for an unknown or closed group, or when nothing changes.
 */
function setMeetingPoint(context: Context, group: GroupRecord, next: MeetingPointRecord | null): void {
  if (!isLiveGroup(group)) return;
  if (group.meetingPoint === null && next === null) return;
  group.meetingPoint = next;
  group.version += 1;
  const reopened = group.status === 'ready';
  if (reopened) group.status = 'forming';
  if (reopened) {
    context.emit(
      nearbyUpserted(context.eventEnvelope(), toNearbyItemDto(context.state, { kind: 'group', record: group })),
    );
  }
  context.emit(groupChanged(context.eventEnvelope(), group, 'meeting_point_changed'));
}

/** Supplies the first suggested point, unless the group already has one or has closed. */
export function supplyMeetingPoint(context: Context, groupId: string): void {
  const group = context.state.groups.get(groupId);
  if (group === undefined || group.meetingPoint !== null) return;
  setMeetingPoint(context, group, suggestPoint(context, group, []));
}

/** Replaces the current point with the next nearest place, under a new ID (or supplies one). */
export function replaceMeetingPoint(context: Context, groupId: string): void {
  const group = context.state.groups.get(groupId);
  if (group === undefined) return;
  const current = group.meetingPoint === null ? [] : [group.meetingPoint.coordinates];
  const next = suggestPoint(context, group, current);
  if (next !== null) setMeetingPoint(context, group, next);
}

/** Withdraws the point: it becomes `null`, and a ready group returns to forming. */
export function withdrawMeetingPoint(context: Context, groupId: string): void {
  const group = context.state.groups.get(groupId);
  if (group !== undefined) setMeetingPoint(context, group, null);
}

/** Schedules the first point for a group that has just formed. */
export function scheduleMeetingPoint(context: Context, groupId: string): void {
  context.schedule(context.now + MEETING_POINT_DELAY_MS, (later) => supplyMeetingPoint(later, groupId));
}

/** Schedules a point for every seeded live group without one, counted from activation. */
export function scheduleSeededMeetingPoints(world: MockWorld, schedule: Schedule): void {
  for (const group of world.groups.values()) {
    if (isLiveGroup(group) && group.meetingPoint === null) {
      schedule(world.activatedAt + MEETING_POINT_DELAY_MS, (context) => supplyMeetingPoint(context, group.id));
    }
  }
}
