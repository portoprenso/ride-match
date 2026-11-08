import type { OwnRideRequestDto } from '@ride-match/contracts';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker, type MapMarker } from 'react-native-maps';

import { AppText } from '../../ui/AppText';
import { Icon } from '../../ui/Icon';
import { colors, radii, spacing } from '../../ui/tokens';
import { departureText } from '../discovery/nearbyItems';

/**
 * The rider's own active request on their map (PRODUCT's "Own request": labelled "You", apart
 * from the location dot), at the pickup they published. That exact point is the owner's own data
 * and is drawn only on their device; others see the source's public area. Never counted as a
 * nearby item and never reported as a seen marker.
 */
export function OwnRequestMarker({ request, now }: { request: OwnRideRequestDto; now: number }) {
  const ref = useRef<MapMarker>(null);
  const label = `You · ${departureText(request.departureAt, now).toLowerCase()}`;
  // Android keeps a custom marker's first image; redraw when its words change.
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.redraw());
    return () => cancelAnimationFrame(frame);
  }, [label]);
  return (
    <Marker
      ref={ref}
      coordinate={request.origin.coordinates}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={4}
      accessibilityLabel={`Your request to ${request.destination.label}, ${departureText(request.departureAt, now)}`}
    >
      <View style={styles.pill}>
        <Icon name="arrow" color="white" size={16} />
        <AppText variant="small" color="white">
          {label}
        </AppText>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.teal,
  },
});
