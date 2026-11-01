import { StyleSheet, View } from 'react-native';

import { AppConfigError } from '../config/appConfig';
import type { DataSourceUnavailableError } from '../data/errors';
import { AppText } from '../ui/AppText';
import { Screen } from '../ui/Screen';

type ConfigurationErrorScreenProps = {
  /** Why the build cannot run. Its text names only public build variables. */
  error: AppConfigError | DataSourceUnavailableError;
};

/**
 * Shown instead of the whole app when the build configuration cannot run, such as a missing
 * variable or the unavailable API data source. It offers no action: nothing works until the
 * configuration is fixed and the app restarted, and showing the map would suggest otherwise.
 */
export function ConfigurationErrorScreen({ error }: ConfigurationErrorScreenProps) {
  const problems = error instanceof AppConfigError ? error.problems : [error.message];

  return (
    <Screen>
      <View style={styles.content}>
        <AppText variant="section" accessibilityRole="header">
          This build can’t start
        </AppText>
        {problems.map((problem) => (
          <AppText key={problem}>{problem}</AppText>
        ))}
        <AppText color="muted">Fix the EXPO_PUBLIC_ settings, then restart Metro and the app.</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
});
