import type { OwnRideRequestDto } from '@ride-match/contracts';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { spacing } from '../../ui/tokens';
import { departureText } from '../discovery/nearbyItems';
import { useClock } from '../discovery/useClock';
import { describeOwnRequest, formatCountdown } from './useOwnRequest';

type RequestCardProps = {
  /** The rider's current or latest request, from the source. */
  request: OwnRideRequestDto | null;
  /** An expired request whose outcome the rider dismissed; it shows nothing. */
  dismissedId: string | null;
  onCancel: () => void;
  /** The device saw the deadline pass: read the request again for the source's answer. */
  onDeadline: () => void;
  /** Opens a new draft to the same destination; nothing is created until the rider publishes it. */
  onCreateAgain: (request: OwnRideRequestDto) => void;
  /** Hides an expired request's outcome until another request ends. */
  onDismiss: (request: OwnRideRequestDto) => void;
};

/**
 * Home's card for the rider's own request (screens 10 and 27), from the source's status:
 *
 * - Searching: where it heads, when it leaves, the time left in the search window (device
 *   countdown, presentation only) and "Cancel request".
 * - Ending: the device saw the deadline pass; no action is offered while the source's answer
 *   is read, so a cancel never races an expiry.
 * - Grouped: it joined a group (group screens arrive with GROUP-002).
 * - Expired: "Your request expired." and an explicit "Review a new request"; nothing is
 *   re-created automatically. `ride_request_expired` is recorded once per request.
 */
export function RequestCard(props: RequestCardProps) {
  // No clock runs without a request to show.
  const { request } = props;
  if (request === null || request.status === 'cancelled' || request.status === 'completed') return null;
  return <RequestCardContent {...props} />;
}

function RequestCardContent({
  request: latest,
  dismissedId,
  onCancel,
  onDeadline,
  onCreateAgain,
  onDismiss,
}: RequestCardProps) {
  const analytics = useAnalytics();
  // Its own one-second clock, so the countdown does not re-render the whole map.
  const now = useClock(1000);
  const described = describeOwnRequest(latest, now);
  const state =
    described.kind === 'expired' && described.request.id === dismissedId ? { kind: 'none' as const } : described;
  const expiredId = described.kind === 'expired' ? described.request.id : null;
  useEffect(() => {
    if (expiredId !== null) analytics.trackOnce(`ride_request_expired:${expiredId}`, 'ride_request_expired');
  }, [analytics, expiredId]);
  // Once per request whose deadline the device saw pass while the source still said active.
  const endingId = state.kind === 'ending' ? state.request.id : null;
  const askAgain = useRef(onDeadline);
  useEffect(() => {
    askAgain.current = onDeadline;
  });
  useEffect(() => {
    if (endingId !== null) askAgain.current();
  }, [endingId]);

  if (state.kind === 'none') return null;
  const { request } = state;
  const destination = (
    <AppText variant="section" accessibilityRole="header">
      {request.destination.label}
    </AppText>
  );

  switch (state.kind) {
    case 'searching':
      return (
        <View style={styles.card}>
          <Badge label={`Searching · ${formatCountdown(state.secondsLeft)} left`} tone="success" />
          {destination}
          <AppText variant="label">You · {departureText(request.departureAt, now).toLowerCase()}</AppText>
          <AppText color="muted">
            Let’s find your people. Compatible plans stand out on the map; you can keep exploring while you wait.
          </AppText>
          <Button label="Cancel request" variant="secondary" onPress={onCancel} />
        </View>
      );
    case 'ending':
      return (
        <View style={styles.card}>
          <Badge label="Search window ending" tone="warning" />
          {destination}
          <AppText color="muted" accessibilityLiveRegion="polite">
            Checking your request…
          </AppText>
        </View>
      );
    case 'grouped':
      return (
        <View style={styles.card}>
          <Badge label="In a group" tone="success" />
          {destination}
          <AppText color="muted">Your request joined a group. Leaving the group is how it ends.</AppText>
        </View>
      );
    case 'expired':
      return (
        <View style={styles.card}>
          <Badge label="Search window ended" />
          <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
            Your request expired.
          </AppText>
          <AppText color="muted">
            Your 15-minute search for {request.destination.label} has ended. Nothing new has been posted.
          </AppText>
          <Button label="Review a new request" onPress={() => onCreateAgain(request)} />
          <Button label="Keep browsing" variant="ghost" onPress={() => onDismiss(request)} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    alignItems: 'stretch',
  },
});
