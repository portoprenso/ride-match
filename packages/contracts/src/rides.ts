import { z } from 'zod';

import { IdSchema, OperationIdSchema, ResourceVersionSchema, TimestampSchema } from './common.js';
import { ExactLocationInputSchema, OwnerLocationSchema, PublicLocationSchema } from './location.js';
import { PlaceSchema } from './places.js';
import { UserSchema } from './users.js';

/**
 * Ride request rules chosen for the mock MVP (CONTRACT-002-B). The schemas enforce the
 * departure options; the source applies the lifetime (RIDE-001-A). Revisit both before a
 * backend exists.
 */
export const RIDE_POLICY = {
  /** Departure choices in minutes after creation: Now, in 5 and in 10 minutes. */
  departureOffsetsMinutes: [0, 5, 10],
  /** How long an active request stays discoverable after its creation (15 minutes). */
  activeLifetimeSeconds: 900,
} as const;

/**
 * When the rider leaves, as minutes after the request is created: 0 (now), 5 or 10.
 *
 * The source sets `departureAt` from its own clock at creation, so an option chosen before
 * signing in still means "in 5 minutes" when the request is finally confirmed.
 */
export const DepartureOffsetMinutesSchema = z.literal(RIDE_POLICY.departureOffsetsMinutes);
export type DepartureOffsetMinutes = z.infer<typeof DepartureOffsetMinutesSchema>;

/**
 * Lifecycle status of a ride request.
 *
 * - `active`: discoverable until `expiresAt`, and may join a ride or group.
 * - `grouped`: part of a group, whose lifetime now governs it; it is no longer discoverable
 *   on its own.
 * - `completed`: its group was completed.
 * - `expired`: its discovery window ended while it was still active.
 * - `cancelled`: the owner cancelled it while active, left its group, or the group was
 *   cancelled.
 *
 * `active` and `grouped` are live: a user has at most one live request.
 */
export const RideRequestStatusSchema = z.enum(['active', 'grouped', 'completed', 'expired', 'cancelled']);
export type RideRequestStatus = z.infer<typeof RideRequestStatusSchema>;

/**
 * Public projection of an active ride request (`GET /rides/{rideId}`, and the ride item of
 * nearby discovery), which anyone may see, including anonymous viewers.
 *
 * - `user` is the rider's public summary.
 * - `publicOrigin` is an approximate pickup area, never the exact origin.
 * - `destination` is the chosen curated place. Destinations are public venues, so the place
 *   itself is public.
 * - `departureAt` is when the rider leaves; `expiresAt`, when the request stops being
 *   discoverable. A request always expires after it departs.
 *
 * Only an active request has a public projection, so it carries no status or group: once
 * grouped, ended or unknown, the source answers `TARGET_UNAVAILABLE`, and discovery shows the
 * group instead. That way no public read links a named rider to a group, which group
 * previews deliberately hide. The app derives approximate distance itself, from
 * `publicOrigin.center` and its own location fix; the source never receives that position.
 */
export const RideRequestSchema = z
  .strictObject({
    id: IdSchema,
    user: UserSchema,
    publicOrigin: PublicLocationSchema,
    destination: PlaceSchema,
    departureAt: TimestampSchema,
    expiresAt: TimestampSchema,
    version: ResourceVersionSchema,
  })
  .refine((request) => Date.parse(request.departureAt) < Date.parse(request.expiresAt), {
    message: 'Expected departure before expiry',
    path: ['expiresAt'],
  });
export type RideRequestDto = z.infer<typeof RideRequestSchema>;

/** Whether a request's group reference matches its status: required once grouped, absent before. */
function hasGroupForStatus(request: { status: RideRequestStatus; groupId: string | null }): boolean {
  switch (request.status) {
    case 'active':
    case 'expired':
      return request.groupId === null;
    case 'grouped':
    case 'completed':
      return request.groupId !== null;
    case 'cancelled':
      return true;
  }
}

/**
 * The owner's own view of a ride request (`GET /me/ride-request`, and the result of creating
 * or cancelling one): the public projection plus owner-only fields.
 *
 * - `status` is the request's lifecycle status, including the terminal ones, so the app can
 *   explain how the latest request ended.
 * - `groupId` is the group the request is or was part of: set when `grouped` or `completed`,
 *   `null` when `active` or `expired`, and either when `cancelled` (cancelled while active,
 *   or with its group).
 * - `origin` is the exact pickup point, owner-only, so the app can show it and restore a
 *   draft for an explicit new request.
 *
 * `expiresAt` stays the discovery deadline; once grouped, the group's own `expiresAt`
 * governs the request instead.
 */
export const OwnRideRequestSchema = RideRequestSchema.safeExtend({
  status: RideRequestStatusSchema,
  groupId: IdSchema.nullable(),
  origin: OwnerLocationSchema,
}).refine(hasGroupForStatus, {
  message: 'Expected a group exactly when the request is or was grouped',
  path: ['groupId'],
});
export type OwnRideRequestDto = z.infer<typeof OwnRideRequestSchema>;

/**
 * Creates the caller's ride request (`POST /rides`). Private: it carries the exact origin.
 *
 * - `operationId` identifies this intent: a retry with the same ID and input returns the
 *   original request; the same ID with different input fails with `IDEMPOTENCY_CONFLICT`.
 * - `origin` is a recent, accurate device fix or a confirmed manual point. A stale fix fails
 *   with `LOCATION_STALE`, and an origin outside the covered area with `UNSUPPORTED_AREA`.
 * - `destinationPlaceId` is a curated place from place search. The source resolves it; an
 *   unknown place fails with `VALIDATION_FAILED`.
 * - `departureOffsetMinutes` is the departure choice.
 *
 * A caller who already has a live request (from another operation) gets
 * `ACTIVE_REQUEST_EXISTS`. The result is the new `OwnRideRequestDto`.
 */
export const CreateRideRequestInputSchema = z.strictObject({
  operationId: OperationIdSchema,
  origin: ExactLocationInputSchema,
  destinationPlaceId: IdSchema,
  departureOffsetMinutes: DepartureOffsetMinutesSchema,
});
export type CreateRideRequestInput = z.infer<typeof CreateRideRequestInputSchema>;

/**
 * Cancels the caller's active request (`POST /rides/{rideId}/cancel`); the result is the
 * updated `OwnRideRequestDto`.
 *
 * - `operationId` makes a retry return the original result.
 * - `expectedVersion` is the version the owner last saw.
 *
 * A grouped request fails with `USE_LEAVE_GROUP` (leaving the group cancels it), an expired
 * one with `RIDE_EXPIRED`, and a completed or already cancelled one with
 * `INVALID_TRANSITION`. These state errors come before the version check, because they tell
 * the app what to do; otherwise a stale `expectedVersion` fails with `VERSION_CONFLICT`.
 */
export const CancelRideRequestInputSchema = z.strictObject({
  operationId: OperationIdSchema,
  expectedVersion: ResourceVersionSchema,
});
export type CancelRideRequestInput = z.infer<typeof CancelRideRequestInputSchema>;
