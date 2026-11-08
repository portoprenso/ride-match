import type { MeetingPointDto } from '@ride-match/contracts';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { isMapProviderConfigured } from '../../config/isMapProviderConfigured';
import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { SheetContent } from '../../ui/SheetHost';
import { colors, radii, spacing } from '../../ui/tokens';

/** The map's span around the point: a few streets each way, enough to recognize the place. */
const POINT_SPAN_DEGREES = 0.006;

/** "About 4 min on foot", or `null` when the source supplied no estimate. */
export function describeWalk(point: Pick<MeetingPointDto, 'walkingMinutes'>): string | null {
  if (point.walkingMinutes === null) return null;
  return point.walkingMinutes <= 1 ? 'About 1 min on foot' : `About ${point.walkingMinutes} min on foot`;
}

type MeetingPointSheetProps = {
  /** The group's current point, or `null` once the source withdrew it. */
  point: MeetingPointDto | null;
  /** The point the sheet opened on; a different current ID means the source replaced it meanwhile. */
  openedId: string;
  onOpenChat: () => void;
  onReturn: () => void;
};

/**
 * The member-only meeting point (design 15), as the content of the group screen's sheet: a small
 * native map centred on the point with its landmark marker, the place's name, the viewer's own
 * walking estimate as the source supplied it (never computed here, and never a route), and a
 * reminder to confirm the spot in chat.
 *
 * Viewing it changes nothing: "Return to group" only closes the sheet, and readiness changes only
 * through the coordinator's own action. If the source replaces the point while the sheet is open,
 * it shows the new one and says so; if it withdraws it, the sheet says that instead. Opening it
 * records `meeting_point_viewed` once per opening.
 *
 * In a build without a map provider, the place and estimate show without the map.
 */
export function MeetingPointSheet({ point, openedId, onOpenChat, onReturn }: MeetingPointSheetProps) {
  const analytics = useAnalytics();
  useEffect(() => {
    analytics.track('meeting_point_viewed');
  }, [analytics]);

  const footer = (
    <ActionFooter>
      <Button label="Open group chat" variant="secondary" onPress={onOpenChat} />
      <Button label="Return to group" variant="ghost" onPress={onReturn} />
    </ActionFooter>
  );

  if (point === null) {
    return (
      <SheetContent footer={footer}>
        <View style={styles.heading}>
          <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
            The meeting point was withdrawn.
          </AppText>
          <AppText color="muted">A new suggested place will appear on the group screen when it’s ready.</AppText>
        </View>
      </SheetContent>
    );
  }

  const walk = describeWalk(point);
  const region = {
    latitude: point.coordinates.latitude,
    longitude: point.coordinates.longitude,
    latitudeDelta: POINT_SPAN_DEGREES,
    longitudeDelta: POINT_SPAN_DEGREES,
  };
  return (
    <SheetContent footer={footer}>
      {isMapProviderConfigured() ? (
        <View style={styles.mapFrame}>
          <MapView
            // A new point recentres the map.
            key={point.id}
            testID="meeting-point-map"
            style={StyleSheet.absoluteFill}
            initialRegion={region}
            pitchEnabled={false}
            rotateEnabled={false}
            toolbarEnabled={false}
          >
            <Marker
              coordinate={point.coordinates}
              accessibilityLabel={`Meeting point: ${point.label}`}
              title="Meet here"
            />
          </MapView>
        </View>
      ) : null}
      {point.id !== openedId ? (
        <View accessibilityLiveRegion="polite">
          <Notice tone="warning" message="The meeting point changed. This is the new suggested place." />
        </View>
      ) : null}
      <View style={styles.heading}>
        <Badge label="Members only" />
        <AppText variant="section" accessibilityRole="header">
          {point.label}
        </AppText>
        <AppText color="muted">A shared public place for your group.</AppText>
      </View>
      <View style={styles.walk}>
        <AppText variant="label">{walk ?? 'Walking time not available'}</AppText>
        <AppText variant="small" color="muted">
          Approximate demo estimate
        </AppText>
      </View>
      <Notice message="This is a meeting-point marker, not a walking route. Confirm the spot with your group in chat." />
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  mapFrame: {
    height: 200,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.soft,
  },
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  walk: {
    gap: spacing.xs,
  },
});
