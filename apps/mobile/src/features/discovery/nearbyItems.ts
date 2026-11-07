import type { CoordinatesDto, NearbyItemDto } from '@ride-match/contracts';
import type { Region } from 'react-native-maps';

import { distanceMeters } from '../location/nearestPlace';

/** A stable key for a discovery item, unique across rides and groups. */
export function itemKey(item: Pick<NearbyItemDto, 'kind' | 'id'>): string {
  return `${item.kind}:${item.id}`;
}

/**
 * Approximate distance in words, such as "~350 m" or "~1.2 km". It is measured from the item's
 * public area centre, so it is never presented as exact: below a kilometre it is rounded to 50 m.
 */
export function approximateDistance(from: Readonly<CoordinatesDto>, to: Readonly<CoordinatesDto>): string {
  const meters = distanceMeters(from, to);
  if (meters < 1000) return `~${Math.max(50, Math.round(meters / 50) * 50)} m`;
  return `~${(Math.round(meters / 100) / 10).toFixed(1)} km`;
}

/** When the ride leaves, in words, from `now` (device time). */
export function departureText(departureAt: string, now: number): string {
  const minutes = Math.round((Date.parse(departureAt) - now) / 60_000);
  if (minutes <= 0) return 'Leaving now';
  return `Leaving in ${minutes} min`;
}

export type ItemDescription = {
  /** Such as "Aida → Asia Mall" or "Group → TSUM". */
  title: string;
  /** Such as "~350 m · Leaving in 5 min" or "3/4 people · Leaving now". */
  detail: string;
  /** The marker's short text, such as "Asia Mall · ~350 m" or "TSUM · 3/4". */
  markerLabel: string;
};

/**
 * Words for a public discovery item. Only public fields are used: the rider's display name, the
 * curated destination, the group's occupancy (people, out of four), the departure, and a
 * distance from the item's public area to the device's own position when there is one.
 *
 * @param fix The device position, or `null` without one; no distance is shown then.
 */
export function describeItem(item: NearbyItemDto, fix: Readonly<CoordinatesDto> | null, now: number): ItemDescription {
  const distance = fix === null ? null : approximateDistance(fix, item.publicOrigin.center);
  const leaving = departureText(item.departureAt, now);
  const destination = item.destination.label;
  if (item.kind === 'group') {
    const occupancy = `${item.memberCount}/${item.capacity}`;
    return {
      title: `Group → ${destination}`,
      detail: [`${occupancy} people`, distance, leaving].filter(Boolean).join(' · '),
      markerLabel: `${destination} · ${occupancy}`,
    };
  }
  return {
    title: `${item.user.displayName} → ${destination}`,
    detail: [distance, leaving].filter(Boolean).join(' · '),
    markerLabel: distance === null ? destination : `${destination} · ${distance}`,
  };
}

/** How many grid cells span the visible width; more cells means smaller clusters. */
const CELLS_ACROSS = 5;

export type MapEntry =
  | { kind: 'item'; key: string; item: NearbyItemDto; coordinate: CoordinatesDto }
  | { kind: 'cluster'; key: string; items: NearbyItemDto[]; coordinate: CoordinatesDto };

/**
 * Groups discovery items that would overlap at the current zoom into clusters (design 53).
 *
 * Items fall into square grid cells anchored to whole multiples of the cell size, and the size
 * is a power of two of a degree, so clusters do not reshuffle while the map pans and change only
 * at zoom steps. A cell with one item shows that item; with more, one cluster at their mean
 * position whose count is the number of items, never people: a group counts once. The list
 * keeps the source's order (nearest the viewport centre first).
 */
export function clusterItems(items: readonly NearbyItemDto[], region: Readonly<Region>): MapEntry[] {
  const target = Math.max(region.longitudeDelta, region.latitudeDelta) / CELLS_ACROSS;
  const cell = 2 ** Math.floor(Math.log2(Math.max(target, 1e-6)));
  const cells = new Map<string, NearbyItemDto[]>();
  for (const item of items) {
    const { latitude, longitude } = item.publicOrigin.center;
    const key = `${Math.floor(latitude / cell)}:${Math.floor(longitude / cell)}`;
    const members = cells.get(key);
    if (members) members.push(item);
    else cells.set(key, [item]);
  }
  return [...cells.entries()].map(([key, members]) => {
    if (members.length === 1) {
      const item = members[0]!;
      return { kind: 'item', key: itemKey(item), item, coordinate: item.publicOrigin.center };
    }
    const latitude = members.reduce((sum, item) => sum + item.publicOrigin.center.latitude, 0) / members.length;
    const longitude = members.reduce((sum, item) => sum + item.publicOrigin.center.longitude, 0) / members.length;
    return { kind: 'cluster', key: `cluster:${key}`, items: members, coordinate: { latitude, longitude } };
  });
}

/** Closest zoom a cluster tap goes to, about a kilometre across. */
const MIN_ZOOM_DELTA = 0.01;

/**
 * Where a cluster tap takes the camera: a region around its items, or `null` when zooming in
 * cannot separate them (they share one public area, or the map is already that close). The
 * screen then lists the cluster's items instead.
 */
export function clusterZoomRegion(items: readonly NearbyItemDto[], region: Readonly<Region>): Region | null {
  const latitudes = items.map((item) => item.publicOrigin.center.latitude);
  const longitudes = items.map((item) => item.publicOrigin.center.longitude);
  const latSpan = Math.max(...latitudes) - Math.min(...latitudes);
  const lonSpan = Math.max(...longitudes) - Math.min(...longitudes);
  const delta = Math.max(latSpan, lonSpan) * 2;
  if (delta < MIN_ZOOM_DELTA / 2 || Math.max(region.latitudeDelta, region.longitudeDelta) <= MIN_ZOOM_DELTA)
    return null;
  const next = Math.max(delta, MIN_ZOOM_DELTA);
  if (next >= Math.max(region.latitudeDelta, region.longitudeDelta)) return null;
  return {
    latitude: (Math.max(...latitudes) + Math.min(...latitudes)) / 2,
    longitude: (Math.max(...longitudes) + Math.min(...longitudes)) / 2,
    latitudeDelta: next,
    longitudeDelta: next,
  };
}
