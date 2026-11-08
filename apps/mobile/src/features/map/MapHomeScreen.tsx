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
import type { DepartureOffsetMinutes, NearbyItemDto, PlaceDto } from '@ride-match/contracts';
import { useDemoSignIn } from '../../data/DemoSignInProvider';
import { useRequireSignIn, useResumeIntent } from '../auth/PendingIntentProvider';
import { DestinationPanel, summarizeDestination } from '../destinations/DestinationPanel';
import { DestinationSheet } from '../destinations/DestinationSheet';
import { DiscoveryMarkers } from '../discovery/DiscoveryMarkers';
import { DiscoveryPanel } from '../discovery/DiscoveryPanel';
import { clusterItems, clusterZoomRegion, describeItem, itemKey } from '../discovery/nearbyItems';
import { NearbyListSheet, type NearbyListContent } from '../discovery/NearbyListSheet';
import { PreviewPanel, previewTitle } from '../discovery/PreviewPanel';
import { useTargetPreview, type PreviewTarget } from '../discovery/useTargetPreview';
import { useClock } from '../discovery/useClock';
import { useNearbyDiscovery } from '../discovery/useNearbyDiscovery';
import { useLocationChoices } from '../location/LocationChoicesProvider';
import { PickupPlaceSheet } from '../location/PickupPlaceSheet';
import { JoinPanel } from '../groups/JoinPanel';
import { CreateRequestSheet, type CreateStep } from '../rides/CreateRequestSheet';
import { CancelRequestSheet } from '../rides/CancelRequestSheet';
import { OwnRequestMarker } from '../rides/OwnRequestMarker';
import { RequestCard } from '../rides/RequestCard';
import { resolveOrigin } from '../rides/rideDraft';
import { useOwnMatches } from '../rides/useOwnMatches';
import { isLive, useOwnRequest } from '../rides/useOwnRequest';
import { indexMatches } from '../destinations/matches';
import { HomeMap } from './HomeMap';
import { CentrePin, MapPointPanel, useMapPointPicker } from './MapPointPicker';
import { CAMERA_ANIMATION_MS, streetRegion, useHomeCamera } from './mapCamera';

/**
 * The map-first home (screens 02 and 21): anyone can pan and zoom it, with or without location
 * permission, and choose a pickup point by name from its sheet. The sheet starts with nearby
 * activity for the region the map last rested on (`useNearbyDiscovery`, MAP-002-A), which never
 * moves the camera. The first time the map shows in a session, `map_opened` is tracked.
 *
 * "Choose a destination" opens the curated destination search (screen 03, DESTINATION-001-B). With
 * a destination, discovery reads its supplied matches: matched markers stand out, the others
 * stay on the map quieter, and the sheet names the best match to inspect (screen 04). Clearing it
 * returns to general browsing; the camera never moves for a destination.
 *
 * With a destination, "Create my ride request" opens the request draft (screens 06 and 09,
 * RIDE-001-B): departure, pickup, sign-in when needed (the draft stays here meanwhile), review and
 * publish. While the rider has a live request no second create is offered: the card (screen 10)
 * counts down the search window and offers "Cancel request" (28); an expired request says so
 * (27) and offers an explicit new draft. The own request is a "You" marker at its pickup.
 *
 * A marker, or a row of the nearby list, opens that ride or group's public preview in the sheet
 * (screens 05 and 19, MAP-002-C), with its marker highlighted. The preview reads the target again;
 * if the source no longer has it, the sheet says the plan changed and offers to refresh nearby
 * plans (screen 55). Its join action reserves nothing. An anonymous rider signs in first; the
 * preview then reopens, reads the target again and goes on by itself. A rider without a live
 * request gets a draft to the target's destination, whose publishing opens the join
 * confirmation; one with an active request goes straight to it (screens 12, 29, 30, 55,
 * GROUP-002-A, `JoinPanel`), a step of the same sheet. A grouped rider is told they are already
 * in a group. Membership shows only once the source answers.
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
  // The rider's chosen destination (designs 03 and 04): local to this screen, it only changes
  // what discovery reads and emphasizes. Clearing it returns to general browsing.
  const [destination, setDestination] = useState<PlaceDto | null>(null);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const discovery = useNearbyDiscovery(region, destination?.id ?? null);
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
  // The rider asked to join from a preview before signing in; going on waits for the fresh read.
  const [joinRequested, setJoinRequested] = useState(false);
  // The join confirmation (screen 12, GROUP-002-A) is a step of the open preview, in the same
  // sheet, so no modal opens while another closes.
  const [joining, setJoining] = useState(false);
  // A join that waits for the rider's new request: publishing it opens the confirmation.
  const [pendingJoin, setPendingJoin] = useState<PreviewTarget | null>(null);
  const previewKey = preview === null ? null : itemKey(preview);
  const seed = snapshot?.items.find((item) => itemKey(item) === previewKey) ?? null;
  const previewState = useTargetPreview(preview, seed);
  const requireSignIn = useRequireSignIn();
  // The request draft (RIDE-001-B): the destination above, the departure and the pickup. It stays
  // here while the rider signs in, so nothing chosen is lost.
  const [createStep, setCreateStep] = useState<CreateStep | null>(null);
  const [departure, setDeparture] = useState<DepartureOffsetMinutes>(5);
  // The map picker was opened from the draft, so confirming a point returns to it.
  const [pickingForDraft, setPickingForDraft] = useState(false);
  const origin = resolveOrigin(pickup, status);
  // The rider's own request (RIDE-001-C): its card, its marker, and the cancel confirmation.
  const { request: ownRequest, known: ownRequestKnown, refresh: refreshOwnRequest } = useOwnRequest();
  const liveRequest = isLive(ownRequest) ? ownRequest : null;
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const closeCancel = useCallback(() => setCancelOpen(false), []);
  const [list, setList] = useState<NearbyListContent | null>(null);
  const now = useClock();
  const fixPoint = fix?.coordinates ?? null;
  // The own request's supplied matches (RIDE-001-D) emphasize the map in place of a destination's
  // previews while a request searches; the best one the rider has not set aside is on the card.
  const ownMatches = useOwnMatches(ownRequest, now);
  const [setAside, setSetAside] = useState<ReadonlySet<string>>(new Set());
  const emphasis = ownMatches === null ? discovery.matches : indexMatches(ownMatches);
  const arrivalMatch =
    ownMatches?.find((match) => !setAside.has(`${ownRequest?.id}:${itemKey(match.target)}:${match.level}`)) ?? null;
  const arrivalItem =
    arrivalMatch === null
      ? null
      : (snapshot?.items.find((item) => itemKey(item) === itemKey(arrivalMatch.target)) ?? null);
  const arrival =
    arrivalMatch === null
      ? null
      : {
          match: arrivalMatch,
          summary:
            arrivalItem === null
              ? null
              : (() => {
                  const words = describeItem(arrivalItem, fixPoint, now);
                  return `${words.title} · ${words.detail}`;
                })(),
        };

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
    setJoining(false);
  };
  const closePreview = () => {
    setPreview(null);
    setJoining(false);
  };
  const chooseDestination = (place: PlaceDto) => {
    setDestination(place);
    analytics.track('destination_selected');
  };
  /** "Inspect highlighted ride": the best match's preview, with the camera on it. */
  const inspect = (item: NearbyItemDto) => {
    openPreview(item);
    moveTo(streetRegion(item.publicOrigin.center));
  };
  const selectFromList = (item: NearbyItemDto) => {
    setList(null);
    openPreview(item);
    moveTo(streetRegion(item.publicOrigin.center));
  };
  /**
   * Goes on from a confirmed preview towards joining (GROUP-002-A), reserving nothing: with an
   * active request, to the confirmation; without a live one, to a new request to the target's
   * destination first, whose publishing opens the confirmation (a refused join then leaves that
   * request active). A grouped rider is told instead.
   */
  const continueToJoin = (target: PreviewTarget, item: NearbyItemDto) => {
    if (ownRequest?.status === 'active') {
      setJoining(true);
    } else if (ownRequest?.status !== 'grouped') {
      setPendingJoin(target);
      setDestination(item.destination);
      setCreateStep('departure');
    }
  };
  const joinNote =
    ownRequest?.status === 'grouped'
      ? 'You’re already in a group. One request can be in one group at a time; nothing was reserved.'
      : null;
  /**
   * "Plan to join" / "Create a request to join": an anonymous rider signs in first; the preview
   * then reopens, reads the target again and goes on by itself once it is confirmed.
   */
  const planToJoin = () => {
    if (preview === null || previewState?.kind !== 'available') return;
    const intent =
      preview.kind === 'ride'
        ? ({ kind: 'join-ride', rideId: preview.id } as const)
        : ({ kind: 'join-group', groupId: preview.id } as const);
    if (requireSignIn(intent)) continueToJoin(preview, previewState.item);
  };
  // After sign-in: once the target is confirmed again and the rider's request is known, go on.
  const resumeReady =
    joinRequested &&
    preview !== null &&
    previewState?.kind === 'available' &&
    !previewState.fetching &&
    ownRequestKnown;
  if (resumeReady && previewState?.kind === 'available') {
    // Adjusting state while rendering, once per resumed intent: the flag is cleared at once.
    setJoinRequested(false);
    continueToJoin(preview, previewState.item);
  }
  useResumeIntent('join-ride', (intent) => openPreview({ kind: 'ride', id: intent.rideId }, true));
  useResumeIntent('join-group', (intent) => openPreview({ kind: 'group', id: intent.groupId }, true));
  /** Departure step done: an anonymous rider signs in first (the sheet closes over sign-in), then reviews. */
  const continueToReview = () => {
    setCreateStep(null);
    if (requireSignIn({ kind: 'create-request' })) setCreateStep('review');
  };
  useResumeIntent('create-request', () => setCreateStep('review'));

  useFocusEffect(useCallback(() => controller.observe(), [controller]));
  useFocusEffect(useCallback(() => analytics.trackOncePerSession('map_opened'), [analytics]));
  // Android back leaves the picker, the join confirmation or the preview before it leaves the screen.
  const inSubMode = picking || preview !== null;
  useFocusEffect(
    useCallback(() => {
      if (!inSubMode) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setPicking(false);
        if (joining) setJoining(false);
        else setPreview(null);
        return true;
      });
      return () => subscription.remove();
    }, [inSubMode, joining]),
  );
  const header =
    preview !== null && previewState !== null
      ? joining
        ? { title: 'Confirm joining', subtitle: null }
        : previewTitle(preview, previewState, fixPoint, now)
      : null;

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
              // A published request draws its own marker at that pickup instead.
              pickup={ownRequest?.status === 'active' ? null : pickup}
            >
              {ownRequest?.status === 'active' && !picking ? <OwnRequestMarker request={ownRequest} now={now} /> : null}
              <DiscoveryMarkers
                entries={entries}
                selectedKey={previewKey}
                fix={fixPoint}
                now={now}
                stale={staleSnapshot}
                matches={emphasis}
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
                onPress={() => {
                  setPicking(false);
                  setPickingForDraft(false);
                }}
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
                accessibilityLabel={joining ? 'Back to preview' : 'Back to map'}
                tone="white"
                onPress={joining ? () => setJoining(false) : closePreview}
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
              onConfirmed={() => {
                setPicking(false);
                if (pickingForDraft) setCreateStep('departure');
                setPickingForDraft(false);
              }}
              onChooseNamed={() => setNamedOpen(true)}
            />
          ) : preview !== null && previewState !== null && joining ? (
            <JoinPanel
              target={preview}
              preview={previewState}
              ownRequest={ownRequest}
              now={now}
              onJoined={closePreview}
              onBack={() => setJoining(false)}
              onKeepLooking={closePreview}
              onRefreshNearby={() => {
                closePreview();
                discovery.retry();
              }}
            />
          ) : preview !== null && previewState !== null ? (
            <PreviewPanel
              target={preview}
              state={previewState}
              fix={fixPoint}
              now={now}
              demo={demo}
              joinNote={joinNote}
              requestActive={ownRequest?.status === 'active'}
              match={(previewKey === null ? undefined : emphasis?.get(previewKey)?.level) ?? null}
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
              <RequestCard
                request={ownRequest}
                dismissedId={dismissedId}
                onCancel={() => setCancelOpen(true)}
                arrival={arrival}
                onReviewMatch={(match) => {
                  openPreview(match.target);
                  if (arrivalItem !== null) moveTo(streetRegion(arrivalItem.publicOrigin.center));
                }}
                onKeepLooking={(match) =>
                  setSetAside((previous) =>
                    new Set(previous).add(`${ownRequest?.id}:${itemKey(match.target)}:${match.level}`),
                  )
                }
                onDeadline={refreshOwnRequest}
                onCreateAgain={(ended) => {
                  // An explicit new draft to the same place; nothing is published until confirmed.
                  setDismissedId(ended.id);
                  setDestination(ended.destination);
                  setCreateStep('departure');
                }}
                onDismiss={(ended) => setDismissedId(ended.id)}
              />
              <DestinationPanel
                destination={destination}
                summary={destination === null ? { kind: 'unknown' } : summarizeDestination(discovery)}
                onChoose={() => setDestinationOpen(true)}
                onClear={() => setDestination(null)}
                onInspect={inspect}
                onCreate={liveRequest === null ? () => setCreateStep('departure') : undefined}
              />
              <DiscoveryPanel
                state={discovery}
                onRetry={discovery.retry}
                onOpenList={openList}
                tileStatus={tiles.status}
              />
              <HomeLocationPanel
                status={status}
                onChooseOnMap={
                  configured
                    ? () => {
                        // Not from the draft: confirming the point stays on home.
                        setPickingForDraft(false);
                        setPicking(true);
                      }
                    : undefined
                }
              />
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
        matches={emphasis}
      />
      <DestinationSheet open={destinationOpen} onClose={() => setDestinationOpen(false)} onChoose={chooseDestination} />
      <CancelRequestSheet
        request={cancelOpen && ownRequest?.status === 'active' ? ownRequest : null}
        now={now}
        onClose={closeCancel}
      />
      <CreateRequestSheet
        step={createStep}
        destination={destination}
        departure={departure}
        onChangeDeparture={setDeparture}
        origin={origin}
        onContinue={continueToReview}
        onEdit={() => setCreateStep('departure')}
        onClose={() => {
          setCreateStep(null);
          setPendingJoin(null);
        }}
        onChoosePickupOnMap={
          configured
            ? () => {
                setCreateStep(null);
                setPickingForDraft(true);
                setPicking(true);
              }
            : undefined
        }
        onChoosePickupNamed={() => setCreateStep('pickup')}
        onPublished={() => {
          setCreateStep(null);
          // The request a join was waiting for: go on to the confirmation for that target.
          if (pendingJoin !== null) {
            openPreview(pendingJoin);
            setJoining(true);
          }
          setPendingJoin(null);
        }}
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
