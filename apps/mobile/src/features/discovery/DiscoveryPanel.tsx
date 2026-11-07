import type { NearbySnapshotDto } from '@ride-match/contracts';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { colors, radii, spacing } from '../../ui/tokens';
import type { DiscoveryState } from './useNearbyDiscovery';

/** Such as "9:38", in the device's own time format. */
export function formatUpdatedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * How many ride plans a snapshot holds, in words. A truncated snapshot is never presented as a
 * complete count. Rides and groups are counted as discovery items, not people.
 */
export function describeActivity(snapshot: NearbySnapshotDto): string {
  const rides = snapshot.items.filter((item) => item.kind === 'ride').length;
  const groups = snapshot.items.length - rides;
  const parts = [
    rides > 0 ? `${rides} ${rides === 1 ? 'rider' : 'riders'}` : null,
    groups > 0 ? `${groups} ${groups === 1 ? 'group' : 'groups'}` : null,
  ].filter((part) => part !== null);
  const total = snapshot.items.length;
  if (snapshot.truncated) return `At least ${total} ride plans in this view. Zoom in to see a smaller area.`;
  return `${total} ${total === 1 ? 'ride plan' : 'ride plans'} in this view: ${parts.join(' and ')}.`;
}

type DiscoveryPanelProps = {
  state: DiscoveryState;
  /** Reads the current view again. */
  onRetry: () => void;
};

/**
 * Home's nearby-activity section of the sheet: loading (54), activity (02), empty (23), a first
 * read that failed (24) and a last view that can no longer be refreshed (25), plus a view too
 * wide to read and a first read waiting for the connection.
 *
 * Every state says only what is known: loading is not empty, a failure is not "nobody nearby",
 * and a stale snapshot says when it was last true and that nothing will be queued. Markers for
 * the items arrive with MAP-002-B, so this section does not claim they are on the map.
 */
export function DiscoveryPanel({ state, onRetry }: DiscoveryPanelProps) {
  switch (state.kind) {
    case 'too-wide':
      return <Section title="Zoom in to see ride plans." message="Discovery covers a smaller area than this view." />;
    case 'loading':
      return (
        <Section title="Finding nearby plans…" message="Loading activity for this area." live>
          <View style={styles.skeleton} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[0.9, 0.7, 0.8].map((share) => (
              <View key={share} style={[styles.bar, { width: `${share * 100}%` }]} />
            ))}
          </View>
          <Small>A loading view does not mean the area is empty.</Small>
        </Section>
      );
    case 'offline':
      return (
        <Section
          badge={{ label: 'Offline', tone: 'warning' }}
          title="Waiting for a connection."
          message="Nearby activity loads once you’re back online. We don’t know yet whether anyone is nearby."
          live
        />
      );
    case 'failed':
      return state.unsupported ? (
        <Section
          badge={{ label: 'Outside the demo area', tone: 'warning' }}
          title="No ride plans out here."
          message="This view is outside the area the demo covers. Move the map back to the city."
          live
        />
      ) : (
        <Section
          badge={{ label: 'Couldn’t load ride plans', tone: 'warning' }}
          title="Let’s try that again."
          message="Nearby activity didn’t load. We don’t know whether anyone is nearby."
          live
        >
          <Button label="Retry discovery" onPress={onRetry} />
          <Small>Your map position stays as you left it.</Small>
        </Section>
      );
    case 'active':
      return (
        <Section title="Going the same way?" message={describeActivity(state.snapshot)}>
          <Small>{state.updating ? 'Updating for this area…' : 'Ride plans aren’t drawn on the map yet.'}</Small>
        </Section>
      );
    case 'empty':
      return (
        <Section title="You could be the first." message="There are no active ride plans in this area right now.">
          <Small>{state.updating ? 'Updating for this area…' : 'Move the map to explore another area.'}</Small>
        </Section>
      );
    case 'stale':
      return (
        <Section
          badge={{
            label: `${state.offline ? 'Offline' : 'Couldn’t refresh'} · last updated ${formatUpdatedAt(state.updatedAt)}`,
            tone: 'warning',
          }}
          title="Showing the last view."
          message={`${describeActivity(state.snapshot)} These ride plans may have changed.`}
          live
        >
          {state.offline ? (
            <Small>It refreshes by itself once the connection is back.</Small>
          ) : (
            <Button label="Try again" variant="secondary" onPress={onRetry} />
          )}
          <Small>Actions won’t be queued for later.</Small>
        </Section>
      );
  }
}

type SectionProps = {
  badge?: { label: string; tone: 'warning' };
  title: string;
  message: string;
  /** Announce changes to the message, for states that replace one another while the user waits. */
  live?: boolean;
  children?: ReactNode;
};

function Section({ badge, title, message, live = false, children }: SectionProps) {
  return (
    <View style={styles.section}>
      {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
      <AppText variant="section" accessibilityRole="header">
        {title}
      </AppText>
      <AppText color="muted" accessibilityLiveRegion={live ? 'polite' : 'none'}>
        {message}
      </AppText>
      {children}
    </View>
  );
}

function Small({ children }: { children: string }) {
  return (
    <AppText variant="small" color="muted">
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  skeleton: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  bar: {
    height: 20,
    borderRadius: radii.sm / 2,
    backgroundColor: colors.soft,
  },
});
