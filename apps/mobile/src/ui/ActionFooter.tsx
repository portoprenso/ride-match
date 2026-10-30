import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from './tokens';

/**
 * Stack of a screen's or sheet's final actions, for the `footer` of `Screen` or
 * `SheetContent`.
 *
 * Put the main action first and a way back second, usually a `ghost` `Button` such as
 * "Keep searching". The order is also the screen-reader reading order.
 */
export function ActionFooter({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.sm,
  },
});
