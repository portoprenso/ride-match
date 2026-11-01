import { LOCATION_POLICY, type CoordinatesDto } from '@ride-match/contracts';

/** Oldest cached fix shown as the user's position while a fresh one is requested (docs/PRODUCT.md). */
export const BROWSING_FIX_MAX_AGE_MS = 2 * 60 * 1000;

const PICKUP_FIX_MAX_AGE_MS = LOCATION_POLICY.maxFixAgeSeconds * 1000;

/**
 * A device position the controller holds. It is exact and private: it may become the origin of
 * the user's own request, once, when they confirm it, and is never logged, sent to analytics or
 * put in a discovery read. It is frozen, so a fix captured for a published request never changes
 * when the device moves; a published origin moves only through an explicit new request.
 */
export type LocationFix = Readonly<{
  coordinates: Readonly<CoordinatesDto>;
  /** Accuracy radius in meters, or `null` when the OS gives none. */
  accuracyMeters: number | null;
  /** When the OS took it, in device milliseconds since the epoch. */
  capturedAt: number;
  /** Taken under approximate permission (iOS reduced accuracy, Android coarse), so never precise enough for a pickup. */
  approximate: boolean;
}>;

/**
 * How usable a fix is at a given moment.
 *
 * - `age`: `fresh` within `LOCATION_POLICY.maxFixAgeSeconds` (60 s), `recent` within
 *   {@link BROWSING_FIX_MAX_AGE_MS} (two minutes), otherwise `stale`. A stale fix may still be
 *   shown, but labelled as out of date.
 * - `accurate`: precise permission and an accuracy radius within
 *   `LOCATION_POLICY.maxFixAccuracyMeters` (100 m).
 * - `usableForPickup`: fresh and accurate, so it may become a pickup point. Otherwise the user
 *   refreshes it or confirms a point on the map. The source checks the age again on its own clock.
 */
export type FixAssessment = {
  age: 'fresh' | 'recent' | 'stale';
  accurate: boolean;
  usableForPickup: boolean;
};

/** @param now Device time in milliseconds, the same clock as `fix.capturedAt`. */
export function assessFix(fix: LocationFix, now: number): FixAssessment {
  const ageMs = now - fix.capturedAt;
  const age = ageMs <= PICKUP_FIX_MAX_AGE_MS ? 'fresh' : ageMs <= BROWSING_FIX_MAX_AGE_MS ? 'recent' : 'stale';
  const accurate =
    !fix.approximate && fix.accuracyMeters !== null && fix.accuracyMeters <= LOCATION_POLICY.maxFixAccuracyMeters;
  return { age, accurate, usableForPickup: age === 'fresh' && accurate };
}
