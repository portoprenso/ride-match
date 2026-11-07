import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';

import { isMapProviderConfigured } from '../../config/isMapProviderConfigured';
import { useLocationController } from '../../platform/location/LocationProvider';
import { useMapTileStatus } from '../../platform/map/useMapTileStatus';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { MapLayout, type MapCoverage } from '../../ui/MapLayout';
import { colors, radii, spacing } from '../../ui/tokens';
import { HomeLocationPanel, useLocationStatus } from '../location/HomeLocation';
import { useLocationChoices } from '../location/LocationChoicesProvider';
import { PickupPlaceSheet } from '../location/PickupPlaceSheet';
import { HomeMap } from './HomeMap';
import { CentrePin, MapPointPanel, useMapPointPicker } from './MapPointPicker';
import { useHomeCamera } from './mapCamera';

/**
 * The map-first home (screens 02 and 21): anyone can pan and zoom it, with or without location
 * permission, and choose a pickup point by name from its sheet.
 *
 * While home is the focused screen it keeps the controller's foreground observation running, so
 * the position on the map follows the device; another screen on top stops it. "Show my location"
 * appears only with a position to show: it moves the camera there and asks for a fresh fix.
 *
 * "Choose pickup area" and "Change pickup point" switch home into the map picker (screen 22):
 * a fixed pin over the visible centre, the sheet naming the nearest place, and an explicit
 * confirmation that only changes this launch's pickup choice. "Choose a named place" opens the
 * named list instead, the alternative for anyone who cannot drag a map; a build without a map
 * goes straight to it. The header's back button, or Android back, leaves the picker unchanged.
 *
 * @param onSignIn - Opens sign-in; given only while nobody is signed in. This entry is
 *   temporary: the product asks for sign-in when a protected action needs it
 *   (`useRequireSignIn`), and the first protected action (RIDE-001) replaces this button.
 * @param onOpenDemo - Opens the demo controls; given only in builds that have them, where the
 *   Demo badge becomes a button.
 * @param onOpenSettings - Opens settings, for anonymous and signed-in riders alike.
 */
export function MapHomeScreen({
  onSignIn,
  onOpenDemo,
  onOpenSettings,
}: {
  onSignIn?: () => void;
  onOpenDemo?: () => void;
  onOpenSettings: () => void;
}) {
  const controller = useLocationController();
  const { pickup } = useLocationChoices();
  const status = useLocationStatus();
  const fix = status.kind === 'located' ? status.fix : null;
  const { mapRef, initialRegion, onMapReady, onUserGesture, recenter } = useHomeCamera({ fix, pickup });
  const configured = isMapProviderConfigured();
  const tiles = useMapTileStatus({ configured, reportsLoading: Platform.OS === 'android' });
  const [picking, setPicking] = useState(false);
  const [namedOpen, setNamedOpen] = useState(false);
  const [coverage, setCoverage] = useState<MapCoverage>(NO_COVERAGE);
  const picker = useMapPointPicker(mapRef, coverage, picking);

  useFocusEffect(useCallback(() => controller.observe(), [controller]));
  // Android back leaves the picker before it leaves the screen.
  useFocusEffect(
    useCallback(() => {
      if (!picking) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setPicking(false);
        return true;
      });
      return () => subscription.remove();
    }, [picking]),
  );

  return (
    <>
      <MapLayout
        renderMap={(mapCoverage) => (
          <View style={StyleSheet.absoluteFill} onLayout={picker.onLayout} testID="home-map-area">
            <CoverageTracker coverage={mapCoverage} onChange={setCoverage} />
            <HomeMap
              mapRef={mapRef}
              initialRegion={initialRegion}
              onMapReady={onMapReady}
              onUserGesture={onUserGesture}
              onRegionChange={picker.onRegionChange}
              onRegionChangeComplete={picker.onRegionChangeComplete}
              onMapLoaded={tiles.onMapLoaded}
              coverage={mapCoverage}
              location={status}
              pickup={pickup}
            />
            {picking ? <CentrePin coverage={mapCoverage} /> : null}
          </View>
        )}
        header={
          picking ? (
            <View style={styles.pickerHeader}>
              <IconButton
                icon={<Icon name="back" />}
                accessibilityLabel="Stop choosing on the map"
                tone="white"
                onPress={() => setPicking(false)}
              />
              <View style={styles.title}>
                <AppText variant="label" accessibilityRole="header">
                  Confirm pickup
                </AppText>
              </View>
            </View>
          ) : (
            <View style={styles.header}>
              <View style={styles.title}>
                <AppText variant="subheading" accessibilityRole="header">
                  along
                </AppText>
              </View>
              <View style={styles.actions}>
                {onOpenDemo ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Demo scenarios"
                    hitSlop={spacing.md}
                    onPress={onOpenDemo}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Badge label="Demo" />
                  </Pressable>
                ) : (
                  <Badge label="Demo" />
                )}
                <IconButton
                  icon={<Icon name="sliders" />}
                  accessibilityLabel="Settings"
                  tone="white"
                  onPress={onOpenSettings}
                />
              </View>
            </View>
          )
        }
        controls={
          fix !== null ? (
            <IconButton
              icon={<Icon name="locate" />}
              accessibilityLabel="Show my location"
              tone="white"
              onPress={() => {
                recenter();
                void controller.refresh();
              }}
            />
          ) : null
        }
        sheet={
          picking ? (
            <MapPointPanel
              point={picker.point}
              moving={picker.moving}
              tileStatus={tiles.status}
              onConfirmed={() => setPicking(false)}
              onChooseNamed={() => setNamedOpen(true)}
            />
          ) : (
            <>
              <HomeLocationPanel
                status={status}
                onChooseOnMap={configured ? () => setPicking(true) : undefined}
                fallback={
                  <View style={styles.intro}>
                    <AppText variant="section" accessibilityRole="header">
                      Going the same way?
                    </AppText>
                    <AppText color="muted">Explore the map. Nearby ride plans aren&apos;t shown on it yet.</AppText>
                  </View>
                }
              />
              {onSignIn && <Button label="Sign in" variant="ghost" onPress={onSignIn} />}
            </>
          )
        }
      />
      <PickupPlaceSheet open={namedOpen} onClose={() => setNamedOpen(false)} onConfirmed={() => setPicking(false)} />
    </>
  );
}

const NO_COVERAGE: MapCoverage = { top: 0, right: 0, bottom: 0, left: 0 };

/** Copies the layout's coverage into state, where the picker reads it outside the render callback. */
function CoverageTracker({ coverage, onChange }: { coverage: MapCoverage; onChange: (next: MapCoverage) => void }) {
  const { top, right, bottom, left } = coverage;
  useEffect(() => onChange({ top, right, bottom, left }), [top, right, bottom, left, onChange]);
  return null;
}

const styles = StyleSheet.create({
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  // The map under the title can be any colour, so the title sits on its own surface.
  title: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  intro: {
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
});
