import type { PlaceDto } from '@ride-match/contracts';

import type { Bounds } from './geometry';

/**
 * The demo city the curated data covers: Bishkek and its airport. A place search or nearby
 * read that lies entirely outside it fails with `UNSUPPORTED_AREA`.
 */
export const COVERAGE: Bounds = { south: 42.75, west: 74.4, north: 43.1, east: 74.8 };

/**
 * The curated places that place search returns, as destinations and as named pickup points
 * when the device location is unavailable. They are public venues, never where a person is.
 *
 * Every scenario shares this catalog, and an ID never changes, so a saved draft keeps
 * referring to the same place across resets. Coordinates are approximate, for the demo only.
 */
export const CURATED_PLACES: readonly PlaceDto[] = [
  { id: 'place_ala_too', label: 'Ala-Too Square', detail: 'City square', coordinates: { latitude: 42.8765, longitude: 74.6037 } },
  { id: 'place_asia_mall', label: 'Asia Mall', detail: 'Shopping centre', coordinates: { latitude: 42.8556, longitude: 74.5859 } },
  { id: 'place_bishkek_park', label: 'Bishkek Park', detail: 'Shopping centre', coordinates: { latitude: 42.8752, longitude: 74.5904 } },
  { id: 'place_dordoi_plaza', label: 'Dordoi Plaza', detail: 'Shopping centre', coordinates: { latitude: 42.8743, longitude: 74.6177 } },
  { id: 'place_vefa_center', label: 'Vefa Center', detail: 'Shopping centre', coordinates: { latitude: 42.8574, longitude: 74.6097 } },
  { id: 'place_tsum', label: 'TSUM', detail: 'Department store', coordinates: { latitude: 42.8764, longitude: 74.6143 } },
  { id: 'place_osh_bazaar', label: 'Osh Bazaar', detail: 'Market', coordinates: { latitude: 42.8746, longitude: 74.5698 } },
  { id: 'place_dordoi_bazaar', label: 'Dordoi Bazaar', detail: 'Market', coordinates: { latitude: 42.9407, longitude: 74.6205 } },
  { id: 'place_philharmonic', label: 'Philharmonic Hall', detail: 'Concert hall', coordinates: { latitude: 42.879, longitude: 74.5917 } },
  { id: 'place_bishkek_2', label: 'Bishkek-2 Railway Station', detail: 'Railway station', coordinates: { latitude: 42.8648, longitude: 74.6056 } },
  { id: 'place_western_bus_station', label: 'Western Bus Station', detail: 'Bus station', coordinates: { latitude: 42.877, longitude: 74.5525 } },
  { id: 'place_manas_airport', label: 'Manas International Airport', detail: 'Airport', coordinates: { latitude: 43.0613, longitude: 74.4776 } },
];

const placesById = new Map(CURATED_PLACES.map((place) => [place.id, place]));

/** The curated place with `id`, or `undefined`. */
export function findPlace(id: string): PlaceDto | undefined {
  return placesById.get(id);
}
