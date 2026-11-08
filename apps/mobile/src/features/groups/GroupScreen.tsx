import {
  GROUP_POLICY,
  IdSchema,
  type GroupMemberDto,
  type LeaveGroupResultDto,
  type RideGroupDto,
  type UpdateGroupStatusInput,
} from '@ride-match/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { useDataSource } from '../../data/DataSourceProvider';
import { useDemoSignIn } from '../../data/DemoSignInProvider';
import { withDataErrors, type DataError } from '../../data/errors';
import { createOperationId } from '../../data/operationId';
import { groupDetailQuery } from '../../data/queries';
import { queryKeys } from '../../data/queryKeys';
import { useEventSubscription } from '../../data/SyncProvider';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { ConfirmAction } from '../../ui/ConfirmAction';
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
import {
  CHANGE_LABELS,
  describeActionError,
  describeClosure,
  groupControls,
  type StatusChange,
} from './groupLifecycle';

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
      : group.status === 'ready'
        ? viewerIsCoordinator
          ? 'Ready to head out.'
          : 'All set to meet.'
        : full
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
      : group.status === 'ready'
        ? viewerIsCoordinator
          ? 'Only the coordinator can reopen, complete or cancel. Opening the taxi provider does not change group status.'
          : `${coordinator?.user.displayName ?? 'The coordinator'} confirmed your group is ready. Coordinate who books in chat. Opening Yandex Go does not book a taxi or complete this group.`
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

/** The one sheet the group screen opens: a member's menu, or a leave or cancel confirmation. */
type GroupSheet = { kind: 'member'; member: GroupMemberDto } | { kind: 'leave' } | { kind: 'cancel' } | null;

/**
 * The group route (designs 13, 16, 18, 32, 34, 35, 37, 49, 51): the member-only group, read from
 * the source (`GET /groups/{groupId}`) and kept live by a `group` subscription, so occupancy moves
 * 2 → 3 → 4 as members join, without the viewer doing anything.
 *
 * - **Access:** decided by the source, never by the route. A malformed ID, an anonymous viewer, a
 *   non-member, an unknown group or an expired history all show the same unavailable state, which
 *   repeats nothing from the link. If access ends while the screen is open (the viewer left
 *   elsewhere, or the history expired), the group's private reads are removed and the screen says
 *   so (37): a late or denied answer never shows an older copy.
 * - **Members:** in join order with their role; the viewer is "You". Each other member has a menu
 *   that names that member, so a later report or block can never fall on the wrong person. When
 *   the viewer becomes coordinator because someone left, the screen says so (35).
 * - **Controls by role and status** (`groupControls`): the coordinator marks the group ready (only
 *   with a meeting point), reopens, completes or cancels (51, confirmed first); everyone may leave
 *   (34, confirmed first). Each change sends the version on screen and an operation ID fixed at
 *   the first press; only the source's answer changes the screen. A conflict rereads the group; an
 *   unknown outcome retries the same operation.
 * - **Leaving** cancels the viewer's request, removes the group's private reads at once and returns
 *   to the map.
 * - **Closed** (18): the reason, when it closed, and that history stays read-only for an hour; no
 *   action but going back.
 *
 * The meeting point's sheet is MEETING-001-B's; the taxi review TAXI-001's.
 */
export function GroupScreen({ groupId, onBack, onGoHome, onOpenChat }: GroupScreenProps) {
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
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
  const [sheet, setSheet] = useState<GroupSheet>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Access ends: drop the group's private data, so nothing older can show again.
  const lostAccess =
    member !== null && (query.error?.code === 'MEMBERSHIP_REQUIRED' || query.error?.code === 'HISTORY_EXPIRED');
  const [shown, setShown] = useState(false);
  if (query.data !== undefined && !shown) setShown(true);
  useEffect(() => {
    if (!lostAccess || member === null || groupId === undefined) return;
    void queryClient.cancelQueries({ queryKey: queryKeys.group(member, groupId) });
    queryClient.removeQueries({ queryKey: queryKeys.group(member, groupId) });
  }, [lostAccess, member, groupId, queryClient]);

  // The viewer became coordinator, or a member left, while watching (35).
  const group = lostAccess ? undefined : query.data;
  const [seen, setSeen] = useState<{ coordinatorId: string; members: number } | null>(null);
  if (group !== undefined && member !== null) {
    const current = { coordinatorId: group.coordinatorId, members: group.members.length };
    if (seen === null || seen.coordinatorId !== current.coordinatorId || seen.members !== current.members) {
      if (seen !== null && current.members < seen.members) {
        const role =
          current.coordinatorId === member.userId && seen.coordinatorId !== member.userId
            ? ' You’re now the coordinator.'
            : '';
        setNotice(`A member has left.${role}`);
      } else if (seen !== null && current.coordinatorId === member.userId && seen.coordinatorId !== member.userId) {
        setNotice('You’re now the coordinator.');
      }
      setSeen(current);
    }
  }

  // Status changes: input fixed at the first press, resent as is after an unknown outcome.
  const [sent, setSent] = useState<UpdateGroupStatusInput | null>(null);
  const change = useMutation<RideGroupDto, DataError, UpdateGroupStatusInput>({
    mutationFn: (input) => withDataErrors(dataSource.groups.updateStatus(groupId ?? '', input)),
    onSuccess: (updated) => {
      if (member === null) return;
      queryClient.setQueryData(queryKeys.groupDetail(member, updated.id), updated);
      if (updated.status === 'completed') {
        analytics.track('ride_completed', {
          memberCount: Math.min(Math.max(updated.members.length, GROUP_POLICY.minMembers), GROUP_POLICY.capacity),
        });
      }
      if (updated.status === 'completed' || updated.status === 'cancelled') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.ownRequest(member) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser(member) });
      }
      setSent(null);
      setSheet(null);
    },
    onError: (error) => {
      const failure = describeActionError(error);
      if (failure.kind === 'reread' || failure.kind === 'revoked') {
        setSent(null);
        void query.refetch();
      }
    },
  });
  const requestChange = (status: StatusChange) => {
    if (change.isPending || group === undefined) return;
    const retrying = sent !== null && sent.status === status && change.error !== null;
    const input = retrying ? sent : { operationId: createOperationId(), status, expectedVersion: group.version };
    setSent(input);
    setNotice(null);
    change.mutate(input);
  };

  // Leaving: same rule; success cancels the request and ends access at once.
  const [leaveId, setLeaveId] = useState<string | null>(null);
  const leave = useMutation<LeaveGroupResultDto, DataError, string>({
    mutationFn: (operationId) => withDataErrors(dataSource.groups.leave(groupId ?? '', { operationId })),
    onSuccess: (result) => {
      if (member === null) return;
      void queryClient.cancelQueries({ queryKey: queryKeys.group(member, result.groupId) });
      queryClient.removeQueries({ queryKey: queryKeys.group(member, result.groupId) });
      queryClient.setQueryData(queryKeys.ownRequest(member), result.rideRequest);
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser(member) });
      analytics.track('group_left');
      setSheet(null);
      onGoHome();
    },
    onError: (error) => {
      if (describeActionError(error).kind !== 'retry') {
        setLeaveId(null);
        void query.refetch();
      }
    },
  });
  const confirmLeave = () => {
    if (leave.isPending) return;
    const id = leaveId ?? createOperationId();
    if (leaveId === null) analytics.track('group_leave_clicked');
    setLeaveId(id);
    leave.mutate(id);
  };

  if (member === null || (lostAccess && !shown) || query.error?.code === 'UNAUTHENTICATED') {
    return (
      <UnavailableScreen
        title="Group unavailable"
        message="You don’t have access to this group. Only its current members can open it."
        onGoHome={onGoHome}
      />
    );
  }
  if (lostAccess) {
    return (
      <UnavailableScreen
        title="Group unavailable"
        message="You no longer have access. You may have left this group, or its history may have expired. Private messages and the shared meeting point have been cleared from this view."
        onGoHome={onGoHome}
      />
    );
  }
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

  const live = group.status === 'forming' || group.status === 'ready';
  const sheetContent =
    sheet?.kind === 'member' ? (
      <MemberMenu member={sheet.member} onClose={() => setSheet(null)} />
    ) : sheet?.kind === 'leave' ? (
      <ConfirmAction
        title="Leave this group?"
        message="Your request will be cancelled and you’ll lose access to this group’s chat and meeting point."
        confirmLabel="Leave group"
        cancelLabel="Stay with my group"
        tone="danger"
        busy={leave.isPending}
        error={leave.error === null ? undefined : describeActionError(leave.error).message}
        onConfirm={confirmLeave}
        onCancel={() => setSheet(null)}
      >
        <Notice message="If fewer than two people remain, the group closes. If the coordinator leaves, the earliest remaining member takes over." />
      </ConfirmAction>
    ) : sheet?.kind === 'cancel' ? (
      <ConfirmAction
        title="Close the group for everyone?"
        message="As coordinator, you can cancel this group. All active requests in it will be cancelled."
        confirmLabel="Cancel group for everyone"
        cancelLabel={group.status === 'ready' ? 'Keep group ready' : 'Keep group'}
        tone="danger"
        busy={change.isPending}
        error={change.error === null ? undefined : describeActionError(change.error).message}
        onConfirm={() => requestChange('cancelled')}
        onCancel={() => setSheet(null)}
      >
        <Notice message="Nobody can join or send messages after cancellation. Authorized members retain read-only history for up to one hour." />
      </ConfirmAction>
    ) : null;
  const sheetHost = (
    <SheetHost
      open={sheet !== null}
      onDismiss={() => setSheet(null)}
      dismissible={!leave.isPending && !change.isPending}
    >
      {sheetContent}
    </SheetHost>
  );

  if (!live) {
    const closure = describeClosure(group);
    return (
      <Screen
        scroll
        footer={
          <ActionFooter>
            <Button label="Back to the map" onPress={onGoHome} />
          </ActionFooter>
        }
      >
        <ScreenHeader title={closure.title} onBack={onBack} backLabel="Back to map" />
        <View style={styles.heading}>
          <Badge label={`Closed · ${group.members.length}/${group.capacity} people`} />
          <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
            {closure.headline}
          </AppText>
          {closure.body === '' ? null : <AppText color="muted">{closure.body}</AppText>}
        </View>
        <View style={styles.row}>
          <AppText variant="label">{group.destination.label}</AppText>
          {group.closure === null ? null : (
            <AppText variant="small" color="muted">
              Group closed at {formatClock(group.closure.closedAt)}
            </AppText>
          )}
        </View>
        <Notice message="Chat is read-only for up to one hour after closure. Leaving a group removes your access immediately." />
      </Screen>
    );
  }

  const summary = describeGroup(group, member.userId);
  const controls = groupControls(group, member.userId);
  const failure = change.error === null || sheet?.kind === 'cancel' ? null : describeActionError(change.error);
  return (
    <Screen
      scroll
      footer={
        <ActionFooter>
          <Button label="Open group chat" onPress={() => onOpenChat(group.id)} />
        </ActionFooter>
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
        <AppText color="muted">{describeGroupTimes(group, now)}</AppText>
      </View>
      {notice === null ? null : (
        <View accessibilityLiveRegion="polite">
          <Notice message={notice} />
        </View>
      )}
      <View style={styles.list} accessibilityLabel={`Members, ${group.members.length} of ${GROUP_POLICY.capacity}`}>
        {group.members.map((entry) => (
          <MemberRow
            key={entry.user.id}
            member={entry}
            coordinator={entry.user.id === group.coordinatorId}
            self={entry.user.id === member.userId}
            demo={demo}
            onMenu={() => setSheet({ kind: 'member', member: entry })}
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
            {group.status === 'ready' ? 'Agreed shared pickup' : 'Suggested meeting point'}
          </AppText>
        </View>
      )}
      <AppText color="muted">{summary.nextStep}</AppText>
      {failure === null ? null : (
        <AppText color="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {failure.message}
        </AppText>
      )}
      <View style={styles.actions}>
        {controls.changes.includes('ready') || controls.needsPoint ? (
          <Button
            label={CHANGE_LABELS.ready}
            disabled={controls.needsPoint}
            busy={change.isPending && change.variables?.status === 'ready'}
            onPress={() => requestChange('ready')}
          />
        ) : null}
        {controls.needsPoint ? (
          <AppText variant="small" color="muted">
            A meeting point is needed before the group can be ready.
          </AppText>
        ) : null}
        {controls.changes.includes('forming') ? (
          <Button
            label={CHANGE_LABELS.forming}
            variant="secondary"
            busy={change.isPending && change.variables?.status === 'forming'}
            onPress={() => requestChange('forming')}
          />
        ) : null}
        {controls.changes.includes('completed') ? (
          <Button
            label={CHANGE_LABELS.completed}
            busy={change.isPending && change.variables?.status === 'completed'}
            onPress={() => requestChange('completed')}
          />
        ) : null}
        {controls.changes.includes('cancelled') ? (
          <Button label={CHANGE_LABELS.cancelled} variant="ghost" onPress={() => setSheet({ kind: 'cancel' })} />
        ) : null}
        {controls.canLeave ? (
          <Button label="Leave group" variant="ghost" onPress={() => setSheet({ kind: 'leave' })} />
        ) : null}
      </View>
      {sheetHost}
    </Screen>
  );
}

/** A closing time such as "9:58", in the device's locale. */
function formatClock(at: string): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
function MemberMenu({ member, onClose }: { member: GroupMemberDto; onClose: () => void }) {
  const name = member.user.displayName;
  return (
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
  actions: {
    gap: spacing.sm,
  },
  open: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: undefined,
  },
});
