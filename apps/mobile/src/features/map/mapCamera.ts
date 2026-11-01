import type { CoordinatesDto } from '@ride-match/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';

import type { LocationFix } from '../../platform/location/locationFix';
import type { ConfirmedPickup } from '../location/LocationChoicesProvider';
import { DEFAULT_BROWSE_AREA } from '../location/usePlaceSearch';

/** The demo city at city scale, where the map opens without a position or a pickup point. */
export const DEMO_CITY_REGION: Region = Object.freeze({
  ...DEFAULT_BROWSE_AREA.center,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
});

/** Camera moves the app makes itself; the user's own gestures are the provider's. */
export const CAMERA_ANIMATION_MS = 500;

/** About a kilometre across, centred on `coordinates`. */
export function streetRegion(coordinates: Readonly<CoordinatesDto>): Region {
  return { ...coordinates, latitudeDelta: 0.01, longitudeDelta: 0.01 };
}

type HomeCameraInput = {
  /** The device position the map shows, or `null` when there is none to show. */
  fix: LocationFix | null;
  pickup: ConfirmedPickup | null;
};

/**
 * Where the home map's camera goes, decided once per cause so nothing keeps pulling it back.
 *
 * - It opens on the confirmed pickup, else the device position, else the demo city.
 * - The first device position after that moves it once, unless the user touched the map first.
 * - `recenter()` moves it to the current position and lets the next one (from the refresh the
 *   caller starts) move it once more, again unless the user touches the map.
 * - A newly confirmed pickup moves it there and ends any wait for a position.
 * - Later positions only move the dot.
 *
 * Moves asked for before the map is ready happen when it becomes ready, since Google Maps
 * ignores camera commands until then.
 */
export function useHomeCamera({ fix, pickup }: HomeCameraInput) {
  const mapRef = useRef<MapView>(null);
  const [initialRegion] = useState(() =>
    pickup !== null ? streetRegion(pickup.location.coordinates) : fix !== null ? streetRegion(fix.coordinates) : DEMO_CITY_REGION,
  );
  const ready = useRef(false);
  const pending = useRef<Region | null>(null);
  const followNextFix = useRef(fix === null && pickup === null);
  const shownPickup = useRef(pickup);

  const show = useCallback((region: Region) => {
    if (ready.current) mapRef.current?.animateToRegion(region, CAMERA_ANIMATION_MS);
    else pending.current = region;
  }, []);

  useEffect(() => {
    if (fix === null || !followNextFix.current) return;
    followNextFix.current = false;
    show(streetRegion(fix.coordinates));
  }, [fix, show]);

  useEffect(() => {
    if (pickup === null || pickup === shownPickup.current) return;
    shownPickup.current = pickup;
    followNextFix.current = false;
    show(streetRegion(pickup.location.coordinates));
  }, [pickup, show]);

  return {
    mapRef,
    initialRegion,
    onMapReady() {
      ready.current = true;
      if (pending.current === null) return;
      mapRef.current?.animateToRegion(pending.current, CAMERA_ANIMATION_MS);
      pending.current = null;
    },
    /** The user touched the map, so automatic moves stop until they recenter. */
    onUserGesture() {
      followNextFix.current = false;
    },
    recenter() {
      if (fix !== null) show(streetRegion(fix.coordinates));
      followNextFix.current = true;
    },
  };
}
