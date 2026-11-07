import {
  CancelRideRequestInputSchema,
  CreateRideRequestInputSchema,
  RIDE_POLICY,
  isLocationFixFresh,
  type CoordinatesDto,
  type OwnRideRequestDto,
  type PublicLocationDto,
} from '@ride-match/contracts';

import { authenticate } from './auth';
import { contains } from './geometry';
import { expireRide } from './lifecycle';
import { COVERAGE, findPlace } from './places';
import { nearbyRemoved, nearbyUpserted, rideChanged, toNearbyItemDto, toOwnRideRequestDto } from './serializers';
import type { WorkContext } from './simulator';
import type { MockWorld, RideRecord } from './world';

/*
 * The signed-in rider's own ride request (docs/api/rides.md): create, read the current or latest
 * one, and cancel. Each validates its input as the source would, authenticates the caller, and
 * goes through the simulator's receipts, so a retry with the same operation ID returns the
 * original result without acting twice. Expiry is the lifecycle's (`expireRide`), scheduled here.
 */

type Context = WorkContext<MockWorld>;

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Public areas snap to a 0.01° grid (about 1 km), so nearby riders share one district-sized area. */
const PUBLIC_GRID_DEGREES = 0.01;
/** Reaches every point of its grid cell from the cell's centre, about 0.0071° diagonally. */
const PUBLIC_RADIUS_METERS = 900;

const invalidInput = (context: Context) => context.sourceError('VALIDATION_FAILED', 'The request is not valid.');

/**
 * The public area shown instead of an exact origin: the centre of the 0.01° grid cell holding
 * it, with a radius that covers the whole cell, so the area contains the origin without
 * revealing where in it the rider is. The mock does not claim stronger obfuscation; the future
 * source decides the real rule.
 */
export function publicAreaFor(origin: CoordinatesDto): PublicLocationDto {
  const snap = (degrees: number) =>
    Math.round((Math.floor(degrees / PUBLIC_GRID_DEGREES) + 0.5) * PUBLIC_GRID_DEGREES * 1e4) / 1e4;
  return {
    center: { latitude: snap(origin.latitude), longitude: snap(origin.longitude) },
    radiusMeters: PUBLIC_RADIUS_METERS,
    label: null,
  };
}

/** The rider's live (`active` or `grouped`) request, if any; there is at most one. */
function liveRequestOf(world: MockWorld, userId: string): RideRecord | undefined {
  return [...world.rides.values()].find(
    (ride) => ride.userId === userId && (ride.status === 'active' || ride.status === 'grouped'),
  );
}

/**
 * `POST /rides`: publishes the caller's request.
 *
 * In this order: `VALIDATION_FAILED` (an invalid input or an unknown destination),
 * `UNAUTHENTICATED`/`SESSION_EXPIRED`, then the receipt: a retry with the same operation ID and
 * input returns the original request, even after it ended, and the same ID with another input
 * fails with `IDEMPOTENCY_CONFLICT`. A new operation then fails with `LOCATION_STALE` for a
 * device fix older than 60 s (or ahead of the source's clock), `UNSUPPORTED_AREA` for an origin
 * outside the demo city, and `ACTIVE_REQUEST_EXISTS` when the rider already has a live request.
 *
 * On success the request is `active`: it departs at the source's time plus the chosen offset,
 * expires `RIDE_POLICY.activeLifetimeSeconds` after creation, shows in discovery at once with a
 * public area instead of its origin (`nearby.upserted`), and its owner is told (`ride.changed`).
 */
export function createRide(context: Context, accessToken: string | null, input: unknown): OwnRideRequestDto {
  const parsed = CreateRideRequestInputSchema.safeParse(input);
  if (!parsed.success || findPlace(parsed.data.destinationPlaceId) === undefined) throw invalidInput(context);
  const request = parsed.data;
  const user = authenticate(context, accessToken);

  return context.receipts.once(
    { actorId: user.id, operationId: request.operationId },
    { operation: 'rides.create', input: request },
    () => {
      const { origin } = request;
      if (origin.source === 'device' && !isLocationFixFresh(origin, new Date(context.now).toISOString())) {
        throw context.sourceError('LOCATION_STALE', 'The location is out of date. Find it again or choose a point.');
      }
      if (!contains(COVERAGE, origin.coordinates)) {
        throw context.sourceError('UNSUPPORTED_AREA', 'This pickup is outside the demo coverage.');
      }
      if (liveRequestOf(context.state, user.id) !== undefined) {
        throw context.sourceError('ACTIVE_REQUEST_EXISTS', 'You already have a live ride request.');
      }

      const ride: RideRecord = {
        id: context.ids.next('ride'),
        userId: user.id,
        origin: { coordinates: { ...origin.coordinates }, source: origin.source },
        publicOrigin: publicAreaFor(origin.coordinates),
        destinationPlaceId: request.destinationPlaceId,
        createdAt: context.now,
        departureAt: context.now + request.departureOffsetMinutes * MINUTE,
        expiresAt: context.now + RIDE_POLICY.activeLifetimeSeconds * SECOND,
        status: 'active',
        groupId: null,
        version: 1,
      };
      context.state.rides.set(ride.id, ride);
      context.emit(
        nearbyUpserted(context.eventEnvelope(), toNearbyItemDto(context.state, { kind: 'ride', record: ride })),
      );
      context.emit(rideChanged(context.eventEnvelope(), ride));
      context.schedule(ride.expiresAt, (later) => expireRide(later, ride.id));
      return toOwnRideRequestDto(context.state, ride);
    },
  );
}

/**
 * `GET /me/ride-request`: the caller's live request, or else their most recent one in whatever
 * status it ended (so the app can explain the outcome), or `null` if they never created one.
 */
export function readOwnRequest(context: Context, accessToken: string | null): OwnRideRequestDto | null {
  const user = authenticate(context, accessToken);
  const live = liveRequestOf(context.state, user.id);
  if (live !== undefined) return toOwnRideRequestDto(context.state, live);
  let latest: RideRecord | undefined;
  for (const ride of context.state.rides.values()) {
    if (ride.userId === user.id && (latest === undefined || ride.createdAt >= latest.createdAt)) latest = ride;
  }
  return latest === undefined ? null : toOwnRideRequestDto(context.state, latest);
}

/**
 * `POST /rides/{rideId}/cancel`: cancels the caller's active request.
 *
 * In this order: `VALIDATION_FAILED`, `UNAUTHENTICATED`/`SESSION_EXPIRED`, the receipt (a retry
 * returns the original result), `NOT_FOUND` for an unknown request and `FORBIDDEN` for another
 * rider's, then the state errors before the version check, as the contract orders them:
 * `USE_LEAVE_GROUP` (grouped: leaving the group cancels it), `RIDE_EXPIRED`, `INVALID_TRANSITION`
 * (completed or already cancelled), and only then `VERSION_CONFLICT` for a stale
 * `expectedVersion`.
 *
 * On success the request is `cancelled`, discovery removes it (`nearby.removed`, reason
 * `unavailable`) and its owner is told (`ride.changed`). Its scheduled expiry then finds it
 * ended and does nothing.
 */
export function cancelRide(
  context: Context,
  accessToken: string | null,
  rideId: string,
  input: unknown,
): OwnRideRequestDto {
  const parsed = CancelRideRequestInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(context);
  const { operationId, expectedVersion } = parsed.data;
  const user = authenticate(context, accessToken);

  return context.receipts.once(
    { actorId: user.id, operationId },
    { operation: 'rides.cancel', input: { rideId, expectedVersion } },
    () => {
      const ride = context.state.rides.get(rideId);
      if (ride === undefined) throw context.sourceError('NOT_FOUND', 'This ride request does not exist.');
      if (ride.userId !== user.id) throw context.sourceError('FORBIDDEN', 'Only its owner can cancel this request.');
      switch (ride.status) {
        case 'grouped':
          throw context.sourceError('USE_LEAVE_GROUP', 'Leave the group to cancel this request.');
        case 'expired':
          throw context.sourceError('RIDE_EXPIRED', 'This request has already expired.');
        case 'completed':
        case 'cancelled':
          throw context.sourceError('INVALID_TRANSITION', 'This request has already ended.');
        case 'active':
          break;
      }
      if (ride.version !== expectedVersion) {
        throw context.sourceError('VERSION_CONFLICT', 'This request changed. Read it again.');
      }
      ride.status = 'cancelled';
      ride.version += 1;
      context.emit(nearbyRemoved(context.eventEnvelope(), { kind: 'ride', id: ride.id }, ride.version, 'unavailable'));
      context.emit(rideChanged(context.eventEnvelope(), ride));
      return toOwnRideRequestDto(context.state, ride);
    },
  );
}
