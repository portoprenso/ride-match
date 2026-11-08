import type { GroupMemberDto } from '@ride-match/contracts';
import { StyleSheet, View } from 'react-native';

import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { SheetContent } from '../../ui/SheetHost';
import { spacing } from '../../ui/tokens';

/**
 * Another member's actions, as the content of a sheet, from the group screen's member list and
 * the chat's messages. Titled with that member, so a later report or block (SAFETY-001) can
 * never fall on the wrong person; both are disabled until then and nothing is sent.
 */
export function MemberMenu({ member, onClose }: { member: GroupMemberDto; onClose: () => void }) {
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
      <Button label={`Report ${name}`} variant="secondary" disabled onPress={() => undefined} />
      <Button label={`Block ${name}`} variant="secondary" disabled onPress={() => undefined} />
      <Notice message="Reporting and blocking aren’t available in this demo build yet. Nothing was sent." />
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
});
