import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { useDemoSignIn } from '../../data/DemoSignInProvider';
import type { LocationState } from '../../platform/location/createLocationController';
import { useLocationState } from '../../platform/location/LocationProvider';
import { useNotificationPermission } from '../../platform/notifications/NotificationPermissionProvider';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { useAnnouncement } from '../../ui/FieldMessage';
import { Notice } from '../../ui/Notice';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { SheetHost } from '../../ui/SheetHost';
import { colors, radii, spacing } from '../../ui/tokens';
import { useSessionController, useSessionState } from '../auth/AuthSessionProvider';
import { SignOutSheet } from '../auth/SignOutSheet';
import { describeSignOutOutcome, type SignOutOutcome } from '../auth/signOutOutcome';
import { describeNotificationSetting, NotificationPermissionSheet } from '../notifications/NotificationPermissionSheet';

/**
 * The location permission in a few words, for the settings row. It reports only what the
 * controller knows; location is never used in the background, whatever the permission.
 */
export function describeLocationSetting(state: Pick<LocationState, 'permission' | 'servicesEnabled'>): string {
  const { permission } = state;
  switch (permission.status) {
    case 'unknown':
      return 'Checking…';
    case 'undetermined':
      return 'Not asked yet';
    case 'denied':
      return 'Not allowed';
    case 'granted':
      if (state.servicesEnabled === false) return 'Allowed · location services are off';
      return permission.precise ? 'While using the app' : 'While using the app · approximate';
  }
}

type SettingsScreenProps = {
  onBack: () => void;
  /** Opens sign-in; offered while nobody is signed in. */
  onSignIn: () => void;
  /** Opens the blocked-riders panel (44); offered while signed in. */
  onOpenBlockedRiders: () => void;
  /**
   * Called once a sign-out has finished. The route resets the navigation stack, so no private
   * screen stays beneath, and shows the outcome here.
   */
  onSignedOut: (outcome: SignOutOutcome) => void;
  /**
   * The outcome of the sign-out that led here. Shown only while the session is signed out by a
   * sign-out, so a link carrying an outcome cannot claim one that did not happen.
   */
  signOutOutcome?: SignOutOutcome | null;
};

/**
 * Settings (design 40), for anonymous and signed-in riders: the session, the location
 * permission, and what this build is.
 *
 * - Signed in: who is signed in, whether the session survives closing the app, and "Sign out",
 *   which asks first (design 48).
 * - Signed out: anonymous browsing, "Sign in", and the outcome of a sign-out that just finished.
 * - Restoring or a failed restore: what is happening, and "Try again" after a failure.
 *
 * - Signed in, also "Blocked riders", opening the blocked-riders panel (44). The row reads
 *   nothing itself, so opening settings never sends a request of its own.
 * - Signed in, also "Notifications" with the permission (`describeNotificationSetting`): while
 *   off it opens the explanation (39), which asks the OS only when the rider chooses; while on it
 *   opens the system settings, where they can be turned off. Notifications are for signed-in
 *   riders only, so anonymous browsing shows no row and is never asked.
 */
export function SettingsScreen({
  onBack,
  onSignIn,
  onOpenBlockedRiders,
  onSignedOut,
  signOutOutcome,
}: SettingsScreenProps) {
  const session = useSessionController();
  const state = useSessionState();
  const location = useLocationState();
  const notifications = useNotificationPermission();
  const [notificationSheet, setNotificationSheet] = useState(false);
  const [askingNotifications, setAskingNotifications] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);
  const notificationRef = useRef<View>(null);
  useAnnouncement(notificationNotice ?? undefined);
  const notificationSummary = describeNotificationSetting(notifications);
  const openNotifications = () => {
    setNotificationNotice(null);
    if (notifications.status === 'known' && notifications.permission === 'granted') {
      Linking.openSettings().catch(() =>
        setNotificationNotice('Settings couldn’t be opened. Open them from your phone’s home screen.'),
      );
      return;
    }
    if (notifications.status === 'known') setNotificationSheet(true);
  };
  const demo = useDemoSignIn() !== null;
  const [confirming, setConfirming] = useState(false);
  const signOutRef = useRef<View>(null);

  const outcome =
    state.status === 'signed-out' && state.reason === 'signed-out' && signOutOutcome
      ? describeSignOutOutcome(signOutOutcome)
      : null;
  useAnnouncement(outcome?.message);

  return (
    <Screen scroll>
      <View style={styles.content}>
        <ScreenHeader title="Settings" onBack={onBack} backLabel="Back to map" />
        <View style={styles.heading}>
          <Badge
            label={state.status === 'signed-in' ? (demo ? 'Demo session' : 'Signed in') : 'Browsing anonymously'}
          />
          <AppText variant="section">Make yourself at home.</AppText>
        </View>

        {outcome && <Notice tone={outcome.tone} message={outcome.message} />}

        <View style={styles.section}>
          <AppText variant="label" accessibilityRole="header">
            Session
          </AppText>
          {state.status === 'signed-in' && (
            <>
              <AppText>Signed in as {state.user.displayName}.</AppText>
              {!state.persisted && (
                <Notice
                  tone="warning"
                  message="This session couldn’t be saved on this phone, so it ends when the app closes."
                />
              )}
              <Button ref={signOutRef} label="Sign out" variant="secondary" onPress={() => setConfirming(true)} />
            </>
          )}
          {state.status === 'signed-out' && (
            <>
              <AppText color="muted">
                You’re browsing anonymously. Sign in when you want to plan, join or message a ride.
              </AppText>
              <Button label="Sign in" variant="secondary" onPress={onSignIn} />
            </>
          )}
          {state.status === 'restoring' && <AppText color="muted">Checking your saved session…</AppText>}
          {state.status === 'restore-failed' && (
            <>
              <AppText color="muted">
                Your saved session couldn’t be checked. You can keep browsing anonymously meanwhile.
              </AppText>
              <Button label="Try again" variant="secondary" onPress={() => void session.restore()} />
            </>
          )}
        </View>

        <View style={styles.row} accessible accessibilityLabel={`Location: ${describeLocationSetting(location)}`}>
          <AppText variant="label">Location</AppText>
          <AppText color="muted">{describeLocationSetting(location)}</AppText>
        </View>

        {state.status === 'signed-in' && (
          <Pressable
            ref={notificationRef}
            accessibilityRole="button"
            accessibilityLabel={`Notifications: ${notificationSummary}`}
            accessibilityHint={
              notifications.status === 'known' && notifications.permission === 'granted'
                ? 'Opens the system settings, where notifications can be turned off.'
                : 'Explains notifications before asking to turn them on.'
            }
            accessibilityState={{ disabled: notifications.status === 'unknown' }}
            disabled={notifications.status === 'unknown'}
            onPress={openNotifications}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <AppText variant="label">Notifications</AppText>
            <AppText color="muted">{notificationSummary}</AppText>
          </Pressable>
        )}
        {notificationNotice === null ? null : <Notice message={notificationNotice} />}

        {state.status === 'signed-in' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Blocked riders"
            accessibilityHint="Shows the riders you’ve blocked, to unblock them."
            onPress={onOpenBlockedRiders}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <AppText variant="label">Blocked riders</AppText>
            <AppText color="muted">See and unblock riders you’ve blocked</AppText>
          </Pressable>
        )}

        {demo && (
          <Notice message="Along is a placeholder name. This build uses synthetic riders and simulated sign-in." />
        )}
        <AppText variant="small" color="muted">
          {'Exact pickup points are private.\nNo background location tracking.'}
        </AppText>
      </View>

      <SheetHost
        open={notificationSheet}
        onDismiss={() => setNotificationSheet(false)}
        dismissible={!askingNotifications}
        returnFocusRef={notificationRef}
      >
        {notificationSheet ? (
          <NotificationPermissionSheet
            demo={demo}
            onPendingChange={setAskingNotifications}
            onClose={(enabled) => {
              setNotificationSheet(false);
              if (enabled) setNotificationNotice('Notifications are on.');
            }}
          />
        ) : null}
      </SheetHost>

      <SignOutSheet
        open={confirming}
        demo={demo}
        returnFocusRef={signOutRef}
        onCancel={() => setConfirming(false)}
        onSignedOut={(next) => {
          setConfirming(false);
          onSignedOut(next);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.8,
  },
  content: {
    gap: spacing.lg,
  },
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  section: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
});
