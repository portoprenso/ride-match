import { GROUP_POLICY, IdSchema, type GroupMemberDto, type RideGroupDto } from '@ride-match/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDataSource } from '../../data/DataSourceProvider';
import { useDemoSignIn } from '../../data/DemoSignInProvider';
import { groupDetailQuery } from '../../data/queries';
import { useEventSubscription } from '../../data/SyncProvider';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Notice } from '../../ui/Notice';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { SheetContent, SheetHost } from '../../ui/SheetHost';
import { UnavailableScreen } from '../../ui/UnavailableScreen';
import { colors, radii, spacing } from '../../ui/tokens';
import { ActionFooter } from '../../ui/ActionFooter';
import { useViewer } from '../auth/AuthSessionProvider';
import { useClock } from '../discovery/useClock';

const SEATS_IN_WORDS = ['No', 'One', 'Two', 'Three'] as const;

/** What the group screen shows (designs 13 and 32), from the member-only group and the viewer. */
export type GroupSummary = {
  /** "Forming · 2/4 people", "Ready · 3/4 people" or "Closed · 2/4 people". */
  badge: string;
  headline: string;
  /** Why a full group still forms, or `null`. */
  note: string | null;
  /** "Two seats still open", or `null` when the group is full or not forming. */
  openSeats: string | null;
  viewerIsCoordinator: boolean;
  /** The next step for the viewer, by role. */
  nextStep: string;
};

/**
 * Describes a group for its member `viewerId`. Occupancy is counted from the members the source
 * returned, never stored: a fourth member makes the group full, still forming until its
 * coordinator marks it ready.
 */
export function describeGroup(group: RideGroupDto, viewerId: string): GroupSummary {
  const count = group.members.length;
  const occupancy = `${count}/${group.capacity} people`;
  const coordinator = group.members.find((member) => member.user.id === group.coordinatorId);
  const viewerIsCoordinator = group.coordinatorId === viewerId;
  const open = Math.max(0, group.capacity - count);
  const statusWord = group.status === 'forming' ? 'Forming' : group.status === 'ready' ? 'Ready' : 'Closed';
  const full = open === 0;
  const closed = group.status === 'completed' || group.status === 'cancelled';
  return {
    badge: `${statusWord} · ${occupancy}`,
    headline: closed
      ? 'This group has closed.'
      : full && group.status === 'forming'
        ? 'Everyone’s here.'
        : `${group.destination.label}, together.`,
    note: full && group.status === 'forming' ? 'Full does not automatically mean ready.' : null,
    openSeats:
      group.status === 'forming' && !full
        ? `${SEATS_IN_WORDS[open] ?? open} seat${open === 1 ? '' : 's'} still open`
        : null,
    viewerIsCoordinator,
    nextStep: closed
      ? 'No one can join this group now.'
      : viewerIsCoordinator
        ? 'Confirm the shared meeting point in chat, then mark the group ready.'
        : `Agree on the meeting point in chat. ${coordinator?.user.displayName ?? 'The coordinator'} will mark the group ready.`,
  };
}

/** "Leaving in about 5 min · Group closes in 28 min", from the source's times and device time. */
export function describeGroupTimes(group: RideGroupDto, now: number): string {
  const minutes = (at: string) => Math.max(0, Math.round((Date.parse(at) - now) / 60_000));
  const leaving = minutes(group.departureAt);
  return [
    leaving === 0 ? 'Leaving now' : `Leaving in about ${leaving} min`,
    `Group closes in ${minutes(group.expiresAt)} min`,
  ].join(' · ');
}

type GroupScreenProps = {
  /** The route's raw parameter; it is only ever sent to the source, never shown. */
  groupId: string | undefined;
  onBack: () => void;
  onGoHome: () => void;
  onOpenChat: (groupId: string) => void;
};

/**
 * The group route (designs 13 and 32): the member-only group, read from the source
 * (`GET /groups/{groupId}`) and kept live by a `group` subscription, so occupancy moves
 * 2 → 3 → 4 as members join, without the viewer doing anything.
 *
 * Direct entry is authorized by the source, never by the route: a malformed ID, an anonymous
 * viewer, a non-member, an unknown group or an expired history all show the same unavailable
 * state, which repeats nothing from the link. Members are listed in join order with their role;
 * the viewer is marked "You". Each other member has a menu that names that member, so a later
 * report or block can never fall on the wrong person.
 *
 * Status changes, leaving and the closed and revoked states belong to GROUP-002-C; the meeting
 * point's sheet to MEETING-001-B.
 */
export function GroupScreen({ groupId, onBack, onGoHome, onOpenChat }: GroupScreenProps) {
  const dataSource = useDataSource();
  const viewer = useViewer();
  const valid = groupId !== undefined && IdSchema.safeParse(groupId).success;
  const member = viewer.kind === 'user' && valid ? viewer : null;
  const query = useQuery({
    ...groupDetailQuery(dataSource, member ?? { kind: 'user', userId: '' }, groupId ?? ''),
    enabled: member !== null,
  });
  useEventSubscription(member !== null && groupId !== undefined ? { kind: 'group', groupId } : null);
  const now = useClock();
  const demo = useDemoSignIn() !== null;
  const [menuFor, setMenuFor] = useState<GroupMemberDto | null>(null);

  const denied =
    member === null ||
    query.error?.code === 'MEMBERSHIP_REQUIRED' ||
    query.error?.code === 'HISTORY_EXPIRED' ||
    query.error?.code === 'UNAUTHENTICATED';
  if (denied) {
    return (
      <UnavailableScreen
        title="Group unavailable"
        message="You don’t have access to this group. Only its current members can open it."
        onGoHome={onGoHome}
      />
    );
  }
  const group = query.data;
  if (group === undefined) {
    return (
      <Screen>
        <ScreenHeader title="Your group" onBack={onBack} backLabel="Back to map" />
        <View style={styles.centre}>
          {query.error === null ? (
            <AppText color="muted" accessibilityLiveRegion="polite">
              Loading your group…
            </AppText>
          ) : (
            <>
              <AppText color="muted" accessibilityLiveRegion="polite">
                Your group couldn’t be loaded.
              </AppText>
              <Button label="Try again" variant="secondary" onPress={() => void query.refetch()} />
            </>
          )}
        </View>
      </Screen>
    );
  }

  const summary = describeGroup(group, member.userId);
  const live = group.status === 'forming' || group.status === 'ready';
  return (
    <Screen
      scroll
      footer={
        live ? (
          <ActionFooter>
            <Button label="Open group chat" onPress={() => onOpenChat(group.id)} />
          </ActionFooter>
        ) : undefined
      }
    >
      <ScreenHeader
        title={summary.viewerIsCoordinator ? 'Your group · coordinator' : 'Your group'}
        onBack={onBack}
        backLabel="Back to map"
      />
      <View style={styles.heading}>
        <Badge label={summary.badge} tone={group.status === 'ready' ? 'success' : 'neutral'} />
        <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
          {summary.headline}
        </AppText>
        {summary.note === null ? null : <AppText color="muted">{summary.note}</AppText>}
        {live ? <AppText color="muted">{describeGroupTimes(group, now)}</AppText> : null}
      </View>
      <View style={styles.list} accessibilityLabel={`Members, ${group.members.length} of ${GROUP_POLICY.capacity}`}>
        {group.members.map((entry) => (
          <MemberRow
            key={entry.user.id}
            member={entry}
            coordinator={entry.user.id === group.coordinatorId}
            self={entry.user.id === member.userId}
            demo={demo}
            onMenu={() => setMenuFor(entry)}
          />
        ))}
        {summary.openSeats === null ? null : (
          <View style={[styles.row, styles.open]}>
            <AppText variant="label">{summary.openSeats}</AppText>
            <AppText variant="small" color="muted">
              Up to {GROUP_POLICY.capacity} people can join
            </AppText>
          </View>
        )}
      </View>
      {group.meetingPoint === null ? (
        <Notice message="No meeting point yet. A suggested point appears here when it’s ready." />
      ) : (
        <View style={styles.row}>
          <AppText variant="label">{group.meetingPoint.label}</AppText>
          <AppText variant="small" color="muted">
            Suggested meeting point
          </AppText>
        </View>
      )}
      <AppText color="muted">{summary.nextStep}</AppText>
      <MemberMenu member={menuFor} onClose={() => setMenuFor(null)} />
    </Screen>
  );
}

function MemberRow({
  member,
  coordinator,
  self,
  demo,
  onMenu,
}: {
  member: GroupMemberDto;
  coordinator: boolean;
  self: boolean;
  demo: boolean;
  onMenu: () => void;
}) {
  const name = self ? 'You' : member.user.displayName;
  const role = coordinator ? 'Coordinator' : 'Member · One seat';
  return (
    <View style={[styles.row, styles.member]}>
      <View style={styles.memberText}>
        <AppText variant="label">{name}</AppText>
        <AppText variant="small" color="muted">
          {demo && !self ? `${role} · Demo profile` : role}
        </AppText>
      </View>
      {self ? null : (
        <IconButton
          icon={<AppText variant="label">⋯</AppText>}
          accessibilityLabel={`More actions for ${member.user.displayName}`}
          tone="white"
          onPress={onMenu}
        />
      )}
    </View>
  );
}

/**
 * The menu for one other member, named in its title, so its actions apply to that person only.
 * Reporting and blocking arrive with SAFETY-001; until then they are shown, disabled, with a note,
 * and nothing is sent.
 */
function MemberMenu({ member, onClose }: { member: GroupMemberDto | null; onClose: () => void }) {
  const name = member?.user.displayName ?? '';
  return (
    <SheetHost open={member !== null} onDismiss={onClose}>
      {member === null ? null : (
        <SheetContent
          footer={
            <ActionFooter>
              <Button label="Close" variant="ghost" onPress={onClose} />
            </ActionFooter>
          }
        >
          <View style={styles.heading}>
            <AppText variant="section" accessibilityRole="header">
              {name}
            </AppText>
            <AppText color="muted">Actions for this member only.</AppText>
          </View>
          <Button label={`Report ${name}`} variant="secondary" disabled onPress={() => undefined} />
          <Button label={`Block ${name}`} variant="secondary" disabled onPress={() => undefined} />
          <Notice message="Reporting and blocking aren’t available in this demo build yet. Nothing was sent." />
        </SheetContent>
      )}
    </SheetHost>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.soft,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberText: {
    gap: spacing.xs,
    flexShrink: 1,
  },
  open: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: undefined,
  },
});
