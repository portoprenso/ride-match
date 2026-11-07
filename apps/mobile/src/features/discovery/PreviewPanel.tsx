import type { CoordinatesDto, MatchLevel, NearbyItemDto } from '@ride-match/contracts';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { spacing } from '../../ui/tokens';
import { matchLabel } from '../destinations/matches';
import { approximateDistance, departureText, describeItem } from './nearbyItems';
import type { PreviewState, PreviewTarget } from './useTargetPreview';

type GroupItem = Extract<NearbyItemDto, { kind: 'group' }>;

const SEATS_IN_WORDS = ['no', 'one', 'two', 'three'] as const;

/**
 * Whether a group can take another rider, and how to say so. Only a `forming` group with a free
 * seat accepts joins (`docs/api/groups.md`, transitions); a `ready` group has stopped taking them.
 */
export function describeGroupAvailability(group: Pick<GroupItem, 'status' | 'memberCount' | 'capacity'>): {
  joinable: boolean;
  badge: string;
  headline: string;
} {
  const open = Math.max(0, group.capacity - group.memberCount);
  if (group.status === 'ready') {
    return { joinable: false, badge: 'Ready · not taking riders', headline: 'This group is getting ready to leave.' };
  }
  if (open === 0) return { joinable: false, badge: 'Forming · full', headline: 'This group is full.' };
  const seats = `${SEATS_IN_WORDS[open] ?? open} seat${open === 1 ? '' : 's'} open`;
  return { joinable: true, badge: `Forming · ${seats}`, headline: `Room for ${SEATS_IN_WORDS[open] ?? open} more.` };
}

/** The header's words for the open preview: its kind and a short public summary. */
export function previewTitle(
  target: PreviewTarget,
  state: PreviewState,
  fix: Readonly<CoordinatesDto> | null,
  now: number,
): { title: string; subtitle: string | null } {
  const noun = target.kind === 'ride' ? 'Ride' : 'Group';
  if (state.kind === 'gone') return { title: `${noun} no longer available`, subtitle: null };
  const item = state.item;
  return { title: `${noun} preview`, subtitle: item === null ? null : describeItem(item, fix, now).markerLabel };
}

type PreviewPanelProps = {
  target: PreviewTarget;
  state: PreviewState;
  fix: Readonly<CoordinatesDto> | null;
  now: number;
  /** Synthetic riders: the rider line says the profile is a demo one. */
  demo: boolean;
  /** The rider asked to join and is signed in: say what joining needs; nothing was reserved. */
  joinRequested: boolean;
  /** The supplied match level for the chosen destination (design 05's badge), if any. */
  match?: MatchLevel | null;
  onJoin: () => void;
  onRetry: () => void;
  /** Reads nearby activity again and closes the preview (screen 55). */
  onRefreshNearby: () => void;
  onClose: () => void;
};

/**
 * The home sheet while a ride or group preview is open (screens 05, 19 and 55). It shows only the
 * public projection: the rider's display name, the curated destination, the departure, a group's
 * occupancy and status, and an approximate distance from the public area. Never a member, a
 * meeting point or an exact location.
 *
 * The join action appears only once the source has just confirmed the target is available, and
 * it reserves nothing: it records the intent (through sign-in when needed). Joining itself, with
 * the rider's own request and a final availability check, belongs to the join confirmation.
 * When the target is gone (screen 55) the stale action disappears, and the rider's own request,
 * if any, is left as it is.
 */
export function PreviewPanel({
  target,
  state,
  fix,
  now,
  demo,
  joinRequested,
  match = null,
  onJoin,
  onRetry,
  onRefreshNearby,
  onClose,
}: PreviewPanelProps) {
  const back = <Button label="Back to map" variant="secondary" onPress={onClose} />;

  if (state.kind === 'gone') {
    const what =
      target.kind === 'ride'
        ? 'The selected ride expired or was removed before you could join.'
        : 'The selected group closed or was removed before you could join.';
    return (
      <View style={styles.panel}>
        <View style={styles.heading}>
          <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
            That plan has changed.
          </AppText>
          <AppText color="muted">{what}</AppText>
        </View>
        <Notice message="Its join action is no longer available, and nothing was reserved. Your own active request, if you have one, stays active." />
        <Button label="Refresh nearby plans" onPress={onRefreshNearby} />
        {back}
      </View>
    );
  }

  const item = state.item;
  const status =
    state.kind === 'checking'
      ? 'Checking it’s still available…'
      : state.kind === 'failed'
        ? 'This plan couldn’t be checked, so it can’t be joined right now.'
        : null;
  const distance = item === null || fix === null ? null : approximateDistance(fix, item.publicOrigin.center);
  const available = state.kind === 'available';

  return (
    <View style={styles.panel}>
      {match !== null && item !== null ? (
        <View style={styles.heading}>
          <Badge label={matchLabel(match)} tone="success" />
        </View>
      ) : null}
      {item === null ? null : item.kind === 'ride' ? (
        <RideSummary item={item} distance={distance} now={now} demo={demo} />
      ) : (
        <GroupSummary item={item} distance={distance} now={now} />
      )}
      {status === null ? null : (
        <AppText color="muted" accessibilityLiveRegion="polite">
          {status}
        </AppText>
      )}
      {state.kind === 'failed' ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
      {available && joinRequested ? (
        <Notice message="Joining starts from your own ride request, which this build can’t create yet. Nothing was reserved, and no seat is held." />
      ) : null}
      {available ? <JoinAction item={state.item} onJoin={onJoin} /> : null}
      {back}
    </View>
  );
}

function RideSummary({
  item,
  distance,
  now,
  demo,
}: {
  item: Extract<NearbyItemDto, { kind: 'ride' }>;
  distance: string | null;
  now: number;
  demo: boolean;
}) {
  return (
    <>
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          Heading to {item.destination.label}
        </AppText>
        <AppText color="muted">
          {[distance && `${distance} away`, departureText(item.departureAt, now)].filter(Boolean).join(' · ')}
        </AppText>
      </View>
      <View style={styles.rider}>
        <AppText variant="label">{item.user.displayName}</AppText>
        <AppText variant="small" color="muted">
          One seat · {demo ? 'Public demo profile' : 'Public profile'}
        </AppText>
      </View>
      <Notice message="This pin is approximate. A shared meeting point appears after you join a group." />
    </>
  );
}

function GroupSummary({ item, distance, now }: { item: GroupItem; distance: string | null; now: number }) {
  const availability = describeGroupAvailability(item);
  return (
    <>
      <View style={styles.heading}>
        <Badge label={availability.badge} tone={availability.joinable ? 'success' : 'neutral'} />
        <AppText variant="section" accessibilityRole="header">
          {availability.headline}
        </AppText>
        <AppText color="muted">
          {[
            item.destination.label,
            `${item.memberCount}/${item.capacity} people`,
            distance,
            departureText(item.departureAt, now),
          ]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>
      <Notice message="Public preview shows occupancy and direction. Members, chat and the exact meeting point stay private." />
    </>
  );
}

function JoinAction({ item, onJoin }: { item: NearbyItemDto; onJoin: () => void }) {
  if (item.kind === 'ride') return <Button label="Plan to join this rider" onPress={onJoin} />;
  if (!describeGroupAvailability(item).joinable) return null;
  return (
    <>
      <AppText variant="small" color="muted">
        You need an active ride request before joining. Availability is checked again on confirmation.
      </AppText>
      <Button label="Create a request to join" onPress={onJoin} />
    </>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
  },
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  rider: {
    gap: spacing.xs,
  },
});
