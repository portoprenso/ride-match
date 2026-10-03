import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../ui/Screen';

/**
 * Temporary home screen standing in for the map-first experience.
 *
 * It renders static text only: no location permission, data loading, network request,
 * or authentication check. MAP-001 replaces it with the native map shell.
 */
export function MapPlaceholderScreen() {
  return (
    <Screen>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Ride Match
        </Text>
        <Text style={styles.subtitle}>Map coming soon</Text>
      </View>
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
