import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import type { NotificationPermissionStatus } from '../../platform/notifications/createNotificationPermissionController';
import { useNotificationPermissionController } from '../../platform/notifications/NotificationPermissionProvider';
import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { useAnnouncement } from '../../ui/FieldMessage';
import { Notice } from '../../ui/Notice';
import { SheetContent } from '../../ui/SheetHost';
import { spacing } from '../../ui/tokens';

/**
 * The notification permission in a few words, for the settings row (design 40). "Tap to enable"
 * only while the OS would still show its prompt; otherwise the system settings are the way.
 */
export function describeNotificationSetting(state: NotificationPermissionStatus): string {
  if (state.status === 'unknown') return 'Checking…';
  if (state.permission === 'granted') return 'On';
  return state.canAskAgain ? 'Off · Tap to enable' : 'Off · Turn on in system settings';
}

/** Whether only the system settings can turn notifications on now. */
export function needsSystemSettings(state: NotificationPermissionStatus): boolean {
  return state.status === 'known' && state.permission !== 'granted' && !state.canAskAgain;
}

type NotificationPermissionSheetProps = {
  /** Whether this build runs on synthetic data, which the note says. */
  demo: boolean;
  /** Tells the host sheet whether the OS prompt is up, so it isn't dismissed meanwhile. */
  onPendingChange: (pending: boolean) => void;
  /** Closes the sheet: "Not now", or after notifications were turned on. */
  onClose: (enabled: boolean) => void;
};

/**
 * Turning on notifications (design 39), as the content of a sheet. It is opened only by the
 * rider (the settings row), never at startup.
 *
 * - **Explanation:** what notifications are for, that previews never hold private message text
 *   or exact places, "Enable notifications", which shows the OS prompt, and "Not now".
 * - **Off:** after a denial, or when the OS no longer asks, it says so and offers "Open
 *   settings"; returning to the app reads the permission again (the controller's foreground read).
 * - Granting closes the sheet; a prompt the OS fails to show stays here with the reason.
 */
export function NotificationPermissionSheet({ demo, onPendingChange, onClose }: NotificationPermissionSheetProps) {
  const controller = useNotificationPermissionController();
  const [view, setView] = useState<'explain' | 'off'>(() =>
    needsSystemSettings(controller.getState()) ? 'off' : 'explain',
  );
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  useAnnouncement(error);
  useEffect(() => {
    onPendingChange(asking);
  }, [asking, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);

  const enable = async () => {
    if (asking) return;
    setAsking(true);
    setError(undefined);
    try {
      const next = await controller.request();
      if (next.permission === 'granted') {
        onClose(true);
        return;
      }
      setView('off');
    } catch {
      setError('Notifications couldn’t be turned on. Try again.');
    } finally {
      setAsking(false);
    }
  };
  const openSettings = async () => {
    setError(undefined);
    try {
      await Linking.openSettings();
    } catch {
      setError('Settings couldn’t be opened. Open them from your phone’s home screen.');
    }
  };

  if (view === 'off') {
    return (
      <SheetContent
        footer={
          <ActionFooter>
            <Button label="Open settings" onPress={() => void openSettings()} />
            <Button label="Not now" variant="ghost" onPress={() => onClose(false)} />
          </ActionFooter>
        }
      >
        <View style={styles.heading}>
          <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
            Notifications are off.
          </AppText>
          <AppText color="muted">
            You can turn them on for Ride Match in your phone’s settings. Everything else works without them.
          </AppText>
        </View>
        {error ? <Notice tone="danger" message={error} /> : null}
      </SheetContent>
    );
  }

  return (
    <SheetContent
      footer={
        <ActionFooter>
          <Button label="Enable notifications" busy={asking} onPress={() => void enable()} />
          <Button label="Not now" variant="ghost" disabled={asking} onPress={() => onClose(false)} />
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          Know when plans change.
        </AppText>
        <AppText color="muted">Get a notification for a match, a group update, readiness, or a new message.</AppText>
      </View>
      <Notice
        message={`${demo ? 'Demo notifications are local to this device. ' : ''}Notification previews won’t include private message text or exact places.`}
      />
      {error ? <Notice tone="danger" message={error} /> : null}
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
});
