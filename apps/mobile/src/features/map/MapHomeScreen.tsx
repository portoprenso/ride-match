import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { Region } from 'react-native-maps';

import { isMapProviderConfigured } from '../../config/isMapProviderConfigured';
import { useAnalytics } from '../../analytics/AnalyticsProvider';
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
import type { NearbyItemDto } from '@ride-match/contracts';
import { useDemoSignIn } from '../../data/DemoSignInProvider';
import { useRequireSignIn, useResumeIntent } from '../auth/PendingIntentProvider';
import { DiscoveryMarkers } from '../discovery/DiscoveryMarkers';
import { DiscoveryPanel } from '../discovery/DiscoveryPanel';
import { clusterItems, clusterZoomRegion, itemKey } from '../discovery/nearbyItems';
import { NearbyListSheet, type NearbyListContent } from '../discovery/NearbyListSheet';
import { PreviewPanel, previewTitle } from '../discovery/PreviewPanel';
import { useTargetPreview, type PreviewTarget } from '../discovery/useTargetPreview';
import { useClock } from '../discovery/useClock';
import { useNearbyDiscovery } from '../discovery/useNearbyDiscovery';
import { useLocationChoices } from '../location/LocationChoicesProvider';
import { PickupPlaceSheet } from '../location/PickupPlaceSheet';
import { HomeMap } from './HomeMap';
import { CentrePin, MapPointPanel, useMapPointPicker } from './MapPointPicker';
import { CAMERA_ANIMATION_MS, streetRegion, useHomeCamera } from './mapCamera';

/**
 * The map-first home (screens 02 and 21): anyone can pan and zoom it, with or without location
 * permission, and choose a pickup point by name from its sheet. The sheet starts with nearby
 * activity for the region the map last rested on (`useNearbyDiscovery`, MAP-002-A), which never
 * moves the camera. The first time the map shows in a session, `map_opened` is tracked.
 *
 * A marker, or a row of the nearby list, opens that ride or group's public preview in the sheet
 * (screens 05 and 19, MAP-002-C), with its marker highlighted. The preview reads the target again;
 * if the source no longer has it, the sheet says the plan changed and offers to refresh nearby
 * plans (screen 55). Its join action reserves nothing: it records the intent, through sign-in for
 * an anonymous rider, after which the preview reopens and reads the target again.
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
  // The region the map last came to rest on; discovery reads it, and never moves the camera.
  const [region, setRegion] = useState<Region>(initialRegion);
  const discovery = useNearbyDiscovery(region);
  const analytics = useAnalytics();
  const demo = useDemoSignIn() !== null;
  // What the map draws: this view's snapshot, the previous view's while this one loads, or the
  // last view while it cannot be refreshed (drawn faded). Nothing while picking a pickup point.
  const snapshot = discovery.kind === 'active' || discovery.kind === 'stale' ? discovery.snapshot : null;
  const staleSnapshot = discovery.kind === 'stale';
  const entries = useMemo(
    () => (snapshot === null || picking ? [] : clusterItems(snapshot.items, region)),
    [snapshot, picking, region],
  );
  // The open preview (screens 05, 19, 55). Its target is read again from the source; the map's
  // copy only fills the sheet while that read is on its way.
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [joinRequested, setJoinRequested] = useState(false);
  const previewKey = preview === null ? null : itemKey(preview);
  const seed = snapshot?.items.find((item) => itemKey(item) === previewKey) ?? null;
  const previewState = useTargetPreview(preview, seed);
  const requireSignIn = useRequireSignIn();
  const [list, setList] = useState<NearbyListContent | null>(null);
  const now = useClock();
  const fixPoint = fix?.coordinates ?? null;

  /** A camera move the user asked for (a cluster or a list row), which ends any automatic one. */
  const moveTo = (target: Region) => {
    onUserGesture();
    mapRef.current?.animateToRegion(target, CAMERA_ANIMATION_MS);
  };
  const openList = () =>
    snapshot &&
    setList({ items: snapshot.items, truncated: snapshot.truncated, stale: staleSnapshot, fromCluster: false });
  const pressCluster = (items: NearbyItemDto[]) => {
    const zoom = clusterZoomRegion(items, region);
    if (zoom !== null) moveTo(zoom);
    else setList({ items, truncated: false, stale: staleSnapshot, fromCluster: true });
  };
  const openPreview = (target: PreviewTarget, joinAsked = false) => {
    setPreview({ kind: target.kind, id: target.id });
    setJoinRequested(joinAsked);
  };
  const closePreview = () => setPreview(null);
  const selectFromList = (item: NearbyItemDto) => {
    setList(null);
    openPreview(item);
    moveTo(streetRegion(item.publicOrigin.center));
  };
  /**
   * "Plan to join" / "Create a request to join": records the intent and reserves nothing. An
   * anonymous rider signs in first; the preview then reopens and reads the target again.
   */
  const planToJoin = () => {
    if (preview === null) return;
    const intent =
      preview.kind === 'ride'
        ? ({ kind: 'join-ride', rideId: preview.id } as const)
        : ({ kind: 'join-group', groupId: preview.id } as const);
    if (requireSignIn(intent)) setJoinRequested(true);
  };
  useResumeIntent('join-ride', (intent) => openPreview({ kind: 'ride', id: intent.rideId }, true));
  useResumeIntent('join-group', (intent) => openPreview({ kind: 'group', id: intent.groupId }, true));

  useFocusEffect(useCallback(() => controller.observe(), [controller]));
  useFocusEffect(useCallback(() => analytics.trackOncePerSession('map_opened'), [analytics]));
  // Android back leaves the picker or the preview before it leaves the screen.
  const inSubMode = picking || preview !== null;
  useFocusEffect(
    useCallback(() => {
      if (!inSubMode) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setPicking(false);
        setPreview(null);
        return true;
      });
      return () => subscription.remove();
    }, [inSubMode]),
  );
  const header = preview !== null && previewState !== null ? previewTitle(preview, previewState, fixPoint, now) : null;

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
              onRegionChangeComplete={(next) => {
                setRegion(next);
                picker.onRegionChangeComplete();
              }}
              onMapLoaded={tiles.onMapLoaded}
              coverage={mapCoverage}
              location={status}
              pickup={pickup}
            >
              <DiscoveryMarkers
                entries={entries}
                selectedKey={previewKey}
                fix={fixPoint}
                now={now}
                stale={staleSnapshot}
                onSelectItem={(item) => openPreview(item)}
                onPressCluster={pressCluster}
              />
            </HomeMap>
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
          ) : header !== null ? (
            <View style={styles.pickerHeader}>
              <IconButton
                icon={<Icon name="back" />}
                accessibilityLabel="Back to map"
                tone="white"
                onPress={closePreview}
              />
              <View style={styles.title}>
                <AppText variant="label" accessibilityRole="header">
                  {header.title}
                </AppText>
                {header.subtitle === null ? null : (
                  <AppText variant="small" color="muted">
                    {header.subtitle}
                  </AppText>
                )}
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
          ) : preview !== null && previewState !== null ? (
            <PreviewPanel
              target={preview}
              state={previewState}
              fix={fixPoint}
              now={now}
              demo={demo}
              joinRequested={joinRequested}
              onJoin={planToJoin}
              onRetry={previewState.retry}
              onRefreshNearby={() => {
                closePreview();
                discovery.retry();
              }}
              onClose={closePreview}
            />
          ) : (
            <>
              <DiscoveryPanel
                state={discovery}
                onRetry={discovery.retry}
                onOpenList={openList}
                tileStatus={tiles.status}
              />
              <HomeLocationPanel status={status} onChooseOnMap={configured ? () => setPicking(true) : undefined} />
              {onSignIn && <Button label="Sign in" variant="ghost" onPress={onSignIn} />}
            </>
          )
        }
      />
      <NearbyListSheet
        content={list}
        onClose={() => setList(null)}
        onSelect={selectFromList}
        fix={fixPoint}
        now={now}
        demo={demo}
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
  pressed: {
    opacity: 0.8,
  },
});
