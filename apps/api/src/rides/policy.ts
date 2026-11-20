import type { CoordinatesDto, PublicLocationDto, MatchLevel } from '@ride-match/contracts';

/** Fixed global cells prevent averaging repeated responses into an exact origin. Not an anonymity guarantee. */
export function approximateOrigin(point: CoordinatesDto): PublicLocationDto {
  const cell = (value: number, offset: number, maximum: number) =>
    Number(((Math.min(maximum - 1, Math.floor((value + offset) * 50)) + 0.5) / 50 - offset).toFixed(2));
  return { center: { latitude: cell(point.latitude, 90, 9000), longitude: cell(point.longitude, 180, 18000) }, radiusMeters: 2000, label: null };
}

/** Straight-line separation for coarse candidate/landmark ranking only; never a route or walking estimate. */
export function distanceMeters(a: CoordinatesDto, b: CoordinatesDto): number {
  const radians = (value: number) => value * Math.PI / 180;
  const term = Math.sin(radians(a.latitude - b.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(a.longitude - b.longitude) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, term)));
}

/** Local advisory policy: same public venue, at most five minutes apart and nearby coarse areas. */
export function compatible(input: {
  origin: CoordinatesDto; destinationId: string; departure: number;
}, target: { origin: CoordinatesDto; destinationId: string; departure: number }): MatchLevel | null {
  if (input.destinationId !== target.destinationId || Math.abs(input.departure - target.departure) > 300000) return null;
  const distance = distanceMeters(input.origin, target.origin);
  return distance < 1 ? 'excellent' : distance <= 1500 ? 'good' : distance <= 3000 ? 'possible' : null;
}
