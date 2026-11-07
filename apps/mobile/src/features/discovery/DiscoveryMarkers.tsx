import type { CoordinatesDto, NearbyItemDto } from '@ride-match/contracts';
import { useEffect, useRef, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker, type MapMarker } from 'react-native-maps';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { AppText } from '../../ui/AppText';
import { Icon } from '../../ui/Icon';
import { colors, radii, spacing } from '../../ui/tokens';
import { describeItem, type MapEntry } from './nearbyItems';

type DiscoveryMarkersProps = {
  entries: readonly MapEntry[];
  /** The selected item's key, drawn highlighted. */
  selectedKey: string | null;
  /** The device position for distances, or `null`. */
  fix: Readonly<CoordinatesDto> | null;
  now: number;
  /** Shown as out of date: the last view while it cannot be refreshed. */
  stale: boolean;
  onSelectItem: (item: NearbyItemDto) => void;
  onPressCluster: (items: NearbyItemDto[]) => void;
};

/**
 * The discovery markers on the home map (designs 02 and 53): one per ride or group at its public
 * area (never a person's position), and a count where several would overlap. A marker's count
 * is of ride plans; a group counts once whatever its occupancy. Rendered inside the `MapView`.
 *
 * Analytics: each single-item marker reports itself visible while mounted (`markerVisible`), so
 * a peer marker seen for the dwell time is recorded once per session; clusters never are, since
 * they do not show any one item. A tap records `nearby_marker_tapped` with the item's kind.
 */
export function DiscoveryMarkers({
  entries,
  selectedKey,
  fix,
  now,
  stale,
  onSelectItem,
  onPressCluster,
}: DiscoveryMarkersProps) {
  return (
    <>
      {entries.map((entry) =>
        entry.kind === 'item' ? (
          <ItemMarker
            key={entry.key}
            item={entry.item}
            coordinate={entry.coordinate}
            selected={entry.key === selectedKey}
            label={describeItem(entry.item, fix, now)}
            stale={stale}
            onPress={() => onSelectItem(entry.item)}
          />
        ) : (
          <ClusterMarker
            key={entry.key}
            count={entry.items.length}
            coordinate={entry.coordinate}
            stale={stale}
            onPress={() => onPressCluster(entry.items)}
          />
        ),
      )}
    </>
  );
}

type ItemMarkerProps = {
  item: NearbyItemDto;
  coordinate: CoordinatesDto;
  selected: boolean;
  label: ReturnType<typeof describeItem>;
  stale: boolean;
  onPress: () => void;
};

function ItemMarker({ item, coordinate, selected, label, stale, onPress }: ItemMarkerProps) {
  const analytics = useAnalytics();
  const ref = useRef<MapMarker>(null);
  const { kind, id } = item;

  useEffect(() => {
    analytics.markerVisible({ kind, id });
    return () => analytics.markerHidden({ kind, id });
  }, [analytics, kind, id]);
  // Android keeps a custom marker's first image; ask for a new one when its look changes.
  useRedraw(ref, `${selected}:${stale}:${label.markerLabel}`);

  return (
    <Marker
      ref={ref}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={selected ? 2 : 1}
      accessibilityLabel={`${label.title}, ${label.detail}${selected ? ', selected' : ''}`}
      onPress={() => {
        analytics.track('nearby_marker_tapped', { kind });
        onPress();
      }}
    >
      <View style={[styles.pill, selected && styles.selected, stale && styles.stale]}>
        <Icon name={kind === 'group' ? 'users' : 'arrow'} color={selected ? 'white' : 'ink'} size={16} />
        <AppText variant="small" color={selected ? 'white' : 'ink'} numberOfLines={1}>
          {label.markerLabel}
        </AppText>
      </View>
    </Marker>
  );
}

function ClusterMarker({
  count,
  coordinate,
  stale,
  onPress,
}: {
  count: number;
  coordinate: CoordinatesDto;
  stale: boolean;
  onPress: () => void;
}) {
  const ref = useRef<MapMarker>(null);
  const text = `${count} ride plans`;
  useRedraw(ref, `${count}:${stale}`);
  return (
    <Marker
      ref={ref}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      accessibilityLabel={`${text} here. Zoom in or list them.`}
      onPress={onPress}
    >
      <View style={[styles.pill, styles.cluster, stale && styles.stale]}>
        <Icon name="users" size={16} />
        <AppText variant="small">{text}</AppText>
      </View>
    </Marker>
  );
}

function useRedraw(ref: RefObject<MapMarker | null>, look: string) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.redraw());
    return () => cancelAnimationFrame(frame);
  }, [ref, look]);
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 220,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.soft,
  },
  cluster: {
    backgroundColor: colors.lime,
  },
  selected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  stale: {
    opacity: 0.6,
  },
});
