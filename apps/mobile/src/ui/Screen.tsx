import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from './tokens';

const ALL_EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];
const PADDING = 24;

type ScreenProps = {
  children: ReactNode;
  /**
   * Edges whose safe-area insets this screen applies. Defaults to all four, which suits
   * screens without navigation chrome, such as the home map.
   *
   * Leave out an edge that something else already protects, so each inset is applied once.
   * For example, omit `'top'` under a visible native header or inside an iOS modal sheet.
   * The insets are the window's, not reduced for the screen's position, so a header plus a
   * top inset would double the gap.
   */
  edges?: readonly Edge[];
  /**
   * Scrolls the content when it is taller than the screen, for forms and long text. Taps on
   * buttons still work while the keyboard is open.
   */
  scroll?: boolean;
  /**
   * Final actions, usually an `ActionFooter`. They stay pinned below the content, outside the
   * scrolling area, and move up with the keyboard so they are never hidden behind it.
   */
  footer?: ReactNode;
};

/**
 * Full-screen container that owns safe-area insets and the shared content spacing.
 *
 * Insets for the requested `edges` are added on top of a fixed 24-point padding. They come
 * from the `SafeAreaProvider` that Expo Router already supplies, not from a native
 * `SafeAreaView`: that view measures its own position, and inside an iOS sheet it measured
 * while the sheet was still sliding in, so the first screen lost its bottom inset until a
 * later layout (seen in MOBILE-001-H).
 *
 * With `scroll` or `footer` it becomes a form layout: the content (scrolling or not) above a
 * pinned footer, both kept above the keyboard. The footer then takes the bottom inset.
 */
export function Screen({ children, edges = ALL_EDGES, scroll = false, footer }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const inset = (edge: Edge) => (edges.includes(edge) ? insets[edge] : 0);
  const sides = { paddingRight: PADDING + inset('right'), paddingLeft: PADDING + inset('left') };
  const bottom = PADDING + inset('bottom');

  if (!scroll && !footer) {
    return (
      <View style={[styles.screen, sides, { paddingTop: PADDING + inset('top'), paddingBottom: bottom }]}>
        {children}
      </View>
    );
  }

  const contentStyle = [sides, { paddingTop: PADDING + inset('top'), paddingBottom: footer ? 0 : bottom }];
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, contentStyle]}>{children}</View>
      )}
      {footer && <View style={[styles.footer, sides, { paddingBottom: bottom }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.white,
  },
  fill: {
    flex: 1,
  },
  footer: {
    paddingTop: spacing.lg,
  },
});
