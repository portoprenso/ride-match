import { PLACE_SEARCH_POLICY, type PlaceSearchArea, type SearchPlacesInput } from '@ride-match/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useDataSource } from '../../data/DataSourceProvider';
import { placeSearchQuery } from '../../data/queries';

/**
 * The area place searches cover: the demo city with a radius that reaches its outskirts and
 * airport. It is a fixed public area, coarse as `PlaceSearchAreaSchema` requires, and never
 * derived from the device position. The home map also opens on it (`DEMO_CITY_REGION`) but does
 * not narrow searches to its visible region; MAP-001-B's map-centre picker decides that.
 */
export const DEFAULT_BROWSE_AREA: PlaceSearchArea = {
  center: { latitude: 42.87, longitude: 74.59 },
  radiusMeters: 30_000,
};

/** How long typing must pause before a search is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

function useDebouncedValue<Value>(value: Value, delayMs: number): Value {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Searches the curated places by name through the data source, for choosing a pickup point.
 * Empty text lists the area's places nearest its center first.
 *
 * Typing is debounced, a read the user moved past is aborted, and the previous results stay on
 * screen while the next ones load. Failures arrive as `DataError`s.
 *
 * @param text What the user typed; it is trimmed here.
 * @param enabled False while nothing shows the results, so no read is sent.
 */
export function usePlaceSearch(text: string, enabled: boolean) {
  const dataSource = useDataSource();
  const query = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  const input: SearchPlacesInput = {
    area: DEFAULT_BROWSE_AREA,
    limit: PLACE_SEARCH_POLICY.maxResults,
    ...(query === '' ? {} : { query }),
  };
  return useQuery({ ...placeSearchQuery(dataSource, input), enabled, placeholderData: keepPreviousData });
}
