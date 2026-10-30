import { StyleSheet, View } from 'react-native';

import { AppText } from '../../ui/AppText';
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
        <AppText variant="heading" accessibilityRole="header">
          Ride Match
        </AppText>
        <AppText color="muted">Map coming soon</AppText>
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
});
