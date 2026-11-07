import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDemoSignIn } from '../../data/DemoSignInProvider';
import type { LocationState } from '../../platform/location/createLocationController';
import { useLocationState } from '../../platform/location/LocationProvider';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { useAnnouncement } from '../../ui/FieldMessage';
import { Notice } from '../../ui/Notice';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { colors, radii, spacing } from '../../ui/tokens';
import { useSessionController, useSessionState } from '../auth/AuthSessionProvider';
import { SignOutSheet } from '../auth/SignOutSheet';
import { describeSignOutOutcome, type SignOutOutcome } from '../auth/signOutOutcome';

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
 * Notification permission (NOTIFICATION-001-B) and blocked riders (SAFETY-001-C) join this screen
 * with their cards; nothing here suggests they work yet.
 */
export function SettingsScreen({ onBack, onSignIn, onSignedOut, signOutOutcome }: SettingsScreenProps) {
  const session = useSessionController();
  const state = useSessionState();
  const location = useLocationState();
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

        {demo && (
          <Notice message="Along is a placeholder name. This build uses synthetic riders and simulated sign-in." />
        )}
        <AppText variant="small" color="muted">
          {'Exact pickup points are private.\nNo background location tracking.'}
        </AppText>
      </View>

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
