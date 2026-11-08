import type { DepartureOffsetMinutes, ExactLocationInput } from '@ride-match/contracts';

import type { DataError } from '../../data/errors';
import type { LocationStatus } from '../../platform/location/createLocationController';
import { describePickup, type ConfirmedPickup } from '../location/LocationChoicesProvider';

/** The departure choices (design 06), as the segmented control's string values. */
export const DEPARTURE_OPTIONS = [
  { value: '0', label: 'Now' },
  { value: '5', label: 'In 5 min' },
  { value: '10', label: 'In 10 min' },
] as const satisfies readonly { value: `${DepartureOffsetMinutes}`; label: string }[];

/** "Leaving now" or "Leaving in 5 minutes", for the review (design 09). */
export function describeDeparture(minutes: DepartureOffsetMinutes): string {
  return minutes === 0 ? 'Leaving now' : `Leaving in ${minutes} minutes`;
}

/**
 * Where the request would start, and how to name it on screen. Private: the input reaches only
 * the create call, never logs or analytics; others see only the source's public area.
 */
export type DraftOrigin = {
  input: ExactLocationInput;
  /** Such as "Near Ala-Too Square" or "Your current location (±20 m)". */
  description: string;
};

/**
 * The origin for a new request: the pickup the user confirmed (a manual point, which does not
 * age), otherwise the device's current fix if it is fresh and accurate enough for a pickup
 * (`assessFix`). `null` when neither exists: the user must choose a pickup first. A fix is never
 * guessed or improved, and an approximate one never qualifies.
 *
 * The fix's time is sent as the device took it. The source checks its age on its own clock
 * (`LOCATION_STALE`); shifting by a measured clock offset waits for the HTTP adapter.
 */
export function resolveOrigin(pickup: ConfirmedPickup | null, location: LocationStatus): DraftOrigin | null {
  if (pickup !== null) return { input: pickup.location, description: describePickup(pickup) };
  if (location.kind !== 'located' || !location.assessment.usableForPickup) return null;
  const { coordinates, accuracyMeters, capturedAt } = location.fix;
  // A usable fix always has an accuracy within the limit; without one it cannot be checked.
  if (accuracyMeters === null) return null;
  return {
    input: {
      source: 'device',
      coordinates: { latitude: coordinates.latitude, longitude: coordinates.longitude },
      accuracyMeters,
      capturedAt: new Date(capturedAt).toISOString(),
    },
    description: `Your current location (±${Math.round(accuracyMeters)} m)`,
  };
}

/**
 * What a failed create means for the review (design 09):
 *
 * - `existing`: the rider already has a live request; show it instead of retrying.
 * - `edit`: the plan itself was refused (stale location, outside the area, invalid); edit it.
 * - `retry`: the outcome is unknown (no answer) or the service was busy; retrying with the same
 *   operation ID cannot publish twice.
 * - `sign-in`: the session ended; the session flow takes over.
 */
export function describeCreateError(error: DataError): {
  action: 'existing' | 'edit' | 'retry' | 'sign-in';
  message: string;
} {
  switch (error.code) {
    case 'ACTIVE_REQUEST_EXISTS':
      return { action: 'existing', message: 'You already have a live ride request.' };
    case 'LOCATION_STALE':
      return {
        action: 'edit',
        message: 'Your location is out of date. Wait for a fresh fix or choose a pickup point, then try again.',
      };
    case 'UNSUPPORTED_AREA':
      return { action: 'edit', message: 'This pickup is outside the demo area. Choose a pickup point in Bishkek.' };
    case 'VALIDATION_FAILED':
    case 'IDEMPOTENCY_CONFLICT':
      return { action: 'edit', message: 'This plan couldn’t be published. Edit it and try again.' };
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return { action: 'sign-in', message: 'Your session ended. Sign in again to publish your plan.' };
    default:
      return {
        action: 'retry',
        message:
          error.kind === 'network'
            ? 'We couldn’t confirm it was published. Try again: it won’t be posted twice.'
            : 'The service couldn’t publish it right now. Try again: it won’t be posted twice.',
      };
  }
}
