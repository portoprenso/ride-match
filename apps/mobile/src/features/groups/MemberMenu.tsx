import type { GroupMemberDto } from '@ride-match/contracts';
import { StyleSheet, View } from 'react-native';

import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { SheetContent } from '../../ui/SheetHost';
import { spacing } from '../../ui/tokens';

/**
 * Another member's actions, as the content of a sheet, from the group screen's member list and
 * the chat's messages. Titled with that member, so a report or block can never fall on the wrong
 * person. "Report" opens the report form for them (SAFETY-001-B), and "Block" the block
 * confirmation (SAFETY-001-C); nothing is sent from the menu itself.
 */
export function MemberMenu({
  member,
  onReport,
  onBlock,
  onClose,
}: {
  member: GroupMemberDto;
  onReport: () => void;
  onBlock: () => void;
  onClose: () => void;
}) {
  const name = member.user.displayName;
  return (
    <SheetContent
      footer={
        <ActionFooter>
          <Button label="Close" variant="ghost" onPress={onClose} />
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          {name}
        </AppText>
        <AppText color="muted">Actions for this member only.</AppText>
      </View>
      <Button label={`Report ${name}`} variant="secondary" onPress={onReport} />
      <Button label={`Block ${name}`} variant="secondary" onPress={onBlock} />
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
});
