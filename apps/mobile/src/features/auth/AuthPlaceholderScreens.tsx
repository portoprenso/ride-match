import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';

// The auth stack is presented modally. On iOS that is a sheet below the status bar, whose top
// inset the system already handles; on Android it covers the full screen.
const AUTH_EDGES: readonly Edge[] =
  Platform.OS === 'ios' ? ['right', 'bottom', 'left'] : ['top', 'right', 'bottom', 'left'];

function AuthPlaceholderLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen edges={AUTH_EDGES}>
      <View style={styles.content}>
        <AppText variant="section" accessibilityRole="header">
          {title}
        </AppText>
        <AppText color="muted">
          Sign-in is not available yet. This preview only shows navigation; no phone number or
          code is collected.
        </AppText>
      </View>
      <View style={styles.actions}>{children}</View>
    </Screen>
  );
}

/**
 * Placeholder for the phone-number step of sign-in.
 *
 * It collects nothing and changes no session state. AUTH-001 replaces it with the simulated
 * phone/OTP flow.
 *
 * @param onPreviewCode - Opens the code step without submitting anything.
 * @param onClose - Leaves the sign-in flow.
 */
export function PhonePlaceholder({
  onPreviewCode,
  onClose,
}: {
  onPreviewCode: () => void;
  onClose: () => void;
}) {
  return (
    <AuthPlaceholderLayout title="Sign in with your phone">
      <Button label="Preview code step" onPress={onPreviewCode} />
      <Button label="Close" accessibilityLabel="Close sign-in" onPress={onClose} />
    </AuthPlaceholderLayout>
  );
}

/**
 * Placeholder for the one-time-code step of sign-in.
 *
 * It collects and verifies nothing, and never signs the user in.
 *
 * @param onBack - Returns to the phone step.
 * @param onClose - Leaves the sign-in flow.
 */
export function OtpPlaceholder({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  return (
    <AuthPlaceholderLayout title="Enter the code">
      <Button label="Back" accessibilityLabel="Back to phone step" onPress={onBack} />
      <Button label="Close" accessibilityLabel="Close sign-in" onPress={onClose} />
    </AuthPlaceholderLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  actions: {
    gap: 12,
  },
});
