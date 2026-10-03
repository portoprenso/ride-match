import { StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Screen } from './Screen';

type UnavailableScreenProps = {
  /** Names the page, without implying that any specific resource exists. */
  title: string;
  /** States plainly what is unavailable. */
  message: string;
  /** Returns to the home map. */
  onGoHome: () => void;
};

/**
 * Full-screen unavailable state with a single action back to the home map.
 *
 * Inert route shells use it for pages whose features do not exist yet, and for pages that
 * this build does not offer. It renders only the given text: no route parameters, private
 * data, or controls that would suggest the feature works.
 */
export function UnavailableScreen({ title, message, onGoHome }: UnavailableScreenProps) {
  return (
    <Screen>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      <Button label="Go to map" onPress={onGoHome} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111111',
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    color: '#555555',
  },
});
