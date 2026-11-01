import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useLocationController } from '../../platform/location/LocationProvider';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { MapLayout } from '../../ui/MapLayout';
import { colors, radii, spacing } from '../../ui/tokens';
import { HomeLocationPanel, useLocationStatus } from '../location/HomeLocation';
import { useLocationChoices } from '../location/LocationChoicesProvider';
import { HomeMap } from './HomeMap';
import { useHomeCamera } from './mapCamera';

/**
 * The map-first home (screens 02 and 21): anyone can pan and zoom it, with or without location
 * permission, and choose a pickup point by name from its sheet.
 *
 * While home is the focused screen it keeps the controller's foreground observation running, so
 * the position on the map follows the device; another screen on top stops it. "Show my location"
 * appears only with a position to show: it moves the camera there and asks for a fresh fix.
 *
 * @param onSignIn - Opens the sign-in placeholder. This always-visible entry is temporary:
 *   the product asks for sign-in only when a protected action needs it, and AUTH-001
 *   replaces this button with that gating.
 * @param onOpenDemo - Opens the demo controls; given only in builds that have them, where the
 *   Demo badge becomes a button.
 */
export function MapHomeScreen({ onSignIn, onOpenDemo }: { onSignIn: () => void; onOpenDemo?: () => void }) {
  const controller = useLocationController();
  const { pickup } = useLocationChoices();
  const status = useLocationStatus();
  const fix = status.kind === 'located' ? status.fix : null;
  const { mapRef, initialRegion, onMapReady, onUserGesture, recenter } = useHomeCamera({ fix, pickup });

  useFocusEffect(useCallback(() => controller.observe(), [controller]));

  return (
    <MapLayout
      renderMap={(coverage) => (
        <HomeMap
          mapRef={mapRef}
          initialRegion={initialRegion}
          onMapReady={onMapReady}
          onUserGesture={onUserGesture}
          coverage={coverage}
          location={status}
          pickup={pickup}
        />
      )}
      header={
        <View style={styles.header}>
          <View style={styles.title}>
            <AppText variant="subheading" accessibilityRole="header">
              along
            </AppText>
          </View>
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
        </View>
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
        <>
          <HomeLocationPanel
            status={status}
            fallback={
              <View style={styles.intro}>
                <AppText variant="section" accessibilityRole="header">
                  Going the same way?
                </AppText>
                <AppText color="muted">Explore the map. Nearby ride plans aren&apos;t shown on it yet.</AppText>
              </View>
            }
          />
          <Button label="Sign in" variant="ghost" onPress={onSignIn} />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
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
  intro: {
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
});
