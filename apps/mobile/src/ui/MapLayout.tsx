import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from './tokens';

/** How much of the map, in points from each edge, the layout's overlays cover. */
export type MapCoverage = Readonly<{ top: number; right: number; bottom: number; left: number }>;

/** The sheet never covers more than this share of the window, so some map always shows. */
const MAX_SHEET_SHARE = 0.6;

type MapLayoutProps = {
  /**
   * Draws the map edge to edge behind the overlays. `coverage` is the space the header and sheet
   * take; pass it to the map's padding so the camera centers in the visible part and the
   * provider's logo and legal notice stay uncovered.
   */
  renderMap: (coverage: MapCoverage) => ReactNode;
  /** Floats at the top, inside the safe area; the map stays usable around it. */
  header: ReactNode;
  /** Floats at the right edge, just above the sheet, such as a recenter button. */
  controls?: ReactNode;
  /** The bottom sheet's content. It scrolls once the sheet reaches its maximum height. */
  sheet: ReactNode;
};

/**
 * The map screen layout (the design's 02 and 21): a map behind everything, a floating header, and
 * a sheet fixed at the bottom with controls above it.
 *
 * The sheet is not draggable and not modal: the map stays visible and usable above it, and a
 * screen reader reaches the map, header, controls and sheet in that order. Whether the discovery
 * sheet becomes draggable is MAP-002-A's decision. Flows that need the user's full attention open
 * a `SheetHost` on top.
 */
export function MapLayout({ renderMap, header, controls, sheet }: MapLayoutProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [headerBottom, setHeaderBottom] = useState(insets.top);
  const [sheetHeight, setSheetHeight] = useState(0);

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
        {renderMap({ top: headerBottom, right: 0, bottom: sheetHeight, left: 0 })}
      </View>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.md, paddingLeft: insets.left + spacing.xl, paddingRight: insets.right + spacing.xl },
        ]}
        onLayout={(event) => setHeaderBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
      >
        {header}
      </View>
      <View style={styles.bottom}>
        {controls ? <View style={[styles.controls, { paddingRight: insets.right + spacing.xl }]}>{controls}</View> : null}
        <View
          style={[styles.sheet, { maxHeight: height * MAX_SHEET_SHARE }]}
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              {
                paddingBottom: insets.bottom + spacing.xl,
                paddingLeft: insets.left + spacing.xl,
                paddingRight: insets.right + spacing.xl,
              },
            ]}
            bounces={false}
          >
            {sheet}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'box-none',
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    pointerEvents: 'box-none',
  },
  controls: {
    alignItems: 'flex-end',
    paddingBottom: spacing.md,
    pointerEvents: 'box-none',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: spacing.lg,
    paddingTop: spacing.xl,
  },
});
