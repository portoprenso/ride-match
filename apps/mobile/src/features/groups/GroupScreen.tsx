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
import { Share, StyleSheet, View } from 'react-native';

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
import { SheetHost } from '../../ui/SheetHost';
import { UnavailableScreen } from '../../ui/UnavailableScreen';
import { colors, radii, spacing } from '../../ui/tokens';
import { ActionFooter } from '../../ui/ActionFooter';
import { useViewer } from '../auth/AuthSessionProvider';
import { openTaxi, openTaxiWebsite } from '../../platform/taxi/openTaxi';
import { useClock } from '../discovery/useClock';
import {
  CHANGE_LABELS,
  describeActionError,
  describeClosure,
  groupControls,
  type StatusChange,
} from './groupLifecycle';
import { describeWalk, MeetingPointSheet } from './MeetingPointSheet';
import { MemberMenu } from './MemberMenu';
import { describeTaxiProblem, describeTripForSharing, TaxiReviewSheet } from './TaxiReviewSheet';
import { isReviewCurrent, reviewTaxiTrip, type TaxiReview } from './taxiReview';

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

/**
 * The one sheet the group screen opens: a member's menu, the meeting point, a leave or cancel
 * confirmation, or the taxi review with whether its last opening failed.
 */
type GroupSheet =
  | { kind: 'member'; member: GroupMemberDto }
  | { kind: 'taxi'; review: TaxiReview; failed: boolean }
  | { kind: 'leave' }
  | { kind: 'cancel' }
  | { kind: 'meeting'; openedId: string }
  | null;

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
 * - **Meeting point** (15, 33): its place and the viewer's supplied walking estimate, "View
 *   meeting point" for the member-only map sheet (`MeetingPointSheet`), or, while there is none,
 *   that one is coming, with "Refresh group". A suggested, replaced or withdrawn point is
 *   announced; a replaced point never keeps an earlier readiness (the source reopens the group).
 *
 * - **Taxi** (16, 17, 38, 49): in a ready group, every member may review the trip. The group is
 *   read again first, and the review (`reviewTaxiTrip`) is made from that answer: the meeting point
 *   to the destination. "Open Yandex Go" opens only while the review still matches the group as
 *   read (`isReviewCurrent`); otherwise the sheet asks for a new review. It records
 *   `taxi_open_clicked` per attempt and `taxi_opened` when the OS accepts the link; a refusal
 *   shows the failure (38) with a retry, the website link and the trip details to copy or share.
 *   Opening a link never changes the group: returning to the app reads it again (the sync
 *   coordinator refetches the screen's reads on foreground), and only the coordinator completes it.
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

  // While watching: a member left, the viewer became coordinator (35), or the source suggested,
  // replaced or withdrew the meeting point (which also returns a ready group to forming).
  const group = lostAccess ? undefined : query.data;
  const [seen, setSeen] = useState<{
    coordinatorId: string;
    members: number;
    pointId: string | null;
    status: string;
  } | null>(null);
  if (group !== undefined && member !== null) {
    const current = {
      coordinatorId: group.coordinatorId,
      members: group.members.length,
      pointId: group.meetingPoint?.id ?? null,
      status: group.status,
    };
    if (
      seen === null ||
      seen.coordinatorId !== current.coordinatorId ||
      seen.members !== current.members ||
      seen.pointId !== current.pointId ||
      seen.status !== current.status
    ) {
      if (seen !== null && current.pointId !== seen.pointId) {
        const again = seen.status === 'ready' && current.status === 'forming' ? ' The group is forming again.' : '';
        setNotice(
          current.pointId === null
            ? `The meeting point was withdrawn.${again}`
            : seen.pointId === null
              ? 'A meeting point was suggested.'
              : `The meeting point changed. Check it before the group is marked ready.${again}`,
        );
      } else if (seen !== null && current.members < seen.members) {
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

  // Taxi: review from a fresh read, open only a current review, report what the OS said.
  const [taxiChecking, setTaxiChecking] = useState(false);
  const [taxiOpening, setTaxiOpening] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const reviewTaxi = async () => {
    if (taxiChecking) return;
    setTaxiChecking(true);
    setNotice(null);
    const fresh = await query.refetch();
    setTaxiChecking(false);
    if (fresh.isError || fresh.data === undefined) {
      // A lost access shows its own screen; anything else can be tried again.
      if (!(fresh.error?.code === 'MEMBERSHIP_REQUIRED' || fresh.error?.code === 'HISTORY_EXPIRED')) {
        setNotice('The trip details couldn’t be checked. Try again.');
      }
      return;
    }
    const result = reviewTaxiTrip(fresh.data);
    if (!result.ok) {
      setNotice(describeTaxiProblem(result.problem));
      return;
    }
    setShareMessage(null);
    setSheet({ kind: 'taxi', review: result.review, failed: false });
  };
  const openYandexGo = async (review: TaxiReview, via: 'app' | 'website') => {
    if (taxiOpening || group === undefined || !isReviewCurrent(review, group)) return;
    analytics.track('taxi_open_clicked');
    setTaxiOpening(true);
    setShareMessage(null);
    const outcome = await (via === 'app' ? openTaxi : openTaxiWebsite)(review.trip);
    setTaxiOpening(false);
    if (outcome.kind === 'handed-off') {
      analytics.track('taxi_opened');
      setSheet(null);
      setNotice(
        'Yandex Go was asked to open your trip. Your group is still ready; booking and payment happen in Yandex Go.',
      );
      return;
    }
    setSheet({ kind: 'taxi', review, failed: true });
  };
  const shareTrip = async (review: TaxiReview) => {
    setShareMessage(null);
    try {
      await Share.share({ message: describeTripForSharing(review) });
    } catch {
      setShareMessage('The trip details couldn’t be shared. Try again.');
    }
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
    ) : sheet?.kind === 'meeting' ? (
      <MeetingPointSheet
        point={group.meetingPoint}
        openedId={sheet.openedId}
        onOpenChat={() => {
          // The sheet closes before another route opens over it (SheetHost).
          setSheet(null);
          onOpenChat(group.id);
        }}
        onReturn={() => setSheet(null)}
      />
    ) : sheet?.kind === 'taxi' ? (
      <TaxiReviewSheet
        review={sheet.review}
        current={reviewTaxiTrip(group)}
        failed={sheet.failed}
        opening={taxiOpening}
        shareMessage={shareMessage}
        onOpen={() => void openYandexGo(sheet.review, 'app')}
        onOpenWebsite={() => void openYandexGo(sheet.review, 'website')}
        onShare={() => void shareTrip(sheet.review)}
        onReviewAgain={(review) => setSheet({ kind: 'taxi', review, failed: false })}
        onBack={() => setSheet(null)}
      />
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
      dismissible={!leave.isPending && !change.isPending && !taxiOpening}
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
        <View style={styles.row}>
          <AppText variant="label">A meeting point is coming.</AppText>
          <AppText variant="small" color="muted">
            We haven’t received a suggested shared place yet.
          </AppText>
          <Button
            label="Refresh group"
            variant="secondary"
            busy={query.isFetching}
            onPress={() => void query.refetch()}
          />
        </View>
      ) : (
        <View style={styles.row}>
          <AppText variant="label">{group.meetingPoint.label}</AppText>
          <AppText variant="small" color="muted">
            {[
              group.status === 'ready' ? 'Agreed shared pickup' : 'Suggested meeting point',
              describeWalk(group.meetingPoint),
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
          <Button
            label="View meeting point"
            variant="secondary"
            onPress={() => group.meetingPoint && setSheet({ kind: 'meeting', openedId: group.meetingPoint.id })}
          />
        </View>
      )}
      <AppText color="muted">{summary.nextStep}</AppText>
      {failure === null ? null : (
        <AppText color="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {failure.message}
        </AppText>
      )}
      <View style={styles.actions}>
        {group.status === 'ready' ? (
          <Button
            label={summary.viewerIsCoordinator ? 'Review Yandex Go handoff' : 'Review taxi details'}
            busy={taxiChecking}
            onPress={() => void reviewTaxi()}
          />
        ) : null}
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
            Readiness needs at least two people and a shared meeting point. A full group alone is not enough.
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
