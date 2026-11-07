import type { PlaceDto } from '@ride-match/contracts';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { colors, radii, spacing } from '../../ui/tokens';
import type { usePlaceSearch } from './usePlaceSearch';

type PlaceSearchResultsProps = {
  search: ReturnType<typeof usePlaceSearch>;
  /** What the user typed, to tell "no places here" from "nothing matches". */
  text: string;
  onChoose: (place: PlaceDto) => void;
};

/**
 * The curated places a search found, as accessible rows, with its honest states: loading, a
 * failure with a retry, no places, no match, and older results kept on screen when the newest
 * read failed. Shared by the pickup (MAP-001-B) and destination (DESTINATION-001-B) sheets.
 */
export function PlaceSearchResults({ search, text, onChoose }: PlaceSearchResultsProps) {
  const places = search.data;
  if (places === undefined) {
    return search.isError ? (
      <View style={styles.list}>
        <Notice tone="danger" message="Places didn't load. Check the connection and try again." />
        <Button label="Try again" variant="secondary" onPress={() => void search.refetch()} />
      </View>
    ) : (
      <AppText color="muted" accessibilityLiveRegion="polite">
        Loading places…
      </AppText>
    );
  }
  if (places.length === 0) {
    return (
      <Notice
        message={
          text.trim() === '' ? 'There are no places to choose in this area.' : 'No places match. Try another name.'
        }
      />
    );
  }
  return (
    <View style={styles.list} accessibilityRole="list">
      {search.isError ? (
        <Notice tone="danger" message="The newest results didn't load. These are the previous ones." />
      ) : null}
      {places.map((place) => (
        <PlaceRow key={place.id} place={place} onPress={() => onChoose(place)} />
      ))}
    </View>
  );
}

function PlaceRow({ place, onPress }: { place: PlaceDto; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={place.detail ? `${place.label}, ${place.detail}` : place.label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <AppText variant="label">{place.label}</AppText>
      {place.detail ? (
        <AppText variant="small" color="muted">
          {place.detail}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    minHeight: 48,
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.soft,
  },
  pressed: {
    opacity: 0.7,
  },
});
