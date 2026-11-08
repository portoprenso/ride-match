import { PLACE_SEARCH_POLICY, type PlaceDto } from '@ride-match/contracts';
import { useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { ConfirmAction } from '../../ui/ConfirmAction';
import { Notice } from '../../ui/Notice';
import { SheetContent, SheetHost } from '../../ui/SheetHost';
import { SearchField } from '../../ui/TextField';
import { spacing } from '../../ui/tokens';
import { useLocationChoices } from './LocationChoicesProvider';
import { PlaceSearchResults } from './PlaceSearchResults';
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

/**
 * The pickup search and confirmation without its own sheet, for a flow that already has one
 * (the request draft, RIDE-001-B), so one modal never has to open as another closes.
 */
export function PickupPlaceFlow({ onClose, onConfirmed }: { onClose: () => void; onConfirmed?: () => void }) {
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
      <PlaceSearchResults search={search} text={text} onChoose={setChosen} />
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
  },
});
