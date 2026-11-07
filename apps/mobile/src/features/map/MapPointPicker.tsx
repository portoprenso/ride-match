import type { CoordinatesDto } from '@ride-match/contracts';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import type MapView from 'react-native-maps';

import type { MapTileStatus } from '../../platform/map/useMapTileStatus';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import type { MapCoverage } from '../../ui/MapLayout';
import { Notice } from '../../ui/Notice';
import { colors, spacing } from '../../ui/tokens';
import { useNearestPlace } from '../location/nearestPlace';
import { useLocationChoices } from '../location/LocationChoicesProvider';

/** The pin's head and stem, in points; its tip marks the chosen point. */
const PIN_HEAD = 28;
const PIN_STEM = 14;

/** Where the pin's tip sits in the map view: the centre of the part the overlays leave visible. */
export function pinPoint(size: Readonly<{ width: number; height: number }>, coverage: MapCoverage) {
  return {
    x: coverage.left + (size.width - coverage.left - coverage.right) / 2,
    y: coverage.top + (size.height - coverage.top - coverage.bottom) / 2,
  };
}

/**
 * Tracks the point under the map's centre pin while the user drags the map (design 22).
 *
 * The point is read from the map itself (`coordinateForPoint` at the pin's tip) each time the
 * camera comes to rest, so it matches what is under the pin whatever the overlays cover. While
 * the map moves, `moving` is true and the point is not offered for confirmation. A read that
 * fails leaves the point unknown; the next rest reads it again.
 *
 * Privacy: the point is where the user will be once they publish; it stays in memory on this
 * screen and is never logged.
 *
 * @param active False outside the picker: nothing is read then.
 */
export function useMapPointPicker(mapRef: RefObject<MapView | null>, coverage: MapCoverage, active: boolean) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The layout passes a new coverage object on every render; only its values matter here.
  const { top, right, bottom, left } = coverage;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [point, setPoint] = useState<CoordinatesDto | null>(null);
  const [moving, setMoving] = useState(false);
  const reads = useRef(0);

  const read = useCallback(() => {
    const map = mapRef.current;
    if (!active || size === null || map === null) return;
    const attempt = ++reads.current;
    map.coordinateForPoint(pinPoint(size, { top, right, bottom, left })).then(
      (coordinates) => {
        // Only the newest read counts: an older one may finish after the map moved on.
        if (mounted.current && attempt === reads.current) {
          setPoint({ latitude: coordinates.latitude, longitude: coordinates.longitude });
        }
      },
      () => {
        if (mounted.current && attempt === reads.current) setPoint(null);
      },
    );
  }, [active, size, top, right, bottom, left, mapRef]);

  // A new layout or a newly opened picker moves the pin over another point. Leaving the picker
  // only makes reads still in flight obsolete; the values below hide what is left.
  useEffect(() => {
    if (active) read();
    else reads.current += 1;
  }, [active, read]);

  return {
    point: active ? point : null,
    moving: active && moving,
    /** For the map container's `onLayout`. */
    onLayout: (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setSize((current) => (current?.width === width && current.height === height ? current : { width, height }));
    },
    onRegionChange: () => {
      if (active) setMoving(true);
    },
    onRegionChangeComplete: () => {
      if (!active) return;
      setMoving(false);
      read();
    },
  };
}

/**
 * The fixed pin over the centre of the visible map, for choosing a pickup point by dragging the
 * map beneath it. It ignores touches and is hidden from screen readers; the sheet says what it
 * points at, and the named list is the accessible alternative.
 */
export function CentrePin({ coverage }: { coverage: MapCoverage }) {
  return (
    <View
      style={[
        styles.pinArea,
        { top: coverage.top, bottom: coverage.bottom, left: coverage.left, right: coverage.right },
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID="centre-pin"
    >
      {/* Lifted by its own height, so the stem's tip, not the head, marks the centre. */}
      <View style={styles.pin}>
        <View style={styles.pinHead}>
          <View style={styles.pinDot} />
        </View>
        <View style={styles.pinStem} />
      </View>
    </View>
  );
}

type MapPointPanelProps = {
  /** The point under the pin, or `null` while it is not known. */
  point: CoordinatesDto | null;
  moving: boolean;
  tileStatus: MapTileStatus;
  /** The user confirmed the point; the picker closes. */
  onConfirmed: () => void;
  /** Opens the named list, the alternative to dragging the map. */
  onChooseNamed: () => void;
};

/**
 * The picker's sheet (design 22): what the pin points at, the privacy notes, and the explicit
 * confirmation. Confirming only replaces this launch's pickup choice for the request draft; it
 * sends nothing.
 */
export function MapPointPanel({ point, moving, tileStatus, onConfirmed, onChooseNamed }: MapPointPanelProps) {
  const { confirmMapPoint } = useLocationChoices();
  const nearest = useNearestPlace(moving ? null : point);
  const naming = point !== null && !moving && nearest.isPending;

  const line = moving
    ? 'Release the map to choose this point.'
    : point === null
      ? 'Finding the point under the pin…'
      : naming
        ? 'Looking for the nearest named place…'
        : nearest.isError
          ? 'The nearest place couldn’t be found. You can still confirm this point.'
          : nearest.data
            ? `Near ${nearest.data.label}${nearest.data.detail ? ` (${nearest.data.detail})` : ''}`
            : 'No named place nearby. You can still confirm this point.';

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          Is this your pickup point?
        </AppText>
        <AppText color="muted" accessibilityLiveRegion="polite">
          {line}
        </AppText>
      </View>
      {tileStatus === 'slow' ? (
        <Notice tone="warning" message="The map may not be loading. You can choose a named place instead." />
      ) : null}
      <Notice message="Drag the map to choose a point, then confirm. Public discovery will show only an approximate area." />
      <Notice message="This point stays fixed after you publish your request." />
      <Button
        label="Confirm this pickup"
        disabled={moving || point === null || naming}
        onPress={() => {
          if (point === null) return;
          confirmMapPoint(point, nearest.data ?? null);
          onConfirmed();
        }}
      />
      <Button label="Choose a named place" variant="secondary" onPress={onChooseNamed} />
    </View>
  );
}

const styles = StyleSheet.create({
  pinArea: {
    position: 'absolute',
    pointerEvents: 'none',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    alignItems: 'center',
    marginBottom: PIN_HEAD + PIN_STEM,
  },
  pinHead: {
    width: PIN_HEAD,
    height: PIN_HEAD,
    borderRadius: PIN_HEAD / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.white,
  },
  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lime,
  },
  pinStem: {
    width: 3,
    height: PIN_STEM,
    backgroundColor: colors.ink,
  },
  panel: {
    gap: spacing.lg,
  },
  heading: {
    gap: spacing.sm,
  },
});
