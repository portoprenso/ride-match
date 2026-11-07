import type { CoordinatesDto, NearbyItemDto } from '@ride-match/contracts';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Notice } from '../../ui/Notice';
import { SheetContent, SheetHost } from '../../ui/SheetHost';
import { colors, radii, spacing } from '../../ui/tokens';
import { describeItem, itemKey } from './nearbyItems';

/** What the list shows: the whole snapshot on the map, or one cluster's items. */
export type NearbyListContent = {
  items: readonly NearbyItemDto[];
  /** The source left more items out of this view (`truncated`); only for the whole snapshot. */
  truncated: boolean;
  /** The items are the last view and may have changed. */
  stale: boolean;
  /** From a cluster whose items share one area, rather than the whole view. */
  fromCluster: boolean;
};

type NearbyListSheetProps = {
  /** `null` while closed. */
  content: NearbyListContent | null;
  onClose: () => void;
  onSelect: (item: NearbyItemDto) => void;
  fix: Readonly<CoordinatesDto> | null;
  now: number;
  /** Synthetic riders: the list says so, as the design's badge does. */
  demo: boolean;
};

/**
 * The nearby list (design 20): the same items the map shows, in the source's order (nearest the
 * view's centre first), as an accessible alternative to inspecting markers. A row opens its
 * item's preview and shows it on the map; it reserves nothing.
 *
 * It says when the source left items out, when the list is the last view, and that a group's
 * occupancy counts people while map counts count ride plans.
 */
export function NearbyListSheet({ content, onClose, onSelect, fix, now, demo }: NearbyListSheetProps) {
  return (
    <SheetHost open={content !== null} onDismiss={onClose}>
      {content ? (
        <SheetContent
          footer={
            <ActionFooter>
              <Button label="Return to map" variant="secondary" onPress={onClose} />
            </ActionFooter>
          }
        >
          <View style={styles.heading}>
            <AppText variant="section" accessibilityRole="header">
              {content.fromCluster ? `${content.items.length} ride plans here` : 'Nearby, at a glance.'}
            </AppText>
            <AppText color="muted">
              {content.fromCluster
                ? 'They share one approximate area, so the map can’t separate them.'
                : 'An accessible alternative to inspecting map markers.'}
            </AppText>
            {demo ? <Badge label="Demo · approximate distances" /> : null}
          </View>
          {content.truncated ? (
            <Notice
              message={`Showing the nearest ${content.items.length}. More ride plans are in this view; zoom in to see a smaller area.`}
            />
          ) : null}
          {content.stale ? (
            <Notice tone="warning" message="This is the last view. These ride plans may have changed." />
          ) : null}
          <View style={styles.list} accessibilityRole="list">
            {content.items.map((item) => {
              const words = describeItem(item, fix, now);
              return (
                <Pressable
                  key={itemKey(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${words.title}, ${words.detail}`}
                  accessibilityHint="Opens its preview and shows it on the map."
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.icon}>
                    <Icon name={item.kind === 'group' ? 'users' : 'arrow'} size={20} />
                  </View>
                  <View style={styles.copy}>
                    <AppText variant="label">{words.title}</AppText>
                    <AppText variant="small" color="muted">
                      {words.detail}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="small" color="muted">
            Group occupancy counts people. Counts on the map count ride plans, and a group counts once.
          </AppText>
        </SheetContent>
      ) : null}
    </SheetHost>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.soft,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
});
