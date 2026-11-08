import type { ReportReason, ReportUserInput } from '@ride-match/contracts';

import type { DataError } from '../../data/errors';

/** The report form's reasons, in the contract's order, with the words the form shows (design 41). */
export const REPORT_REASONS: readonly { reason: ReportReason; label: string }[] = [
  { reason: 'unsafe_behavior', label: 'Unsafe behaviour' },
  { reason: 'harassment', label: 'Harassment' },
  { reason: 'spam_or_misleading', label: 'Spam or misleading information' },
  { reason: 'other', label: 'Something else' },
];

export function reasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((entry) => entry.reason === reason)?.label ?? reason;
}

/**
 * The details to send from what the reporter typed, or `undefined` when nothing is left (the
 * field is optional and omitted, never sent empty). Line endings become `\n`, other control
 * characters spaces, and surrounding whitespace is trimmed, as the contract's text rules require.
 */
export function toReportDetails(typed: string): string | undefined {
  const details = typed
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .trim();
  return details === '' ? undefined : details;
}

/** A report's content without its operation ID, to tell a true retry from an edited report. */
export type ReportContent = Omit<ReportUserInput, 'operationId'>;

/** Whether two reports say the same thing, so a retry may reuse the earlier operation ID. */
export function sameReport(one: ReportContent, other: ReportContent): boolean {
  return (
    one.targetUserId === other.targetUserId &&
    one.reason === other.reason &&
    one.details === other.details &&
    one.context?.groupId === other.context?.groupId &&
    one.context?.messageId === other.context?.messageId
  );
}

/**
 * What a failed submission means for the reporter:
 *
 * - `unknown`: no answer, or the service was busy (design 52). The report may have been accepted,
 *   so no receipt is shown and nothing claims either way; "Retry report" resends the same
 *   operation ID, which returns the receipt if the first attempt was accepted.
 * - `rejected`: the source refused it, so no report exists. The form stays, with the reason why;
 *   the next submission is a new report with a new operation ID.
 */
export type ReportFailure = { kind: 'unknown' | 'rejected'; message: string };

export function describeReportError(error: DataError): ReportFailure {
  switch (error.code) {
    case 'VALIDATION_FAILED':
    case 'IDEMPOTENCY_CONFLICT':
      return { kind: 'rejected', message: 'This report can’t be sent. Check the details and try again.' };
    case 'NOT_FOUND':
      return { kind: 'rejected', message: 'This rider can no longer be reported.' };
    case 'MEMBERSHIP_REQUIRED':
    case 'HISTORY_EXPIRED':
      return { kind: 'rejected', message: 'You no longer have access to this group, so this report wasn’t sent.' };
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return { kind: 'rejected', message: 'Your session ended. Sign in again to send this report.' };
    default:
      return { kind: 'unknown', message: 'Your report didn’t go through.' };
  }
}
