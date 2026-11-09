import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker, type MapMarker, type Region } from 'react-native-maps';

import { isMapProviderConfigured } from '../../config/isMapProviderConfigured';
import type { LocationStatus } from '../../platform/location/createLocationController';
import type { MapCoverage } from '../../ui/MapLayout';
import { Notice } from '../../ui/Notice';
import { colors, spacing } from '../../ui/tokens';
import { describePickup, type ConfirmedPickup } from '../location/LocationChoicesProvider';

type HomeMapProps = {
  /** From `useHomeCamera`, which moves the camera through it. */
  mapRef: RefObject<MapView | null>;
  initialRegion: Region;
  onMapReady: () => void;
  /** Any touch on the map: the user is moving the camera themselves. */
  onUserGesture: () => void;
  /** The camera started or kept moving, by a gesture or an animation. */
  onRegionChange?: () => void;
  /** The camera came to rest, showing `region`. */
  onRegionChangeComplete?: (region: Region) => void;
  /** Google Maps drew the first view's tiles; Apple Maps never calls it (`useMapTileStatus`). */
  onMapLoaded?: () => void;
  /** The space the screen's overlays cover, kept clear of the camera's centre and the provider's notices. */
  coverage: MapCoverage;
  /** The device position is drawn only while `located`. */
  location: LocationStatus;
  pickup: ConfirmedPickup | null;
  /** More map content, such as the discovery markers (MAP-002-B), drawn under the user's own. */
  children?: ReactNode;
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
 *
 * The padding is passed only once the map reports ready: react-native-maps 1.27.2 on Android
 * throws a NullPointerException (`GoogleMap.setPadding` on a null map) when the padding changes
 * after the view is laid out but before Google Maps is ready, which a remount showed (VERIFY-005)
 * and a slow device could hit on any start, since the sheet's coverage arrives after layout.
 *
 * On Android a map that was detached under another screen is replaced by a fresh instance at the
 * last rested camera region when it reports ready again (`NativeHomeMap`), so markers removed or
 * added meanwhile are drawn correctly. `onMapReady` is then called again for the new instance.
 */
export function HomeMap({ initialRegion, onRegionChangeComplete, ...mapProps }: HomeMapProps) {
  // One native map instance at a time; a re-attached Android map is replaced by a fresh one
  // that opens where the camera last came to rest (see `NativeHomeMap`).
  const [instance, setInstance] = useState({ key: 0, region: initialRegion });
  const restedRegion = useRef(initialRegion);
  if (!isMapProviderConfigured()) {
    return (
      <View style={[styles.unavailable, { paddingTop: mapProps.coverage.top + spacing.lg }]}>
        <Notice
          tone="warning"
          message="The map can't be shown in this build. You can still choose a pickup point by name."
        />
      </View>
    );
  }

  return (
    <NativeHomeMap
      key={instance.key}
      {...mapProps}
      initialRegion={instance.region}
      onRegionChangeComplete={(region) => {
        restedRegion.current = region;
        onRegionChangeComplete?.(region);
      }}
      onReattached={() => setInstance(({ key }) => ({ key: key + 1, region: restedRegion.current }))}
    />
  );
}

/**
 * One native map. On Android, react-native-maps 1.27.2 loses track of its markers while the view
 * is detached from the window, which happens whenever another screen is pushed over home
 * (react-native-screens detaches the screen underneath). `onDetachedFromWindow` moves the tracked
 * features aside and empties the list Fabric reads children from, so every marker removed while
 * detached is a no-op (`SurfaceMountingManager` logs "view already removed from parent!"): the
 * marker stays on the map and, once its custom view is dropped, turns into a default red pin
 * ("ghost pin", VERIFY-006). A marker added while detached can also replace a tracked one, which
 * is how the own "You" marker vanished. On re-attaching, the view reports itself ready a second
 * time and re-adds the set-aside features to new marker collections.
 *
 * That second ready report is the signal: instead of drawing on the corrupted instance, the
 * caller mounts a fresh one (`onReattached`), which drops every native marker of the old one.
 * Apple Maps never reports ready twice, and iOS keeps its markers anyway.
 */
function NativeHomeMap({
  mapRef,
  initialRegion,
  onMapReady,
  onReattached,
  onUserGesture,
  onRegionChange,
  onRegionChangeComplete,
  onMapLoaded,
  coverage,
  location,
  pickup,
  children,
}: HomeMapProps & { onReattached: () => void }) {
  const [ready, setReady] = useState(false);
  const reportedReady = useRef(false);

  return (
    <MapView
      ref={mapRef}
      testID="home-map"
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      mapPadding={ready ? coverage : undefined}
      onMapReady={() => {
        if (reportedReady.current) {
          if (Platform.OS === 'android') onReattached();
          return;
        }
        reportedReady.current = true;
        setReady(true);
        onMapReady();
      }}
      onMapLoaded={onMapLoaded}
      onRegionChange={onRegionChange}
      onRegionChangeComplete={onRegionChangeComplete}
      onTouchStart={onUserGesture}
      userInterfaceStyle="light"
      pitchEnabled={false}
      rotateEnabled={false}
      toolbarEnabled={false}
      showsUserLocation={false}
      showsMyLocationButton={false}
    >
      {children}
      {location.kind === 'located' ? <DevicePosition status={location} /> : null}
      {pickup !== null ? (
        <Marker
          coordinate={pickup.location.coordinates}
          title="Pickup point"
          description={describePickup(pickup)}
          pinColor={colors.ink}
          accessibilityLabel={`Pickup point: ${describePickup(pickup)}`}
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
