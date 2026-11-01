import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { describeLocation, type LocationStatus } from '../../platform/location/createLocationController';
import { useLocationController, useLocationState } from '../../platform/location/LocationProvider';
import { openLocationSettings } from '../../platform/location/openLocationSettings';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { colors, radii, spacing } from '../../ui/tokens';
import { useLocationChoices } from './LocationChoicesProvider';
import { describeLocationCard, type LocationCardAction } from './locationCard';
import { PickupPlaceSheet } from './PickupPlaceSheet';

/** How often a shown fix is aged again, so a stale position is labelled without a new fix. */
const AGE_TICK_MS = 15_000;

/**
 * Whether home shows the location introduction (screen 01) and its actions. It shows while the
 * permission was never requested, until the user asks for location or sets the introduction
 * aside for this launch.
 */
export function useLocationIntro() {
  const controller = useLocationController();
  const state = useLocationState();
  const { introSetAside, setIntroAside } = useLocationChoices();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  return {
    visible: state.permission.status === 'undetermined' && !introSetAside,
    asking,
    error,
    /** Shows the OS prompt; the introduction closes once the permission is decided. */
    askForLocation() {
      setAsking(true);
      setError(undefined);
      controller.requestPermission().then(
        () => setAsking(false),
        () => {
          setAsking(false);
          setError("Your device didn't show the location prompt. Try again, or choose an area instead.");
        },
      );
    },
    /** Closes the introduction for this launch without prompting. */
    chooseArea: setIntroAside,
  };
}

/**
 * The location status at the current time. While a fix is shown it is aged again every
 * {@link AGE_TICK_MS}, so a position is labelled stale without waiting for a new fix.
 */
export function useLocationStatus(): LocationStatus {
  const state = useLocationState();
  const now = useNow(state.fix === null ? null : AGE_TICK_MS);
  return describeLocation(state, now);
}

function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (intervalMs === null) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

type HomeLocationPanelProps = {
  /** From {@link useLocationStatus}, which the map reads too. */
  status: LocationStatus;
  /** Shown instead of the location card while location needs no explanation. */
  fallback: ReactNode;
};

/**
 * Home's location state (screen 21 and its siblings) and the confirmed pickup point, as the
 * content of the map's sheet.
 *
 * Whatever the permission, services or fix, the user can browse and choose a pickup point by
 * name; nothing here presents a chosen place as the device position. The second action fits the
 * cause: ask again, open the settings, or retry a fix. A failed action is explained in the card
 * it came from.
 */
export function HomeLocationPanel({ status, fallback }: HomeLocationPanelProps) {
  const controller = useLocationController();
  const state = useLocationState();
  const { pickup } = useLocationChoices();
  const card = describeLocationCard(status, Platform.OS);

  const cardOpener = useRef<View>(null);
  const pickupOpener = useRef<View>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  // A message about the last action, shown only while the status it was about still holds.
  const [notice, setNotice] = useState<{ status: LocationStatus['kind']; message: string } | null>(null);

  const explain = (message: string) =>
    setNotice({ status: describeLocation(controller.getState(), Date.now()).kind, message });

  const runAction = (action: LocationCardAction) => {
    setNotice(null);
    switch (action.kind) {
      case 'request':
        setAsking(true);
        controller.requestPermission().then(
          (permission) => {
            setAsking(false);
            if (permission.status === 'denied') explain('Location stays off. You can still choose a place for your pickup.');
          },
          () => {
            setAsking(false);
            explain("Your device didn't show the location prompt. Try again later, or choose a place.");
          },
        );
        break;
      case 'app-settings':
      case 'services-settings':
        openLocationSettings(action.kind === 'app-settings' ? 'app' : 'services').catch(() =>
          explain("The settings didn't open. Open them from your device's home screen."),
        );
        break;
      case 'refresh':
        void controller.refresh();
        break;
    }
  };

  return (
    <View style={styles.panel}>
      {card ? (
        <View style={styles.card}>
          <Badge label={card.badge.label} tone={card.badge.tone} />
          <AppText variant="section" accessibilityRole="header">
            {card.title}
          </AppText>
          <AppText color="muted">{card.message}</AppText>
          {notice !== null && notice.status === status.kind ? <Notice tone="warning" message={notice.message} /> : null}
          {pickup === null ? (
            <Button ref={cardOpener} label="Choose pickup area" onPress={() => setSheetOpen(true)} />
          ) : null}
          {card.action ? (
            <Button
              label={card.action.label}
              variant="secondary"
              busy={card.action.kind === 'request' ? asking : card.action.kind === 'refresh' && state.locating}
              onPress={() => card.action && runAction(card.action)}
            />
          ) : null}
          <AppText variant="small" color="muted">
            Location is only used while the app is open.
          </AppText>
        </View>
      ) : (
        fallback
      )}
      {pickup !== null ? (
        <View style={styles.pickup}>
          <AppText variant="small" color="muted">
            Pickup point
          </AppText>
          <AppText variant="label">Near {pickup.label}</AppText>
          <AppText variant="small" color="muted">
            Chosen by you, not your device location. It stays fixed after you publish your request.
          </AppText>
          <Button ref={pickupOpener} label="Change pickup point" variant="secondary" onPress={() => setSheetOpen(true)} />
        </View>
      ) : null}
      {/* After a confirmation the card's button is gone, so focus goes to "Change pickup point". */}
      <PickupPlaceSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        returnFocusRef={pickup === null ? cardOpener : pickupOpener}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.lg,
  },
  card: {
    gap: spacing.md,
  },
  pickup: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
  },
});
