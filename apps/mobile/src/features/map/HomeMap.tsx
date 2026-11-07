import { useEffect, useRef, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, type MapMarker, type Region } from 'react-native-maps';

import { isMapProviderConfigured } from '../../config/isMapProviderConfigured';
import type { LocationStatus } from '../../platform/location/createLocationController';
import type { MapCoverage } from '../../ui/MapLayout';
import { Notice } from '../../ui/Notice';
import { colors, spacing } from '../../ui/tokens';
import type { ConfirmedPickup } from '../location/LocationChoicesProvider';

type HomeMapProps = {
  /** From `useHomeCamera`, which moves the camera through it. */
  mapRef: RefObject<MapView | null>;
  initialRegion: Region;
  onMapReady: () => void;
  /** Any touch on the map: the user is moving the camera themselves. */
  onUserGesture: () => void;
  /** The space the screen's overlays cover, kept clear of the camera's centre and the provider's notices. */
  coverage: MapCoverage;
  /** The device position is drawn only while `located`. */
  location: LocationStatus;
  pickup: ConfirmedPickup | null;
};

/**
 * The home map: Apple Maps on iOS and Google Maps on Android, each the platform's default
 * provider, so nothing chooses one here.
 *
 * It draws only the device position and the user's own confirmed pickup point; ride and group
 * markers arrive with discovery (MAP-002). The position comes from the location controller, not
 * the provider's own user dot, so it never appears without permission (the iOS dot would prompt
 * for it), shows the controller's frozen fix, and is drawn muted once out of date. Under
 * approximate permission only the accuracy circle is drawn, never a precise-looking dot.
 *
 * Pitch and rotation are off, so the map stays flat and north-up. Android's map toolbar, which
 * opens Google Maps, is off too.
 */
export function HomeMap({ mapRef, initialRegion, onMapReady, onUserGesture, coverage, location, pickup }: HomeMapProps) {
  if (!isMapProviderConfigured()) {
    return (
      <View style={[styles.unavailable, { paddingTop: coverage.top + spacing.lg }]}>
        <Notice tone="warning" message="The map can't be shown in this build. You can still choose a pickup point by name." />
      </View>
    );
  }

  return (
    <MapView
      ref={mapRef}
      testID="home-map"
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      mapPadding={coverage}
      onMapReady={onMapReady}
      onTouchStart={onUserGesture}
      userInterfaceStyle="light"
      pitchEnabled={false}
      rotateEnabled={false}
      toolbarEnabled={false}
      showsUserLocation={false}
      showsMyLocationButton={false}
    >
      {location.kind === 'located' ? <DevicePosition status={location} /> : null}
      {pickup !== null ? (
        <Marker
          coordinate={pickup.location.coordinates}
          title="Pickup point"
          description={`Near ${pickup.label}`}
          pinColor={colors.ink}
          accessibilityLabel={`Pickup point near ${pickup.label}`}
        />
      ) : null}
    </MapView>
  );
}

function DevicePosition({ status }: { status: Extract<LocationStatus, { kind: 'located' }> }) {
  const { fix } = status;
  const stale = status.assessment.age === 'stale';
  const tint = stale ? colors.muted : colors.teal;
  const markerRef = useRef<MapMarker>(null);
  // Android draws a custom marker's view once as an image and does not redraw it when only the
  // view's colour changes, so the dot would stay teal once out of date. Ask for a redraw after the
  // new colour is on screen; iOS shows the view itself and redraws anyway.
  useEffect(() => {
    const frame = requestAnimationFrame(() => markerRef.current?.redraw());
    return () => cancelAnimationFrame(frame);
  }, [stale]);
  return (
    <>
      {fix.accuracyMeters !== null ? (
        <Circle
          center={fix.coordinates}
          radius={fix.accuracyMeters}
          // About 15% and 40% opacity of the dot's colour.
          fillColor={`${tint}26`}
          strokeColor={`${tint}66`}
          strokeWidth={1}
        />
      ) : null}
      {fix.approximate ? null : (
        <Marker
          ref={markerRef}
          coordinate={fix.coordinates}
          anchor={{ x: 0.5, y: 0.5 }}
          accessibilityLabel={stale ? 'Your location, out of date' : 'Your location'}
        >
          <View style={styles.dotRing}>
            <View style={[styles.dot, { backgroundColor: tint }]} />
          </View>
        </Marker>
      )}
    </>
  );
}

const DOT = 14;

const styles = StyleSheet.create({
  unavailable: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.soft,
  },
  dotRing: {
    width: DOT + 8,
    height: DOT + 8,
    borderRadius: (DOT + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
});
