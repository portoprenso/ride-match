import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { AppText } from '../../ui/AppText';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Screen } from '../../ui/Screen';
import { spacing } from '../../ui/tokens';

// The auth stack is presented modally. On iOS that is a sheet below the status bar, whose top
// inset the system already handles; on Android it covers the full screen.
const AUTH_EDGES: readonly Edge[] =
  Platform.OS === 'ios' ? ['right', 'bottom', 'left'] : ['top', 'right', 'bottom', 'left'];

type AuthScreenLayoutProps = {
  /** The screen's name, announced as its header. */
  title: string;
  /** A short status above the heading, such as "Simulated sign-in". */
  badge?: { label: string; tone?: BadgeTone };
  heading: string;
  children: ReactNode;
  /** The screen's actions, usually an `ActionFooter`. */
  footer: ReactNode;
};

/** The shared form layout of the sign-in screens (designs 07, 08, 31 and 47). */
export function AuthScreenLayout({ title, badge, heading, children, footer }: AuthScreenLayoutProps) {
  return (
    <Screen edges={AUTH_EDGES} scroll footer={footer}>
      <View style={styles.content}>
        <AppText variant="label" color="muted" accessibilityRole="header">
          {title}
        </AppText>
        {badge && <Badge label={badge.label} tone={badge.tone} />}
        <AppText variant="section">{heading}</AppText>
        {children}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
});
