import { CoordinatesSchema, type CoordinatesDto } from '@ride-match/contracts';

/*
 * The Yandex Go link (TAXI-001-A), in the format Yandex documents for partner links
 * (https://yandex.ru/support/taxi-distr/en/api/deeplinks, checked 2026-11-08):
 *
 *   https://3.redirect.appmetrica.yandex.com/route?start-lat=…&start-lon=…&end-lat=…&end-lon=…
 *     &appmetrica_tracking_id=…&lang=…
 *
 * - The subdomain `3` is Yandex Go's app code.
 * - With the app installed, the link opens it (a universal link on iOS, an app link on Android)
 *   with the route filled in; the rider still chooses the fare and books there.
 * - Without it, `appmetrica_tracking_id` decides where the link goes: the app's store page or the
 *   Yandex Go website. The ID is required.
 * - `tariffClass` and `ref` are optional and left out: the app picks no fare and has no partner ID.
 *
 * The link carries the group's shared meeting point and destination, which are member-only, so
 * it is never logged, sent to analytics or put in an error.
 */

/** Where the documented redirect sends a rider who doesn't have Yandex Go. */
export type YandexGoFallback = 'store' | 'website';

/** The documented `appmetrica_tracking_id` values for each fallback. */
const TRACKING_IDS: Record<YandexGoFallback, string> = {
  store: '1178268795219780156',
  website: '25395763362139037',
};

const ROUTE_URL = 'https://3.redirect.appmetrica.yandex.com/route';

/** The page language Yandex Go is asked to use; the app's copy is English. */
const LINK_LANGUAGE = 'en';

/**
 * Coordinates are written with 6 decimals (about 0.1 m), more precision than the shared places
 * have, so rounding never moves a point.
 */
const COORDINATE_DECIMALS = 6;

/**
 * The two points a taxi link carries: where the group is picked up (its meeting point) and where
 * it goes (its destination). Both are shared places the members reviewed, never a rider's own
 * location, and the link has no stops in between.
 */
export type TaxiTrip = { pickup: CoordinatesDto; destination: CoordinatesDto };

/**
 * Whether both points are real coordinates (finite, latitude -90…90, longitude -180…180, nothing
 * else), as the contract's `CoordinatesSchema` defines them.
 */
export function isValidTaxiTrip(trip: TaxiTrip): boolean {
  return CoordinatesSchema.safeParse(trip.pickup).success && CoordinatesSchema.safeParse(trip.destination).success;
}

function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(COORDINATE_DECIMALS)));
}

function pointParams(prefix: 'start' | 'end', point: CoordinatesDto): [string, string][] {
  return [
    [`${prefix}-lat`, formatCoordinate(point.latitude)],
    [`${prefix}-lon`, formatCoordinate(point.longitude)],
  ];
}

/**
 * The Yandex Go link for `trip`. `fallback` chooses where it leads when the app is missing:
 * the store page (the first attempt) or the website (the fallback when opening failed).
 *
 * @throws {RangeError} When {@link isValidTaxiTrip} fails; callers check first (see `openTaxi`),
 *   so this only guards against building a link to the wrong place. The error holds no coordinate.
 */
export function buildYandexGoLink(trip: TaxiTrip, fallback: YandexGoFallback): string {
  if (!isValidTaxiTrip(trip)) throw new RangeError('A taxi link needs valid pickup and destination coordinates.');
  // Built by hand: React Native's `URLSearchParams` has lacked methods in some versions.
  const params: [string, string][] = [
    ...pointParams('start', trip.pickup),
    ...pointParams('end', trip.destination),
    ['appmetrica_tracking_id', TRACKING_IDS[fallback]],
    ['lang', LINK_LANGUAGE],
  ];
  return `${ROUTE_URL}?${params.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')}`;
}
