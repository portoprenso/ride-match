import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionFooter } from './ActionFooter';
import { AppText } from './AppText';
import { Button } from './Button';
import { useAnnouncement } from './FieldMessage';
import { Notice } from './Notice';
import { SheetContent } from './SheetHost';
import { spacing } from './tokens';

type ConfirmActionProps = {
  /** The question, such as "Leave this group?". Screen readers reach it first, as a heading. */
  title: string;
  /** What confirming does, in plain words, including anything that cannot be undone. */
  message: string;
  /** Names the action itself, such as "Leave group", never just "OK". */
  confirmLabel: string;
  /** Names the way back, such as "Stay with my group". */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** `danger` for actions that remove, leave or cancel something. Defaults to `primary`. */
  tone?: 'primary' | 'danger';
  /**
   * The confirmed operation is running: the confirm button shows progress and ignores
   * presses, and cancel is disabled. Also pass `dismissible={false}` to the `SheetHost`, so
   * the outcome cannot be hidden by closing the sheet.
   */
  busy?: boolean;
  /** Why the operation failed. It is shown above the actions and announced; both actions stay available. */
  error?: string;
  /** Extra context between the message and the actions, such as the affected ride. */
  children?: ReactNode;
};

/**
 * Confirmation step before a consequential action, shown as the content of a `SheetHost`.
 *
 * It only reports the user's choice. The flow runs the operation, sets `busy` meanwhile,
 * then closes the sheet on success or shows `error` so the user can retry or go back.
 */
export function ConfirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tone = 'primary',
  busy = false,
  error,
  children,
}: ConfirmActionProps) {
  useAnnouncement(error);

  return (
    <SheetContent
      footer={
        <ActionFooter>
          <Button label={confirmLabel} variant={tone} busy={busy} onPress={onConfirm} />
          <Button label={cancelLabel} variant="ghost" disabled={busy} onPress={onCancel} />
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          {title}
        </AppText>
        <AppText color="muted">{message}</AppText>
      </View>
      {children}
      {error ? <Notice tone="danger" message={error} /> : null}
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
  },
});
