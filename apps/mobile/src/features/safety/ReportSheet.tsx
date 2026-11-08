import { SAFETY_POLICY, type ReportReason, type ReportReceiptDto, type ReportUserInput } from '@ride-match/contracts';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { useDataSource } from '../../data/DataSourceProvider';
import { withDataErrors, type DataError } from '../../data/errors';
import { createOperationId } from '../../data/operationId';
import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { SheetContent } from '../../ui/SheetHost';
import { TextField } from '../../ui/TextField';
import { colors, radii, spacing } from '../../ui/tokens';
import {
  describeReportError,
  reasonLabel,
  REPORT_REASONS,
  sameReport,
  toReportDetails,
  type ReportContent,
} from './reportFlow';

type ReportSheetProps = {
  /** The rider being reported, named throughout so the report can't fall on someone else. */
  target: { id: string; displayName: string };
  /** Where the reporter met them: the group, and the message being reported or `null`. */
  context: { groupId: string; messageId: string | null } | null;
  /** Tells the host sheet whether a submission is on its way, so it isn't dismissed mid-send. */
  onPendingChange: (pending: boolean) => void;
  /** Closes the sheet: after the receipt, or when the reporter cancels. */
  onClose: () => void;
};

/**
 * Reporting a rider (designs 41, 42, 52), as the content of a screen's sheet.
 *
 * - **Form (41):** one of four reasons, optional details (up to
 *   `SAFETY_POLICY.maxReportDetailsLength` characters, with a reminder not to include phone
 *   numbers or private addresses), and "Submit demo report", enabled once a reason is chosen.
 * - **Accepted (42):** only after the source's receipt: its ID, and that it confirms mock
 *   acceptance only, never a moderation decision. `user_reported` is recorded with the reason
 *   alone; the details never reach analytics or logs.
 * - **Not submitted (52):** no answer, or the service was busy. No receipt, the reason and draft
 *   stay, and "Retry report" resends the same operation ID, so a report accepted before its
 *   answer was lost is never filed twice. "Edit report" returns to the form; sending edited
 *   content is a new report with a new ID.
 * - **Refused:** the source rejected it, so no report exists; the form says why and keeps the draft.
 *
 * Reporting does not block anyone.
 */
export function ReportSheet({ target, context, onPendingChange, onClose }: ReportSheetProps) {
  const dataSource = useDataSource();
  const analytics = useAnalytics();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [typed, setTyped] = useState('');
  const [view, setView] = useState<'form' | 'failed'>('form');
  const [refusal, setRefusal] = useState<string | null>(null);
  // The last submission whose outcome is unknown: its ID is reused for the same content.
  const [uncertain, setUncertain] = useState<ReportUserInput | null>(null);

  const submit = useMutation<ReportReceiptDto, DataError, ReportUserInput>({
    mutationFn: (input) => withDataErrors(dataSource.safety.report(input)),
    onSuccess: (_receipt, input) => {
      setUncertain(null);
      analytics.track('user_reported', { reason: input.reason });
    },
    onError: (error, input) => {
      const failure = describeReportError(error);
      if (failure.kind === 'unknown') {
        setUncertain(input);
        setView('failed');
      } else {
        setUncertain(null);
        setRefusal(failure.message);
        setView('form');
      }
    },
  });
  const pending = submit.isPending;
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  // Leaving the sheet, however it closes, never keeps the host from closing later sheets.
  useEffect(() => () => onPendingChange(false), [onPendingChange]);

  const content = (chosen: ReportReason): ReportContent => {
    const details = toReportDetails(typed);
    return {
      targetUserId: target.id,
      reason: chosen,
      ...(details === undefined ? {} : { details }),
      ...(context === null ? {} : { context }),
    };
  };
  const send = () => {
    if (reason === null || pending) return;
    const next = content(reason);
    const operationId = uncertain !== null && sameReport(uncertain, next) ? uncertain.operationId : createOperationId();
    setRefusal(null);
    submit.mutate({ operationId, ...next });
  };

  const name = target.displayName;

  if (submit.isSuccess) {
    return (
      <SheetContent
        footer={
          <ActionFooter>
            <Button label="Done" onPress={onClose} />
          </ActionFooter>
        }
      >
        <View style={styles.heading} accessibilityLiveRegion="polite">
          <AppText variant="section" accessibilityRole="header">
            Your demo report was received.
          </AppText>
          <AppText color="muted">Demo receipt: {submit.data.id}</AppText>
        </View>
        <Notice message="This confirms mock acceptance only. It does not mean a moderation decision was made." />
      </SheetContent>
    );
  }

  if (view === 'failed' && reason !== null) {
    return (
      <SheetContent
        footer={
          <ActionFooter>
            <Button label="Retry report" busy={pending} onPress={send} />
            <Button label="Edit report" variant="secondary" disabled={pending} onPress={() => setView('form')} />
          </ActionFooter>
        }
      >
        <View style={styles.heading}>
          <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="assertive">
            Your report didn’t go through.
          </AppText>
          <AppText color="muted">No receipt was issued. Your selected reason and draft details are still here.</AppText>
        </View>
        <View style={styles.summary}>
          <AppText variant="label">{reasonLabel(reason)}</AppText>
          <AppText variant="small" color="muted">
            Selected reason
          </AppText>
        </View>
        <Notice message="Retry when the connection is available. A failed submission does not mean a report was accepted." />
      </SheetContent>
    );
  }

  return (
    <SheetContent
      footer={
        <ActionFooter>
          <Button label="Submit demo report" disabled={reason === null} busy={pending} onPress={send} />
          <Button label="Cancel" variant="ghost" disabled={pending} onPress={onClose} />
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          Tell us what happened.
        </AppText>
        <AppText color="muted">
          {context?.messageId ? `Reporting ${name} · About their message.` : `Reporting ${name}.`} Choose a reason.
        </AppText>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Reason" style={styles.reasons}>
        {REPORT_REASONS.map((entry) => {
          const checked = entry.reason === reason;
          return (
            <Pressable
              key={entry.reason}
              accessibilityRole="radio"
              accessibilityLabel={entry.label}
              accessibilityState={{ checked, disabled: pending }}
              disabled={pending}
              onPress={() => setReason(entry.reason)}
              style={({ pressed }) => [styles.reason, checked && styles.checked, pressed && styles.pressed]}
            >
              <View style={[styles.dot, checked && styles.dotChecked]} />
              <AppText style={styles.reasonText}>{entry.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      <TextField
        label="Details · optional"
        value={typed}
        onChangeText={setTyped}
        placeholder="Add details…"
        multiline
        maxLength={SAFETY_POLICY.maxReportDetailsLength}
        disabled={pending}
        hint="Do not include phone numbers or private addresses."
      />
      {refusal === null ? null : (
        <AppText color="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {refusal}
        </AppText>
      )}
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  reasons: {
    gap: spacing.sm,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    padding: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  checked: {
    backgroundColor: colors.soft,
    borderColor: colors.teal,
  },
  pressed: {
    opacity: 0.8,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.teal,
  },
  dotChecked: {
    backgroundColor: colors.teal,
  },
  reasonText: {
    flexShrink: 1,
  },
  summary: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.soft,
  },
});
