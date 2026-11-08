import type { CoordinatesDto, RideGroupDto } from '@ride-match/contracts';

import { isValidTaxiTrip, type TaxiTrip } from '../../platform/taxi/yandexGo';

/*
 * The taxi review (TAXI-001-A; its sheet is TAXI-001-B, design 17): before Yandex Go opens, the
 * rider sees the exact pickup and destination the link will carry. Both come from the group as
 * the source last returned it: the meeting point as pickup, the group's destination as the end.
 * No rider's own location, no stop in between, and nothing the app works out itself.
 *
 * A review belongs to one meeting point: when the point is replaced or withdrawn, or the group is
 * no longer ready, it no longer matches and the rider reviews again (ARCHITECTURE, MEETING-001-B).
 */

/** A labelled point of the review, as shown to the rider. */
export type ReviewedPlace = { label: string; coordinates: CoordinatesDto };

/**
 * What the rider reviewed: the group and meeting point it was for, and the two places. `trip`
 * is what the taxi link carries.
 */
export type TaxiReview = {
  groupId: string;
  meetingPointId: string;
  pickup: ReviewedPlace;
  destination: ReviewedPlace;
  trip: TaxiTrip;
};

/**
 * Why no taxi review can be made:
 *
 * - `not-ready`: the group is forming or closed. Only a ready group opens a taxi.
 * - `no-meeting-point`: a ready group always has one, so this means the read is inconsistent.
 * - `invalid-places`: a coordinate is not a real point.
 * - `same-place`: pickup and destination are under {@link MIN_TRIP_METERS} apart, so the link
 *   would ask for a ride to where the group already stands.
 */
export type TaxiReviewProblem = 'not-ready' | 'no-meeting-point' | 'invalid-places' | 'same-place';

export type TaxiReviewResult = { ok: true; review: TaxiReview } | { ok: false; problem: TaxiReviewProblem };

/** Pickup and destination closer than this are taken as the same place. */
export const MIN_TRIP_METERS = 100;

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance in meters (haversine); only used to tell two places apart. */
export function metersBetween(one: CoordinatesDto, other: CoordinatesDto): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeChange = radians(other.latitude - one.latitude);
  const longitudeChange = radians(other.longitude - one.longitude);
  const a =
    Math.sin(latitudeChange / 2) ** 2 +
    Math.cos(radians(one.latitude)) * Math.cos(radians(other.latitude)) * Math.sin(longitudeChange / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The taxi review for `group` as last read, or why there is none. Checks only what the app can
 * see; the screen reads the group again before reviewing, so a review is never built from a
 * stale read (TAXI-001-B).
 */
export function reviewTaxiTrip(group: RideGroupDto): TaxiReviewResult {
  if (group.status !== 'ready') return { ok: false, problem: 'not-ready' };
  const point = group.meetingPoint;
  if (point === null) return { ok: false, problem: 'no-meeting-point' };
  const trip: TaxiTrip = { pickup: point.coordinates, destination: group.destination.coordinates };
  if (!isValidTaxiTrip(trip)) return { ok: false, problem: 'invalid-places' };
  if (metersBetween(trip.pickup, trip.destination) < MIN_TRIP_METERS) return { ok: false, problem: 'same-place' };
  return {
    ok: true,
    review: {
      groupId: group.id,
      meetingPointId: point.id,
      pickup: { label: point.label, coordinates: point.coordinates },
      destination: { label: group.destination.label, coordinates: group.destination.coordinates },
      trip,
    },
  };
}

function samePoint(one: CoordinatesDto, other: CoordinatesDto): boolean {
  return one.latitude === other.latitude && one.longitude === other.longitude;
}

/**
 * Whether `review` still describes `group`: the same group, still ready, with the same meeting
 * point (by ID and place) and the same destination place. When it doesn't, the review is
 * discarded and the rider reviews the current places before any link opens.
 */
export function isReviewCurrent(review: TaxiReview, group: RideGroupDto): boolean {
  const point = group.meetingPoint;
  return (
    group.id === review.groupId &&
    group.status === 'ready' &&
    point !== null &&
    point.id === review.meetingPointId &&
    samePoint(point.coordinates, review.trip.pickup) &&
    samePoint(group.destination.coordinates, review.trip.destination)
  );
}
