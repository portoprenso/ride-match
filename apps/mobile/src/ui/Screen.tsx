import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

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
};

/**
 * Full-screen container that owns safe-area insets and the shared content spacing.
 *
 * Insets for the requested `edges` are added on top of a fixed 24-point padding. They come
 * from the `SafeAreaProvider` that Expo Router already supplies, not from a native
 * `SafeAreaView`: that view measures its own position, and inside an iOS sheet it measured
 * while the sheet was still sliding in, so the first screen lost its bottom inset until a
 * later layout (seen in MOBILE-001-H).
 */
export function Screen({ children, edges = ALL_EDGES }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const inset = (edge: Edge) => (edges.includes(edge) ? insets[edge] : 0);

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: PADDING + inset('top'),
          paddingRight: PADDING + inset('right'),
          paddingBottom: PADDING + inset('bottom'),
          paddingLeft: PADDING + inset('left'),
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});
