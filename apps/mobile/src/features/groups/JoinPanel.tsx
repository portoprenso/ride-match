import { GROUP_POLICY, type JoinGroupInput, type OwnRideRequestDto, type RideGroupDto } from '@ride-match/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { useDataSource } from '../../data/DataSourceProvider';
import { withDataErrors, type DataError } from '../../data/errors';
import { createOperationId } from '../../data/operationId';
import { groupDetailQuery, ownRequestQuery } from '../../data/queries';
import { queryKeys } from '../../data/queryKeys';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { spacing } from '../../ui/tokens';
import { useViewer } from '../auth/AuthSessionProvider';
import { describeGroupAvailability } from '../discovery/PreviewPanel';
import type { PreviewState, PreviewTarget } from '../discovery/useTargetPreview';
import { describeJoinError, describeJoinPlan, type JoinFailure } from './joinOutcome';

type JoinPanelProps = {
  target: PreviewTarget;
  /** The target's preview read; the panel reads it again when it opens. */
  preview: PreviewState & { retry: () => void; fetching: boolean };
  /** The rider's current request; joining needs it `active`. */
  ownRequest: OwnRideRequestDto | null;
  now: number;
  /** The source joined the rider: the canonical group they now belong to. */
  onJoined: (group: RideGroupDto) => void;
  /** "Keep my request active": back to the preview, nothing sent. */
  onBack: () => void;
  /** Closes the confirmation and the preview: back to browsing, the request unchanged. */
  onKeepLooking: () => void;
  /** Reads nearby activity again and closes (design 55). */
  onRefreshNearby: () => void;
};

/** What reading the rider's request found after an unknown outcome (design 30). */
type Checked = 'not-yet' | 'checking' | 'not-joined';

/**
 * The join confirmation in home's sheet (designs 12, 29, 30 and 55), opened from a ride or group
 * preview once the rider has an active request.
 *
 * - **Revalidation:** opening it reads the target again; "Join" waits for that answer, and a group
 *   that has meanwhile filled up or become ready shows the conflict instead (29). The source checks
 *   everything once more when the join arrives.
 * - **Confirm (12):** who the rider would travel with, the occupancy after joining, the departure
 *   and, for a solo rider, that they coordinate. The input and operation ID are fixed at the first
 *   press; a press while it runs does nothing.
 * - **No optimistic membership:** nothing changes on screen until the source answers. Success
 *   stores the canonical group and the grouped request, then hands over (`onJoined`).
 * - **Refusals:** a full or ready group (29), a gone target (55), a request that ended or is
 *   already grouped, a block. Each says nothing was reserved; the rider's own request stays as it
 *   was, including one created just before this join.
 * - **Unknown outcome (30):** "Check my request" reads the rider's request: if it is now grouped,
 *   the join happened and finishes from that group; otherwise it says so. "Retry this join"
 *   resends the same operation, so the source cannot join twice.
 *
 * Analytics: `group_join_clicked` once per operation, `group_joined` on the source's success.
 */
export function JoinPanel({
  target,
  preview,
  ownRequest,
  now,
  onJoined,
  onBack,
  onKeepLooking,
  onRefreshNearby,
}: JoinPanelProps) {
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
  const viewer = useViewer();
  const rider = viewer.kind === 'user' ? viewer : null;

  // Revalidate once, when the confirmation opens.
  const revalidate = useRef(preview.retry);
  useEffect(() => {
    revalidate.current();
  }, []);

  // Fixed at the first press: a retry resends exactly this, under the same operation ID.
  const [sent, setSent] = useState<JoinGroupInput | null>(null);
  const [checked, setChecked] = useState<Checked>('not-yet');

  /** The source joined the rider: keep its canonical answer, record it once, hand over. */
  function finish(group: RideGroupDto, request: OwnRideRequestDto) {
    if (rider !== null) {
      queryClient.setQueryData(queryKeys.ownRequest(rider), request);
      queryClient.setQueryData(queryKeys.groupDetail(rider, group.id), group);
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser(rider) });
    }
    analytics.track('group_joined', {
      kind: target.kind,
      memberCount: Math.min(Math.max(group.members.length, GROUP_POLICY.minMembers), GROUP_POLICY.capacity),
    });
    onJoined(group);
  }

  const join = useMutation<{ group: RideGroupDto; rideRequest: OwnRideRequestDto }, DataError, JoinGroupInput>({
    mutationFn: (input) => withDataErrors(dataSource.groups.join(input)),
    onSuccess: ({ group, rideRequest }) => finish(group, rideRequest),
    onError: (error) => {
      const failure = describeJoinError(error);
      // Show the target and the request as they are now.
      if (failure !== 'unknown' && failure !== 'sign-in') preview.retry();
      if ((failure === 'grouped' || failure === 'request-ended') && rider !== null) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.ownRequest(rider) });
      }
    },
  });

  const checkCurrent = async () => {
    if (rider === null || sent === null) return;
    setChecked('checking');
    try {
      const request = await queryClient.fetchQuery({ ...ownRequestQuery(dataSource, rider), staleTime: 0 });
      if (request?.id === sent.rideRequestId && request.status === 'grouped' && request.groupId !== null) {
        const group = await queryClient.fetchQuery({
          ...groupDetailQuery(dataSource, rider, request.groupId),
          staleTime: 0,
        });
        finish(group, request);
        return;
      }
      setChecked('not-joined');
    } catch {
      // Still no answer: the rider can check again or retry the same join.
      setChecked('not-yet');
    }
  };

  const failure = join.error === null ? null : describeJoinError(join.error);

  if (failure === 'unknown') {
    return (
      <View style={styles.panel}>
        <View style={styles.heading}>
          <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
            We’re checking what happened.
          </AppText>
          <AppText color="muted">The response was interrupted. You may already have joined.</AppText>
        </View>
        <Notice
          message={
            checked === 'not-joined'
              ? 'You haven’t joined: your request is not in a group, and no seat is held. You can retry now.'
              : 'Check your request before trying again. Retrying will not join twice.'
          }
        />
        <Button
          label="Check my request"
          busy={checked === 'checking'}
          disabled={join.isPending}
          onPress={() => void checkCurrent()}
        />
        <Button
          label="Retry this join"
          variant="secondary"
          busy={join.isPending}
          disabled={checked === 'checking'}
          onPress={() => {
            if (sent === null || join.isPending) return;
            setChecked('not-yet');
            join.mutate(sent);
          }}
        />
      </View>
    );
  }

  if (failure !== null) {
    return (
      <Refusal
        failure={failure}
        preview={preview}
        onKeepLooking={onKeepLooking}
        onRefreshNearby={onRefreshNearby}
        onBack={onBack}
      />
    );
  }
  if (preview.kind === 'gone') {
    return (
      <Refusal
        failure="gone"
        preview={preview}
        onKeepLooking={onKeepLooking}
        onRefreshNearby={onRefreshNearby}
        onBack={onBack}
      />
    );
  }
  if (ownRequest?.status !== 'active' && !join.isPending) {
    return (
      <Refusal
        failure={ownRequest?.status === 'grouped' ? 'grouped' : 'request-ended'}
        preview={preview}
        onKeepLooking={onKeepLooking}
        onRefreshNearby={onRefreshNearby}
        onBack={onBack}
      />
    );
  }

  const confirmed = preview.kind === 'available' && !preview.fetching ? preview.item : null;
  if (confirmed?.kind === 'group' && !describeGroupAvailability(confirmed).joinable) {
    return (
      <Refusal
        failure={confirmed.status === 'ready' ? 'closed' : 'full'}
        preview={preview}
        onKeepLooking={onKeepLooking}
        onRefreshNearby={onRefreshNearby}
        onBack={onBack}
      />
    );
  }

  const item = preview.item;
  const plan = item === null ? null : describeJoinPlan(item, now);
  const press = () => {
    if (join.isPending || confirmed === null || ownRequest === null) return;
    const input: JoinGroupInput = {
      operationId: createOperationId(),
      rideRequestId: ownRequest.id,
      target: { kind: target.kind, id: target.id },
    };
    setSent(input);
    analytics.track('group_join_clicked', { kind: target.kind });
    join.mutate(input);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          {plan?.headline ?? 'Join this plan.'}
        </AppText>
        {plan === null ? null : <AppText color="muted">{plan.summary}</AppText>}
      </View>
      {plan === null ? null : (
        <View style={styles.facts}>
          <Fact value={plan.occupancy} label={`Maximum ${GROUP_POLICY.capacity} · One seat per person`} />
          <Fact value={plan.departure} label="Departure" />
          {plan.coordinator === null ? null : <Fact value={plan.coordinator} label="Coordinator" />}
        </View>
      )}
      <Notice message="Your active request will become part of this group. Your shared meeting point and temporary chat unlock after joining." />
      {confirmed === null ? (
        <AppText color="muted" accessibilityLiveRegion="polite">
          {preview.kind === 'failed'
            ? 'This plan couldn’t be checked, so it can’t be joined right now.'
            : 'Checking it’s still available…'}
        </AppText>
      ) : null}
      {preview.kind === 'failed' ? <Button label="Try again" variant="secondary" onPress={preview.retry} /> : null}
      <Button label={plan?.action ?? 'Join'} busy={join.isPending} disabled={confirmed === null} onPress={press} />
      <Button label="Keep my request active" variant="ghost" disabled={join.isPending} onPress={onBack} />
    </View>
  );
}

/** A join that cannot happen, as the source now says: what changed, and that nothing was reserved. */
function Refusal({
  failure,
  preview,
  onKeepLooking,
  onRefreshNearby,
  onBack,
}: {
  failure: Exclude<JoinFailure, 'unknown'>;
  preview: PreviewState;
  onKeepLooking: () => void;
  onRefreshNearby: () => void;
  onBack: () => void;
}) {
  const latest = preview.kind === 'gone' ? null : preview.item;
  const occupancy = latest?.kind === 'group' ? `${latest.memberCount}/${latest.capacity} people` : null;
  const keep = <Button label="Keep looking" onPress={onKeepLooking} />;
  const review = <Button label="Review my active request" variant="secondary" onPress={onKeepLooking} />;
  const kept = 'Your own request is still active.';

  const view: { badge?: string; title: string; body: string; note: string; actions: React.ReactNode } = (() => {
    switch (failure) {
      case 'full':
        return {
          badge: 'Group is now full',
          title: 'That seat was just taken.',
          body: occupancy === null ? `The group is full. ${kept}` : `The latest group has ${occupancy}. ${kept}`,
          note: 'No seat was reserved. If your request was created before this join failed, it stays on the map.',
          actions: (
            <>
              {keep}
              {review}
            </>
          ),
        };
      case 'closed':
        return {
          badge: 'Group is getting ready',
          title: 'This group stopped taking riders.',
          body: `Its coordinator marked it ready to leave. ${kept}`,
          note: 'No seat was reserved. If your request was created before this join failed, it stays on the map.',
          actions: (
            <>
              {keep}
              {review}
            </>
          ),
        };
      case 'gone':
        return {
          title: 'That plan has changed.',
          body: 'The selected plan expired, closed or was removed before you could join.',
          note: 'The stale join action is no longer available, and nothing was reserved. Your own active request, if created, stays active.',
          actions: <Button label="Refresh nearby plans" onPress={onRefreshNearby} />,
        };
      case 'blocked':
        return {
          title: 'You can’t join this plan.',
          body: 'You blocked someone in it.',
          note: `Nothing was reserved. ${kept}`,
          actions: keep,
        };
      case 'grouped':
        return {
          title: 'You’re already in a group.',
          body: 'One request can be in one group at a time, so this join wasn’t sent or wasn’t accepted.',
          note: 'Nothing new was reserved.',
          actions: <Button label="Review my request" onPress={onKeepLooking} />,
        };
      case 'request-ended':
        return {
          title: 'Your request has ended.',
          body: 'Joining needs an active request, and yours expired or was cancelled.',
          note: 'Nothing was joined, and no seat is held.',
          actions: <Button label="Review my request" onPress={onKeepLooking} />,
        };
      case 'sign-in':
        return {
          title: 'Your session ended.',
          body: 'Sign in again to join.',
          note: 'Nothing was joined, and no seat is held.',
          actions: <Button label="Back to preview" variant="secondary" onPress={onBack} />,
        };
      case 'refused':
        return {
          title: 'This join couldn’t be completed.',
          body: 'The service refused it.',
          note: `Nothing was reserved. ${kept}`,
          actions: <Button label="Back to preview" variant="secondary" onPress={onBack} />,
        };
    }
  })();

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        {view.badge === undefined ? null : <Badge label={view.badge} tone="warning" />}
        <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
          {view.title}
        </AppText>
        <AppText color="muted">{view.body}</AppText>
      </View>
      <Notice message={view.note} />
      {view.actions}
    </View>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <AppText variant="label">{value}</AppText>
      <AppText variant="small" color="muted">
        {label}
      </AppText>
    </View>
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
  facts: {
    gap: spacing.sm,
  },
  fact: {
    gap: spacing.xs,
  },
});
