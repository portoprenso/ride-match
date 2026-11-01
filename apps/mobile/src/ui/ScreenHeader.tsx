import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { spacing } from './tokens';

type ScreenHeaderProps = {
  /** The screen's name, announced as its header. */
  title: string;
  onBack: () => void;
  /** Spoken name of the back button, such as "Back to map". Defaults to "Back". */
  backLabel?: string;
};

/**
 * A pushed screen's top row: a back button and the screen's name, as in the design's
 * navigation row. It goes first in a `Screen`, which already leaves room for the status bar.
 */
export function ScreenHeader({ title, onBack, backLabel = 'Back' }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <IconButton icon={<Icon name="back" />} accessibilityLabel={backLabel} tone="white" onPress={onBack} />
      <AppText variant="label" accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    flexShrink: 1,
  },
});
