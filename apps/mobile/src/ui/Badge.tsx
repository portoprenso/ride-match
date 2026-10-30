import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radii, type ColorName } from './tokens';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, { background: ColorName; text: ColorName }> = {
  neutral: { background: 'soft', text: 'ink' },
  success: { background: 'lime', text: 'ink' },
  warning: { background: 'warningSoft', text: 'warning' },
  danger: { background: 'dangerSoft', text: 'danger' },
};

/**
 * Short status label, such as "Ready" or "Demo".
 *
 * The tone only reinforces the label: color never carries meaning on its own, so the text
 * must state the status.
 */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const look = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors[look.background] }]}>
      <AppText variant="small" color={look.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
  },
});
