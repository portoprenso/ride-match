import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { spacing } from './tokens';

/**
 * Announces `message` to screen readers when it appears or changes, so an error shows up
 * even when focus is elsewhere. An unchanged message is not repeated on re-render.
 */
export function useAnnouncement(message: string | undefined) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}

type FieldMessageProps = {
  hint?: string;
  error?: string;
  /** Characters used and allowed, shown at the end of the row. */
  count?: { used: number; max: number };
};

/**
 * The line under a field: an error, which replaces the hint, and an optional counter.
 *
 * The hint and error text are hidden from screen readers because the field passes them as
 * its own accessibility hint, so they are read with the field instead of twice.
 */
export function FieldMessage({ hint, error, count }: FieldMessageProps) {
  const message = error || hint;
  if (!message && !count) return null;
  return (
    <View style={styles.row}>
      <AppText
        variant="small"
        color={error ? 'danger' : 'muted'}
        style={styles.message}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {message ?? ''}
      </AppText>
      {count && (
        <AppText variant="small" color="muted">
          {`${count.used}/${count.max}`}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  message: {
    flex: 1,
  },
});
