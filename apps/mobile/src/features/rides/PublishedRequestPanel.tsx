import type { OwnRideRequestDto } from '@ride-match/contracts';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../ui/AppText';
import { spacing } from '../../ui/tokens';
import { formatUpdatedAt } from '../discovery/DiscoveryPanel';

/**
 * A minimal note at the top of home's sheet while the rider has a live request: where it heads,
 * when it leaves and until when others can find it, from the source's own times. RIDE-001-C
 * replaces it with the request card (countdown, cancel, expiry).
 */
export function PublishedRequestPanel({ request }: { request: OwnRideRequestDto }) {
  return (
    <View style={styles.panel}>
      <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
        Your request is published.
      </AppText>
      <AppText color="muted">
        {request.status === 'grouped'
          ? `Heading to ${request.destination.label}, with a group.`
          : `Heading to ${request.destination.label}, leaving at ${formatUpdatedAt(Date.parse(request.departureAt))}. Others nearby can find it until ${formatUpdatedAt(Date.parse(request.expiresAt))}.`}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
  },
});
