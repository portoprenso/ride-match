import type { MatchLevel, NearbyItemDto, PlaceDto } from '@ride-match/contracts';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { spacing } from '../../ui/tokens';
import { itemKey } from '../discovery/nearbyItems';
import type { DiscoveryState } from '../discovery/useNearbyDiscovery';
import { bestMatch, matchLabel, type MatchIndex } from './matches';

/**
 * What the sheet can say about plans going the rider's way:
 *
 * - `checking`: the destination's read is on its way (the previous snapshot may still be shown).
 * - `best`: the source supplied matches; `item` is the one to inspect first, at `level`.
 * - `none`: the read came back with no match here; other plans stay on the map.
 * - `unknown`: discovery has nothing to compare (failed, too wide, offline); its own panel says why.
 */
export type DestinationSummary =
  | { kind: 'checking' }
  | { kind: 'best'; item: NearbyItemDto; level: MatchLevel; count: number }
  | { kind: 'none' }
  | { kind: 'unknown' };

type DestinationPanelProps = {
  destination: PlaceDto | null;
  summary: DestinationSummary;
  onChoose: () => void;
  onClear: () => void;
  /** Opens the best match's preview and shows it on the map. */
  onInspect: (item: NearbyItemDto) => void;
  /** Starts creating a request to this destination (RIDE-001-B); absent while one is live. */
  onCreate?: () => void;
};

/**
 * The top of home's sheet: before a destination, an invitation to choose one (design 02); with
 * one, its name, a way to change or clear it, and what the source supplied for it (design 04).
 * Matches are advisory: they say nothing is reserved and that other plans stay on the map.
 */
export function DestinationPanel({
  destination,
  summary,
  onChoose,
  onClear,
  onInspect,
  onCreate,
}: DestinationPanelProps) {
  if (destination === null) {
    return (
      <View style={styles.panel}>
        <AppText variant="section" accessibilityRole="header">
          Where are you heading?
        </AppText>
        <AppText color="muted">Explore nearby ride plans, then choose where you want to go.</AppText>
        <Button label="Choose a destination" onPress={onChoose} />
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <AppText variant="small" color="muted">
        Heading to
      </AppText>
      <AppText variant="section" accessibilityRole="header">
        {destination.label}
      </AppText>
      <SummaryView summary={summary} onInspect={onInspect} />
      <View style={styles.actions}>
        {onCreate ? <Button label="Create my ride request" onPress={onCreate} /> : null}
        <Button label="Change destination" variant="secondary" onPress={onChoose} />
        <Button label="Clear destination" variant="ghost" onPress={onClear} />
      </View>
    </View>
  );
}

function SummaryView({ summary, onInspect }: Pick<DestinationPanelProps, 'summary' | 'onInspect'>) {
  switch (summary.kind) {
    case 'checking':
      return (
        <AppText color="muted" accessibilityLiveRegion="polite">
          Looking for plans going your way…
        </AppText>
      );
    case 'unknown':
      return null;
    case 'none':
      return (
        <AppText color="muted" accessibilityLiveRegion="polite">
          No plans going your way in this view yet. Other plans stay on the map.
        </AppText>
      );
    case 'best':
      return (
        <View style={styles.summary}>
          <Badge label={`${matchLabel(summary.level)} nearby`} tone="success" />
          <AppText variant="label" accessibilityLiveRegion="polite">
            {summary.count === 1 ? 'A shared direction.' : `${summary.count} plans share your direction.`}
          </AppText>
          <AppText color="muted">Compatible ride plans stand out. Other plans stay on the map.</AppText>
          <Button
            label={summary.item.kind === 'group' ? 'Inspect highlighted group' : 'Inspect highlighted ride'}
            variant="secondary"
            onPress={() => onInspect(summary.item)}
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
  },
  summary: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  actions: {
    gap: spacing.xs,
  },
});

/**
 * Sums up a destination's matches from discovery's current state. Only a snapshot read for the
 * current destination counts (`matches` is `null` otherwise): while the destination's read is on
 * its way the summary is `checking`, and an older destination's snapshot never answers for it.
 */
export function summarizeDestination(discovery: DiscoveryState & { matches: MatchIndex | null }): DestinationSummary {
  switch (discovery.kind) {
    case 'loading':
      return { kind: 'checking' };
    case 'empty':
      return discovery.matches === null ? { kind: 'checking' } : { kind: 'none' };
    case 'active':
    case 'stale': {
      if (discovery.matches === null) return discovery.kind === 'active' ? { kind: 'checking' } : { kind: 'unknown' };
      const best = bestMatch(discovery.snapshot.items, discovery.matches);
      if (best === null) return { kind: 'none' };
      const count = discovery.snapshot.items.filter((item) => discovery.matches!.has(itemKey(item))).length;
      return { kind: 'best', item: best.item, level: best.match.level, count };
    }
    default:
      return { kind: 'unknown' };
  }
}
