import { PLACE_SEARCH_POLICY, type PlaceDto } from '@ride-match/contracts';
import { useState, type RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { ConfirmAction } from '../../ui/ConfirmAction';
import { Notice } from '../../ui/Notice';
import { SheetContent, SheetHost } from '../../ui/SheetHost';
import { SearchField } from '../../ui/TextField';
import { colors, radii, spacing } from '../../ui/tokens';
import { useLocationChoices } from './LocationChoicesProvider';
import { usePlaceSearch } from './usePlaceSearch';

type PickupPlaceSheetProps = {
  open: boolean;
  /** Called on Cancel, a dismissal, or after the pickup is confirmed. */
  onClose: () => void;
  /** Called after the pickup is confirmed, before `onClose`. */
  onConfirmed?: () => void;
  /** The control that opened the sheet; screen-reader focus returns to it. */
  returnFocusRef?: RefObject<View | null>;
};

/**
 * Chooses a pickup point by name, without the device position: the named alternative to
 * dragging the map (MAP-001-B). The user searches the curated places, picks one, and confirms
 * it explicitly; only then does it become the pickup in `useLocationChoices()`. The choice and
 * the search text reset each time the sheet opens.
 */
export function PickupPlaceSheet({ open, onClose, onConfirmed, returnFocusRef }: PickupPlaceSheetProps) {
  return (
    <SheetHost open={open} onDismiss={onClose} returnFocusRef={returnFocusRef}>
      <PickupPlaceFlow onClose={onClose} onConfirmed={onConfirmed} />
    </SheetHost>
  );
}

function PickupPlaceFlow({ onClose, onConfirmed }: { onClose: () => void; onConfirmed?: () => void }) {
  const { confirmPickup } = useLocationChoices();
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<PlaceDto | null>(null);
  const search = usePlaceSearch(text, true);

  if (chosen !== null) {
    return (
      <ConfirmAction
        title="Is this your pickup point?"
        message={`Near ${chosen.label}${chosen.detail ? ` (${chosen.detail})` : ''}.`}
        confirmLabel="Confirm this pickup"
        cancelLabel="Choose another place"
        onConfirm={() => {
          confirmPickup(chosen);
          onConfirmed?.();
          onClose();
        }}
        onCancel={() => setChosen(null)}
      >
        <Notice message="Public discovery shows only an approximate area around it." />
        <Notice message="This point stays fixed after you publish your request." />
      </ConfirmAction>
    );
  }

  const places = search.data;
  return (
    <SheetContent
      footer={
        <ActionFooter>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          Choose a pickup point
        </AppText>
        <AppText color="muted">
          Pick a named place near where you will be. We won&apos;t treat it as your current location.
        </AppText>
      </View>
      <SearchField
        label="Search places"
        value={text}
        onChangeText={setText}
        onClear={() => setText('')}
        maxLength={PLACE_SEARCH_POLICY.maxQueryLength}
      />
      {places === undefined ? (
        search.isError ? (
          <View style={styles.list}>
            <Notice tone="danger" message="Places didn't load. Check the connection and try again." />
            <Button label="Try again" variant="secondary" onPress={() => void search.refetch()} />
          </View>
        ) : (
          <AppText color="muted" accessibilityLiveRegion="polite">
            Loading places…
          </AppText>
        )
      ) : places.length === 0 ? (
        <Notice
          message={
            text.trim() === '' ? 'There are no places to choose in this area.' : 'No places match. Try another name.'
          }
        />
      ) : (
        <View style={styles.list} accessibilityRole="list">
          {search.isError ? (
            <Notice tone="danger" message="The newest results didn't load. These are the previous ones." />
          ) : null}
          {places.map((place) => (
            <PlaceRow key={place.id} place={place} onPress={() => setChosen(place)} />
          ))}
        </View>
      )}
    </SheetContent>
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
  heading: {
    gap: spacing.sm,
  },
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
