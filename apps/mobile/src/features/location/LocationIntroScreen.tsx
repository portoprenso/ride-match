import { Image, StyleSheet, View } from 'react-native';

import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { Screen } from '../../ui/Screen';
import { colors, radii, spacing } from '../../ui/tokens';

type LocationIntroScreenProps = {
  /** Shows the OS permission prompt. */
  onUseLocation: () => void;
  /** Browses without location, without prompting. */
  onChooseArea: () => void;
  /** The prompt is open, so "Use my location" ignores further presses. */
  busy: boolean;
  /** Why asking failed, shown above the actions. */
  error?: string;
};

/**
 * The first-use introduction (screen 01): what the app does and why location helps, before the
 * OS prompt appears. The prompt is shown only when the user presses "Use my location"; "Choose an
 * area instead" keeps browsing open without it.
 *
 * Every runnable build of this milestone uses the mock data source (DATA-001-A refuses `api`),
 * so the riders are always labelled synthetic.
 */
export function LocationIntroScreen({ onUseLocation, onChooseArea, busy, error }: LocationIntroScreenProps) {
  return (
    <Screen
      scroll
      footer={
        <ActionFooter>
          {error ? <Notice tone="danger" message={error} /> : null}
          <Button label="Use my location" busy={busy} onPress={onUseLocation} />
          <Button label="Choose an area instead" variant="ghost" disabled={busy} onPress={onChooseArea} />
        </ActionFooter>
      }
    >
      <View style={styles.content}>
        <View style={styles.brand}>
          <Image
            source={require('../../../assets/brand/along-mark.png')}
            style={styles.mark}
            accessible={false}
            importantForAccessibility="no"
          />
          <AppText variant="heading" color="white">
            Good company. Same direction.
          </AppText>
          <AppText variant="label" color="lime">
            along
          </AppText>
        </View>
        <View style={styles.text}>
          <AppText variant="section" accessibilityRole="header">
            Find a ride, together.
          </AppText>
          <AppText color="muted">See nearby people heading your way, meet up, then share a taxi.</AppText>
        </View>
        <View style={styles.choice}>
          <AppText variant="label">Your location, your choice</AppText>
          <AppText variant="small" color="muted">
            Used only while the app is open. Others see only an approximate area, never your exact position.
          </AppText>
        </View>
        <Badge label="Demo · synthetic riders" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  brand: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.ink,
  },
  mark: {
    width: 72,
    height: 72,
  },
  text: {
    gap: spacing.sm,
  },
  choice: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.sm,
    backgroundColor: colors.soft,
  },
});
