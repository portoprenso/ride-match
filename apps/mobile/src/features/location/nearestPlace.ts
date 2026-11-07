import {
  LOCATION_POLICY,
  PLACE_SEARCH_POLICY,
  type CoordinatesDto,
  type PlaceDto,
  type SearchPlacesInput,
} from '@ride-match/contracts';
import { useQuery } from '@tanstack/react-query';

import { useDataSource } from '../../data/DataSourceProvider';
import { placeSearchQuery } from '../../data/queries';

/** A place farther than this from the chosen point is not offered as its name. */
export const NEAREST_PLACE_MAX_METERS = 1_000;

/**
 * Rounding moves the search centre up to about 700 m from the exact point (half a 0.01° step on
 * each axis at this latitude), so the search reaches past the naming limit from anywhere in it.
 */
const NEAREST_PLACE_SEARCH_RADIUS_METERS = 2_000;

const EARTH_RADIUS_METERS = 6_371_000;
const COARSE_SCALE = 10 ** LOCATION_POLICY.coarseCoordinateDecimals;

/** Rounds a point to the precision anonymous reads accept (`CoarseCoordinatesSchema`). */
export function toCoarse(point: Readonly<CoordinatesDto>): CoordinatesDto {
  return {
    latitude: Math.round(point.latitude * COARSE_SCALE) / COARSE_SCALE,
    longitude: Math.round(point.longitude * COARSE_SCALE) / COARSE_SCALE,
  };
}

/** Great-circle distance in metres. */
export function distanceMeters(from: Readonly<CoordinatesDto>, to: Readonly<CoordinatesDto>): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The place closest to `point` within {@link NEAREST_PLACE_MAX_METERS}, or `null`. Ties keep the
 * source's order. The comparison runs on the device, so the exact point is never sent.
 */
export function nearestPlace(point: Readonly<CoordinatesDto>, places: readonly PlaceDto[]): PlaceDto | null {
  let best: PlaceDto | null = null;
  let bestDistance = NEAREST_PLACE_MAX_METERS;
  for (const place of places) {
    const distance = distanceMeters(point, place.coordinates);
    if (distance <= bestDistance && (best === null || distance < bestDistance)) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The curated place nearest a point chosen on the map, to name it ("Near Ala-Too Square").
 *
 * Privacy: the read sends only the point rounded to the coarse precision (about a kilometre) and
 * the smallest search radius that covers {@link NEAREST_PLACE_MAX_METERS} from anywhere in that
 * rounding; the exact point stays on the device, where the nearest result is picked.
 *
 * @param point The point under the map's pin, or `null` while it is not known; no read is sent
 *   then.
 * @returns The Query result: `data` is the nearest place or `null` when none is close enough.
 *   A failure (for example `UNSUPPORTED_AREA` outside the curated coverage) arrives as a
 *   `DataError`; the point can still be confirmed without a name.
 */
export function useNearestPlace(point: Readonly<CoordinatesDto> | null) {
  const dataSource = useDataSource();
  const input: SearchPlacesInput = {
    area: {
      center: toCoarse(point ?? { latitude: 0, longitude: 0 }),
      radiusMeters: NEAREST_PLACE_SEARCH_RADIUS_METERS,
    },
    limit: PLACE_SEARCH_POLICY.maxResults,
  };
  return useQuery({
    ...placeSearchQuery(dataSource, input),
    enabled: point !== null,
    select: (places: readonly PlaceDto[]) => (point === null ? null : nearestPlace(point, places)),
  });
}
