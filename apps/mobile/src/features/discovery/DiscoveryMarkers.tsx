import type { CoordinatesDto, MatchPreviewDto, NearbyItemDto } from '@ride-match/contracts';
import { useEffect, useRef, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker, type MapMarker } from 'react-native-maps';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { AppText } from '../../ui/AppText';
import { Icon } from '../../ui/Icon';
import { colors, radii, spacing } from '../../ui/tokens';
import { matchLabel, type MatchIndex } from '../destinations/matches';
import { describeItem, itemKey, type MapEntry } from './nearbyItems';

type DiscoveryMarkersProps = {
  entries: readonly MapEntry[];
  /** The selected item's key, drawn highlighted. */
  selectedKey: string | null;
  /** The device position for distances, or `null`. */
  fix: Readonly<CoordinatesDto> | null;
  now: number;
  /** Shown as out of date: the last view while it cannot be refreshed. */
  stale: boolean;
  /**
   * The chosen destination's supplied matches for these items, or `null` without a destination
   * (or while its read is on its way): matched items stand out, the others are drawn quieter.
   */
  matches: MatchIndex | null;
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
 *
 * With a destination's matches (DESTINATION-001-B, PRODUCT's map behavior), a matched item gets
 * an outline and its level in its accessible name, an excellent one a stronger fill, and the
 * others stay on the map, drawn quieter. A cluster holding matches says how many and is outlined.
 */
export function DiscoveryMarkers({
  entries,
  selectedKey,
  fix,
  now,
  stale,
  matches,
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
            match={matches === null ? undefined : (matches.get(entry.key) ?? null)}
            onPress={() => onSelectItem(entry.item)}
          />
        ) : (
          <ClusterMarker
            key={entry.key}
            count={entry.items.length}
            matched={matches === null ? undefined : entry.items.filter((item) => matches.has(itemKey(item))).length}
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
  /** Its supplied match, `null` for an unrelated item, `undefined` with no destination to compare. */
  match: MatchPreviewDto | null | undefined;
  onPress: () => void;
};

function ItemMarker({ item, coordinate, selected, label, stale, match, onPress }: ItemMarkerProps) {
  const analytics = useAnalytics();
  const ref = useRef<MapMarker>(null);
  const { kind, id } = item;

  useEffect(() => {
    analytics.markerVisible({ kind, id });
    return () => analytics.markerHidden({ kind, id });
  }, [analytics, kind, id]);
  // Android keeps a custom marker's first image; ask for a new one when its look changes.
  useRedraw(ref, `${selected}:${stale}:${label.markerLabel}:${match === undefined ? '-' : (match?.level ?? 'none')}`);
  const level = match?.level;

  return (
    <Marker
      ref={ref}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={selected ? 3 : level ? 2 : 1}
      accessibilityLabel={`${label.title}, ${label.detail}${level ? `, ${matchLabel(level).toLowerCase()}` : ''}${selected ? ', selected' : ''}`}
      onPress={() => {
        analytics.track('nearby_marker_tapped', { kind });
        onPress();
      }}
    >
      <View
        style={[
          styles.pill,
          level && styles.matched,
          level === 'excellent' && styles.excellent,
          match === null && styles.unrelated,
          selected && styles.selected,
          stale && styles.stale,
        ]}
      >
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
  matched,
  coordinate,
  stale,
  onPress,
}: {
  count: number;
  /** How many of its items match the destination; `undefined` with no destination to compare. */
  matched: number | undefined;
  coordinate: CoordinatesDto;
  stale: boolean;
  onPress: () => void;
}) {
  const ref = useRef<MapMarker>(null);
  const text = matched ? `${count} ride plans · ${matched} your way` : `${count} ride plans`;
  useRedraw(ref, `${count}:${matched}:${stale}`);
  return (
    <Marker
      ref={ref}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      accessibilityLabel={`${count} ride plans here${matched ? `, ${matched} going your way` : ''}. Zoom in or list them.`}
      onPress={onPress}
    >
      <View
        style={[
          styles.pill,
          styles.cluster,
          matched ? styles.matched : null,
          matched === 0 && styles.unrelated,
          stale && styles.stale,
        ]}
      >
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
  // Compatible: a distinct outline; excellent: a stronger fill as well.
  matched: {
    borderWidth: 2,
    borderColor: colors.teal,
  },
  excellent: {
    backgroundColor: colors.lime,
  },
  // Unrelated to the destination: still on the map, less prominent.
  unrelated: {
    opacity: 0.55,
  },
});
