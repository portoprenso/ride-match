import { Linking } from 'react-native';

import { buildYandexGoLink, isValidTaxiTrip, type TaxiTrip, type YandexGoFallback } from './yandexGo';

/*
 * The app's one taxi boundary (TAXI-001-A): it hands a reviewed trip to Yandex Go, the only
 * provider, and reports what the OS said. It books nothing, reads or changes no group, and keeps
 * no state; the screen that calls it decides what to show and refreshes the group afterwards.
 */

/** The part of React Native's `Linking` the taxi boundary uses, so tests can supply their own. */
export type TaxiLinking = Pick<typeof Linking, 'openURL'>;

/**
 * What opening a taxi link came to:
 *
 * - `handed-off`: the OS accepted the link. That proves neither that Yandex Go opened (the
 *   link may have gone to the store page or the website instead), nor a booking, a departure or
 *   the group's completion.
 * - `failed`: the OS refused the link or threw. Nothing about the trip was kept; the caller
 *   offers a retry, the website ({@link openTaxiWebsite}) or the trip's details to copy.
 * - `invalid`: the trip's coordinates are not real points, so nothing was opened.
 */
export type TaxiOpenOutcome = { kind: 'handed-off' } | { kind: 'failed' } | { kind: 'invalid' };

async function openYandexGo(
  trip: TaxiTrip,
  fallback: YandexGoFallback,
  linking: TaxiLinking,
): Promise<TaxiOpenOutcome> {
  if (!isValidTaxiTrip(trip)) return { kind: 'invalid' };
  try {
    await linking.openURL(buildYandexGoLink(trip, fallback));
    return { kind: 'handed-off' };
  } catch {
    // The OS error repeats the link, which holds the group's member-only places, so it is
    // dropped rather than logged or passed on; the outcome says all the caller needs.
    return { kind: 'failed' };
  }
}

/**
 * Opens Yandex Go with `trip`'s pickup and destination. Where the app is missing, the link leads
 * to its store page. The OS is asked once; a retry is the caller's, on the rider's request.
 *
 * Never logs or reports the link or the coordinates.
 */
export function openTaxi(trip: TaxiTrip, linking: TaxiLinking = Linking): Promise<TaxiOpenOutcome> {
  return openYandexGo(trip, 'store', linking);
}

/**
 * The fallback after {@link openTaxi} failed: the same trip, through the link that leads to the
 * Yandex Go website where the app is missing. Same outcomes and privacy as `openTaxi`.
 */
export function openTaxiWebsite(trip: TaxiTrip, linking: TaxiLinking = Linking): Promise<TaxiOpenOutcome> {
  return openYandexGo(trip, 'website', linking);
}
