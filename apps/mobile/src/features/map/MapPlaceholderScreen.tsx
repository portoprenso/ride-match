import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';

/**
 * Temporary home screen standing in for the map-first experience.
 *
 * It loads no data and checks no session; browsing never requires sign-in. MAP-001 replaces it
 * with the native map shell.
 *
 * @param onSignIn - Opens the sign-in placeholder. This always-visible entry is temporary:
 *   the product asks for sign-in only when a protected action needs it, and AUTH-001
 *   replaces this button with that gating.
 * @param children - Home content shown under the title, such as the location state.
 */
export function MapPlaceholderScreen({ onSignIn, children }: { onSignIn: () => void; children?: ReactNode }) {
  return (
    <Screen scroll footer={<Button label="Sign in" onPress={onSignIn} />}>
      <View style={styles.content}>
        <View style={styles.title}>
          <AppText variant="heading" accessibilityRole="header">
            Ride Match
          </AppText>
          <AppText color="muted">Map coming soon</AppText>
        </View>
        {children}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 24,
  },
  title: {
    alignItems: 'center',
    gap: 8,
  },
});
