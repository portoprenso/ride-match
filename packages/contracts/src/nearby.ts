import { z } from 'zod';

import { IdSchema } from './common.js';
import { GroupPreviewSchema, hasDistinctTargets, joinTargetKey } from './groups.js';
import { CoarseCoordinatesSchema } from './location.js';
import { MatchPreviewSchema } from './matches.js';
import { DepartureOffsetMinutesSchema, RideRequestSchema } from './rides.js';

/**
 * Nearby discovery limits chosen for the mock MVP (CONTRACT-002-B). The schemas enforce
 * them; revisit them before a backend exists.
 */
export const NEARBY_POLICY = {
  /** Largest latitude or longitude span of a discovery viewport, about 55 km of latitude. */
  maxViewportSpanDegrees: 0.5,
  /** Most items one snapshot returns, and the largest `limit` a client may ask for. */
  maxItems: 100,
} as const;

/** Span of a coarse viewport edge in hundredths of a degree, free of float error. */
const spanHundredths = (from: number, to: number) => Math.round((to - from) * 100);
const maxSpanHundredths = Math.round(NEARBY_POLICY.maxViewportSpanDegrees * 100);

/**
 * The map area a discovery read covers: its `southWest` and `northEast` corners as coarse
 * coordinates (at most 2 decimal places). The app rounds its visible region outward, so the
 * request never carries the device's position.
 *
 * North must lie above south and east of west; a viewport across the antimeridian is not
 * supported. Each span is at most `NEARBY_POLICY.maxViewportSpanDegrees`: a wider view asks
 * for a smaller area or prompts the user to zoom in.
 */
export const MapViewportSchema = z
  .strictObject({
    southWest: CoarseCoordinatesSchema,
    northEast: CoarseCoordinatesSchema,
  })
  .refine((viewport) => viewport.southWest.latitude < viewport.northEast.latitude, {
    message: 'Expected north above south',
    path: ['northEast', 'latitude'],
  })
  .refine((viewport) => viewport.southWest.longitude < viewport.northEast.longitude, {
    message: 'Expected east of west, without crossing the antimeridian',
    path: ['northEast', 'longitude'],
  })
  .refine(
    (viewport) =>
      spanHundredths(viewport.southWest.latitude, viewport.northEast.latitude) <= maxSpanHundredths &&
      spanHundredths(viewport.southWest.longitude, viewport.northEast.longitude) <= maxSpanHundredths,
    { message: 'Expected a viewport at most 0.5 degrees across' },
  );
export type MapViewport = z.infer<typeof MapViewportSchema>;

/**
 * A nearby discovery read (`GET /rides/nearby`), open to anonymous users.
 *
 * - `viewport` is the coarse map area.
 * - `destinationPlaceId`, when given, asks the source for match previews against that
 *   curated place. Omitted, the snapshot shows general activity and no previews.
 * - `departureOffsetMinutes` refines the previews with a departure choice and needs
 *   `destinationPlaceId`.
 * - `limit` is the most items wanted, 1 to 100.
 *
 * A viewport entirely outside the covered area fails with `UNSUPPORTED_AREA`. For a signed-in
 * viewer the source leaves out their own request and group and anyone they have blocked,
 * without changing what each item shows.
 */
export const NearbyQueryInputSchema = z
  .strictObject({
    viewport: MapViewportSchema,
    destinationPlaceId: IdSchema.optional(),
    departureOffsetMinutes: DepartureOffsetMinutesSchema.optional(),
    limit: z.int().min(1).max(NEARBY_POLICY.maxItems),
  })
  .refine((input) => input.departureOffsetMinutes === undefined || input.destinationPlaceId !== undefined, {
    message: 'Expected a destination with a departure choice',
    path: ['departureOffsetMinutes'],
  });
export type NearbyQueryInput = z.infer<typeof NearbyQueryInputSchema>;

/**
 * One public discovery item, told apart by `kind`: an active solo ride request
 * (`RideRequestSchema` fields) or a live group (`GroupPreviewSchema` fields). Each item
 * represents a ride intention, not a person's position. A grouped request never appears on
 * its own: its group stands for it once. Realtime upserts carry this same shape.
 */
export const NearbyItemSchema = z.discriminatedUnion('kind', [
  RideRequestSchema.safeExtend({ kind: z.literal('ride') }),
  GroupPreviewSchema.safeExtend({ kind: z.literal('group') }),
]);
export type NearbyItemDto = z.infer<typeof NearbyItemSchema>;

/**
 * Result of a nearby discovery read.
 *
 * - `items` come nearest the viewport's center first, each item once, at most the request's
 *   `limit`.
 * - `truncated` is `true` when more items matched than the limit allowed; the farthest were
 *   left out. The app then never presents the items as a complete count.
 * - `previews` holds one advisory match preview per compatible item when the read named a
 *   destination, and is empty otherwise. Each preview's `target` is one of `items`.
 *
 * An empty `items` list with `truncated: false` means the area has no activity right now.
 */
export const NearbySnapshotSchema = z
  .strictObject({
    items: z
      .array(NearbyItemSchema)
      .max(NEARBY_POLICY.maxItems)
      .refine(hasDistinctTargets, { message: 'Expected each item once' }),
    truncated: z.boolean(),
    previews: z
      .array(MatchPreviewSchema)
      .max(NEARBY_POLICY.maxItems)
      .refine((previews) => hasDistinctTargets(previews.map((preview) => preview.target)), {
        message: 'Expected one preview per item',
      }),
  })
  .refine(
    (snapshot) => {
      const itemKeys = new Set(snapshot.items.map(joinTargetKey));
      return snapshot.previews.every((preview) => itemKeys.has(joinTargetKey(preview.target)));
    },
    { message: 'Expected previews only for returned items', path: ['previews'] },
  );
export type NearbySnapshotDto = z.infer<typeof NearbySnapshotSchema>;
