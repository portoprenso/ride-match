import { useCallback, useEffect, useState } from 'react';

/** How long the map may take to report its tiles before the app says it is slow. */
export const TILE_CONFIRM_TIMEOUT_MS = 15_000;

/**
 * What the app knows about the map's tiles. It is a platform fact, kept apart from the data
 * source: a source outage never changes it, and a tile problem never marks the source offline.
 *
 * - `not-configured`: this build cannot draw a map (Android without a Google Maps key).
 * - `unknown`: the provider reports nothing about tiles (Apple Maps), so no failure is claimed.
 * - `loading`: the map has not yet reported its tiles drawn.
 * - `loaded`: the map reported its tiles drawn.
 * - `slow`: no report within {@link TILE_CONFIRM_TIMEOUT_MS}; the tiles may be unavailable (no
 *   connection, a blocked key). It is a suspicion, not proof: a later report makes it `loaded`.
 */
export type MapTileStatus = 'not-configured' | 'unknown' | 'loading' | 'loaded' | 'slow';

type MapTileStatusOptions = {
  /** Whether the build can draw a map (`isMapProviderConfigured()`). */
  configured: boolean;
  /**
   * Whether the provider reports drawn tiles through `onMapLoaded`: Google Maps does (Android);
   * Apple Maps does not (iOS).
   */
  reportsLoading: boolean;
};

/**
 * Follows the home map's tiles for the screen that shows it.
 *
 * Google Maps calls `onMapLoaded` once, when the first view's tiles are drawn, so `slow` cannot
 * tell a later recovery unless the map reports again; screens word it as "may not load". Screen
 * 26 (MAP-002-B) builds its fallback on this status.
 *
 * @returns `status`, and `onMapLoaded` to pass to the map.
 */
export function useMapTileStatus({ configured, reportsLoading }: MapTileStatusOptions) {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!configured || !reportsLoading || loaded) return undefined;
    const timer = setTimeout(() => setTimedOut(true), TILE_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [configured, reportsLoading, loaded]);

  const onMapLoaded = useCallback(() => setLoaded(true), []);

  const status: MapTileStatus = !configured
    ? 'not-configured'
    : !reportsLoading
      ? 'unknown'
      : loaded
        ? 'loaded'
        : timedOut
          ? 'slow'
          : 'loading';
  return { status, onMapLoaded };
}
