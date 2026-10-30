import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { colors, radii, spacing, type ColorName } from './tokens';

export type NoticeTone = 'neutral' | 'warning' | 'danger';

const TONES: Record<NoticeTone, { background: ColorName; text: ColorName }> = {
  neutral: { background: 'soft', text: 'muted' },
  warning: { background: 'warningSoft', text: 'warning' },
  danger: { background: 'dangerSoft', text: 'danger' },
};

/**
 * Inline message box for information, warnings, and errors, such as an empty result or a
 * failed load.
 *
 * It only displays the message. Screens decide whether a change must also be announced to
 * screen readers, and they provide any retry or recovery action next to it.
 */
export function Notice({ message, tone = 'neutral' }: { message: string; tone?: NoticeTone }) {
  const look = TONES[tone];
  return (
    <View style={[styles.notice, { backgroundColor: colors[look.background] }]}>
      <AppText variant="small" color={look.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    padding: spacing.md,
    borderRadius: radii.sm,
  },
});
