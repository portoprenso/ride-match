import { z } from 'zod';

import { IdSchema, singleLineTextSchema } from './common.js';
import { CoarseCoordinatesSchema, CoordinatesSchema } from './location.js';

/**
 * Place search limits chosen for the mock MVP (CONTRACT-002-A). The schemas below enforce
 * them; they are mock-product values to revisit before a backend exists.
 */
export const PLACE_SEARCH_POLICY = {
  /** Longest search text. */
  maxQueryLength: 80,
  /** Most places one search returns, and the largest `limit` a client may ask for. */
  maxResults: 20,
  /** Smallest search radius, so the area stays coarse. */
  minAreaRadiusMeters: 1_000,
  /** Largest search radius, about a city and its surroundings. */
  maxAreaRadiusMeters: 50_000,
} as const;

/**
 * A curated place that can be chosen as a destination or a named pickup point.
 *
 * - `id` is stable: the same place keeps its ID across searches, sessions and resets, so a
 *   saved draft can refer to it later.
 * - `label` is its name (1–80 characters), such as "Asia Mall".
 * - `detail` is a secondary line (1–120 characters), such as a street or "City centre", or
 *   `null`.
 * - `coordinates` are the place's own point. Places are public venues or areas, so anyone may
 *   see them; a place never describes where a person is.
 */
export const PlaceSchema = z.strictObject({
  id: IdSchema,
  label: singleLineTextSchema(80),
  detail: singleLineTextSchema(120).nullable(),
  coordinates: CoordinatesSchema,
});
export type PlaceDto = z.infer<typeof PlaceSchema>;

/**
 * The region a place search covers: a coarse `center` (see `CoarseCoordinatesSchema`) and a
 * `radiusMeters` from 1,000 to 50,000. The app derives it from its map region, never from the
 * exact device position.
 */
export const PlaceSearchAreaSchema = z.strictObject({
  center: CoarseCoordinatesSchema,
  radiusMeters: z
    .int()
    .min(PLACE_SEARCH_POLICY.minAreaRadiusMeters)
    .max(PLACE_SEARCH_POLICY.maxAreaRadiusMeters),
});
export type PlaceSearchArea = z.infer<typeof PlaceSearchAreaSchema>;

/**
 * A curated place search (`GET /places/search`), open to anonymous users.
 *
 * - `query` is the search text (1–80 characters, one line, no surrounding whitespace; the app
 *   trims what was typed). Omitted, the search lists the area's places nearest its center
 *   first, which serves the "other places" list and named pickup points. With a query, the
 *   source orders matches by relevance.
 * - `limit` is the most places wanted, 1 to 20.
 *
 * An area outside the curated coverage fails with `UNSUPPORTED_AREA`. How the future HTTP
 * adapter encodes these values as query parameters is decided with that adapter.
 */
export const SearchPlacesInputSchema = z.strictObject({
  query: singleLineTextSchema(PLACE_SEARCH_POLICY.maxQueryLength).optional(),
  area: PlaceSearchAreaSchema,
  limit: z.int().min(1).max(PLACE_SEARCH_POLICY.maxResults),
});
export type SearchPlacesInput = z.infer<typeof SearchPlacesInputSchema>;

/**
 * Places found by a search, in the source's order, at most 20 and never more than the
 * request's `limit`. Each place appears once. An empty list means nothing matched in a
 * supported area.
 */
export const PlaceSearchResultsSchema = z
  .array(PlaceSchema)
  .max(PLACE_SEARCH_POLICY.maxResults)
  .refine((places) => new Set(places.map((place) => place.id)).size === places.length, {
    message: 'Expected each place once',
  });
export type PlaceSearchResultsDto = z.infer<typeof PlaceSearchResultsSchema>;
