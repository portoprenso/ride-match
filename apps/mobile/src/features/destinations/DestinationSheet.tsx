import { PLACE_SEARCH_POLICY, type PlaceDto } from '@ride-match/contracts';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { SheetContent, SheetHost } from '../../ui/SheetHost';
import { SearchField } from '../../ui/TextField';
import { spacing } from '../../ui/tokens';
import { PlaceSearchResults } from '../location/PlaceSearchResults';
import { usePlaceSearch } from '../location/usePlaceSearch';

type DestinationSheetProps = {
  open: boolean;
  onClose: () => void;
  /** A place was chosen; the sheet closes after it. */
  onChoose: (place: PlaceDto) => void;
};

/**
 * Chooses where the rider is heading (design 03) from the curated places: no live places
 * service, no geocoder. Typing is debounced and each search is its own read, so an older
 * search's results can never replace a newer one's (`usePlaceSearch`). Choosing a row sets the
 * destination at once; it creates nothing and reserves nothing. The text resets each time the
 * sheet opens, and the map stays as it was underneath.
 */
export function DestinationSheet({ open, onClose, onChoose }: DestinationSheetProps) {
  return (
    <SheetHost open={open} onDismiss={onClose}>
      <DestinationSearch onClose={onClose} onChoose={onChoose} />
    </SheetHost>
  );
}

function DestinationSearch({ onClose, onChoose }: Omit<DestinationSheetProps, 'open'>) {
  const [text, setText] = useState('');
  const search = usePlaceSearch(text, true);
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
          Where to?
        </AppText>
        <AppText color="muted">Choose a place in Bishkek.</AppText>
      </View>
      <SearchField
        label="Destination"
        value={text}
        onChangeText={setText}
        onClear={() => setText('')}
        maxLength={PLACE_SEARCH_POLICY.maxQueryLength}
      />
      <PlaceSearchResults
        search={search}
        text={text}
        onChoose={(place) => {
          onChoose(place);
          onClose();
        }}
      />
      <AppText variant="small" color="muted">
        Curated demo destinations. Search does not use a live places service.
      </AppText>
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
  },
});
