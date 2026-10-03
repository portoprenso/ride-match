import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../ui/Button';
import { Screen } from '../../ui/Screen';

/**
 * Temporary home screen standing in for the map-first experience.
 *
 * It renders static text only: no location permission, data loading, network request,
 * or authentication check. Browsing never requires sign-in. MAP-001 replaces it with the
 * native map shell.
 *
 * @param onSignIn - Opens the sign-in placeholder. This always-visible entry is temporary:
 *   the product asks for sign-in only when a protected action needs it, and AUTH-001
 *   replaces this button with that gating.
 */
export function MapPlaceholderScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <Screen>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Ride Match
        </Text>
        <Text style={styles.subtitle}>Map coming soon</Text>
      </View>
      <Button label="Sign in" onPress={onSignIn} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#111111',
  },
  subtitle: {
    fontSize: 16,
    color: '#555555',
  },
});
