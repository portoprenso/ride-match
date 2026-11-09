import { StyleSheet, View } from 'react-native';

import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Notice } from '../../ui/Notice';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { colors, radii, spacing } from '../../ui/tokens';

/**
 * An old notification (design 46): its target is gone, closed, or not the rider's any more, or
 * the notification itself was invalid or expired. The words are the same for every case and
 * name nothing, so a stale notification can't reveal what it was about.
 *
 * @param onGoHome - Returns to the map ("See current nearby plans", and the back button).
 */
export function NotificationUnavailableScreen({ onGoHome }: { onGoHome: () => void }) {
  return (
    <Screen
      footer={
        <ActionFooter>
          <Button label="See current nearby plans" onPress={onGoHome} />
        </ActionFooter>
      }
    >
      <View style={styles.content}>
        <ScreenHeader title="Notification unavailable" onBack={onGoHome} backLabel="Back to map" />
        <View style={styles.badge}>
          <Icon name="bell" color="warning" />
        </View>
        <View style={styles.heading}>
          <AppText variant="heading" accessibilityLiveRegion="polite">
            Plans have changed.
          </AppText>
          <AppText color="muted">That match or group is no longer available.</AppText>
        </View>
        <Notice message="We checked its current status before opening it. Expired notifications cannot reveal old private content." />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    gap: spacing.md,
  },
});
