import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

const ALL_EDGES: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

type ScreenProps = {
  children: ReactNode;
  /**
   * Edges whose safe-area insets this screen applies. Defaults to all four, which suits
   * screens without navigation chrome, such as the home map.
   *
   * Leave out an edge that something else already protects, so each inset is applied once.
   * For example, omit `'top'` under a visible native header or inside an iOS modal sheet.
   * On iOS the insets come from the app-level provider and are not reduced for the screen's
   * position, so a header plus a top inset would double the gap.
   */
  edges?: readonly Edge[];
};

/**
 * Full-screen container that owns safe-area insets and the shared content spacing.
 *
 * Insets for the requested `edges` are added on top of a fixed 24-point padding. Expo Router
 * already supplies the `SafeAreaProvider` this relies on, so no extra provider is needed.
 */
export function Screen({ children, edges = ALL_EDGES }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} style={styles.screen}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    backgroundColor: '#ffffff',
  },
});
