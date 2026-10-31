import { z } from 'zod';

import { IdSchema, TimestampSchema, singleLineTextSchema, type Timestamp } from './common.js';

/**
 * Location validation defaults chosen for the mock MVP (CONTRACT-001-B).
 *
 * These are reviewed mock-product values, not a production policy: revisit them after device
 * checks and before a backend exists. The schemas below enforce the static bounds. The fix
 * age depends on the source's clock, so `isLocationFixFresh` applies it.
 */
export const LOCATION_POLICY = {
  /**
   * Largest accuracy radius of a device fix that can become a pickup point. Approximate
   * location permission (about 1–3 km on iOS and Android) never qualifies; those users pick
   * a point on the map instead.
   */
  maxFixAccuracyMeters: 100,
  /** Oldest device fix accepted as a pickup point, measured on the source's clock. */
  maxFixAgeSeconds: 60,
  /** How far after the source's time a fix may appear, to absorb clock-offset estimate error. */
  fixClockToleranceSeconds: 10,
  /** Smallest uncertainty radius of a public location, so a public marker never claims a precise point. */
  minPublicRadiusMeters: 200,
  /** Largest uncertainty radius of a public location, about a city district. */
  maxPublicRadiusMeters: 5_000,
  /** Longest walking estimate to a meeting point. */
  maxWalkingMinutes: 60,
} as const;

/** Name of an area or place, such as a district or "Central Station, main entrance". */
const LabelSchema = singleLineTextSchema(80);

/**
 * A point in WGS 84 decimal degrees, as device location services and map SDKs report it.
 *
 * Coordinates grant nothing by themselves: who may see a point depends on the schema that
 * carries it (exact input, owner view, public area, or member-only meeting point).
 */
export const CoordinatesSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type CoordinatesDto = z.infer<typeof CoordinatesSchema>;

/** How an exact location was obtained: a device location fix, or a point the user picked on the map. */
export const LocationSourceSchema = z.enum(['device', 'manual']);
export type LocationSource = z.infer<typeof LocationSourceSchema>;

/**
 * A device location fix submitted as an exact pickup point. Private, like every
 * `ExactLocationInput`.
 *
 * - `accuracyMeters` is the fix's horizontal accuracy radius, from 0 to
 *   `LOCATION_POLICY.maxFixAccuracyMeters`. A fix with unknown or worse accuracy cannot be
 *   used; offer a manual pickup point instead.
 * - `capturedAt` is when the fix was taken, on the source's clock: the client shifts the
 *   device's fix time by the clock offset it observes from `meta.serverTime`. The source
 *   rejects an old fix with `LOCATION_STALE` (see `isLocationFixFresh`).
 *
 * Altitude, speed, heading and other sensor fields are never sent; the strict schema rejects them.
 */
export const DeviceLocationInputSchema = z.strictObject({
  source: z.literal('device'),
  coordinates: CoordinatesSchema,
  accuracyMeters: z.number().min(0).max(LOCATION_POLICY.maxFixAccuracyMeters),
  capturedAt: TimestampSchema,
});
export type DeviceLocationInput = z.infer<typeof DeviceLocationInputSchema>;

/**
 * A pickup point the user picked on the map and explicitly confirmed: manual pickup mode,
 * or the fallback when location is unavailable, too old or too inaccurate. It does not age,
 * because the confirmation states where the user will be rather than reporting a measurement.
 */
export const ManualLocationInputSchema = z.strictObject({
  source: z.literal('manual'),
  coordinates: CoordinatesSchema,
});
export type ManualLocationInput = z.infer<typeof ManualLocationInputSchema>;

/**
 * Exact pickup location sent when a ride request is created: a recent, accurate device fix
 * or a confirmed manual point, told apart by `source`.
 *
 * Private: only an authenticated request body carries it. It never appears in logs,
 * analytics, public responses or events, and only its owner reads it back, as an
 * `OwnerLocationDto`. Map browsing sends a coarse viewport instead.
 */
export const ExactLocationInputSchema = z.discriminatedUnion('source', [
  DeviceLocationInputSchema,
  ManualLocationInputSchema,
]);
export type ExactLocationInput = z.infer<typeof ExactLocationInputSchema>;

/**
 * An exact location returned to its owner only, such as the origin of their own ride
 * request, so the app can show and restore it.
 *
 * Owner-only: it belongs in owner responses and never in public or member data. The fix's
 * accuracy and capture time are not echoed back.
 */
export const OwnerLocationSchema = z.strictObject({
  coordinates: CoordinatesSchema,
  source: LocationSourceSchema,
});
export type OwnerLocationDto = z.infer<typeof OwnerLocationSchema>;

/**
 * Approximate area that anyone may see, including anonymous viewers: a public origin or
 * destination area.
 *
 * - `center` is the area's center, not the person's point.
 * - `radiusMeters` is the uncertainty radius, a whole number from
 *   `LOCATION_POLICY.minPublicRadiusMeters` to `maxPublicRadiusMeters`.
 * - `label` names the area, such as a district, or is `null`.
 *
 * The schema enforces the shape only; it cannot prove that `center` was obfuscated. The
 * source derives it from the exact point: production obfuscation is backend work, and the
 * mocks use sanitized fixtures.
 */
export const PublicLocationSchema = z.strictObject({
  center: CoordinatesSchema,
  radiusMeters: z
    .int()
    .min(LOCATION_POLICY.minPublicRadiusMeters)
    .max(LOCATION_POLICY.maxPublicRadiusMeters),
  label: LabelSchema.nullable(),
});
export type PublicLocationDto = z.infer<typeof PublicLocationSchema>;

/**
 * Shared meeting place of a group, suggested by the source after the group forms.
 *
 * Member-only: only the group's current members read it, and public group previews never
 * contain it. `coordinates` are a shared landmark or place, never a member's live location.
 * `walkingMinutes` is the source's walking estimate for the viewer, a whole number from 0 to
 * `LOCATION_POLICY.maxWalkingMinutes`, or `null` when unknown. The app never computes routes,
 * and the viewer location behind the estimate is never echoed.
 */
export const MeetingPointSchema = z.strictObject({
  id: IdSchema,
  coordinates: CoordinatesSchema,
  label: LabelSchema,
  walkingMinutes: z.int().min(0).max(LOCATION_POLICY.maxWalkingMinutes).nullable(),
});
export type MeetingPointDto = z.infer<typeof MeetingPointSchema>;

/**
 * Whether a device fix is recent enough to become a pickup point at `now`.
 *
 * The fix must be taken at most `LOCATION_POLICY.maxFixAgeSeconds` before `now` and at most
 * `fixClockToleranceSeconds` after it. The source answers a stale fix with `LOCATION_STALE`.
 * The app checks first and gets a fresh fix rather than submit one it knows is stale. Manual
 * points do not age, so they need no check.
 *
 * @param fix A validated device fix; its `capturedAt` is on the source's clock.
 * @param now The source's current time, or the app's estimate of it.
 * @returns `false` outside that window, and also when a timestamp cannot be parsed.
 */
export function isLocationFixFresh(fix: Pick<DeviceLocationInput, 'capturedAt'>, now: Timestamp): boolean {
  const ageMs = Date.parse(now) - Date.parse(fix.capturedAt);
  return (
    ageMs <= LOCATION_POLICY.maxFixAgeSeconds * 1000 &&
    ageMs >= -LOCATION_POLICY.fixClockToleranceSeconds * 1000
  );
}
