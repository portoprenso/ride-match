import type { CoordinatesDto, MapViewport } from '@ride-match/contracts';

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** A latitude/longitude box in degrees; every edge belongs to it. It never crosses the antimeridian. */
export type Bounds = { south: number; west: number; north: number; east: number };

/**
 * Straight-line distance between two points in meters, by the equirectangular approximation,
 * which is accurate to well under a percent at city scale. The mock source only orders results
 * by it; it is not a route distance, and the app never derives matches from it.
 */
export function distanceMeters(from: CoordinatesDto, to: CoordinatesDto): number {
  const meanLatitude = toRadians((from.latitude + to.latitude) / 2);
  const east = toRadians(to.longitude - from.longitude) * Math.cos(meanLatitude);
  const north = toRadians(to.latitude - from.latitude);
  return Math.hypot(east, north) * EARTH_RADIUS_METERS;
}

export function viewportBounds(viewport: MapViewport): Bounds {
  return {
    south: viewport.southWest.latitude,
    west: viewport.southWest.longitude,
    north: viewport.northEast.latitude,
    east: viewport.northEast.longitude,
  };
}

export function centerOf(bounds: Bounds): CoordinatesDto {
  return { latitude: (bounds.south + bounds.north) / 2, longitude: (bounds.west + bounds.east) / 2 };
}

export function contains(bounds: Bounds, point: CoordinatesDto): boolean {
  return (
    point.latitude >= bounds.south &&
    point.latitude <= bounds.north &&
    point.longitude >= bounds.west &&
    point.longitude <= bounds.east
  );
}

export function boundsIntersect(first: Bounds, second: Bounds): boolean {
  return (
    first.south <= second.north && second.south <= first.north && first.west <= second.east && second.west <= first.east
  );
}

/** Whether a circle around `center` reaches the box, measured to the box's nearest point. */
export function circleReaches(bounds: Bounds, center: CoordinatesDto, radiusMeters: number): boolean {
  const nearest = {
    latitude: clamp(center.latitude, bounds.south, bounds.north),
    longitude: clamp(center.longitude, bounds.west, bounds.east),
  };
  return distanceMeters(center, nearest) <= radiusMeters;
}
