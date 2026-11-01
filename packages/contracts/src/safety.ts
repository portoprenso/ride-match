import { z } from 'zod';

import { CursorSchema, IdSchema, OperationIdSchema, TimestampSchema, multilineTextSchema } from './common.js';
import { LeaveGroupResultSchema } from './groups.js';
import { UserSchema } from './users.js';

/**
 * Safety limits chosen for the mock MVP (CONTRACT-003-C). The schemas enforce them; revisit
 * them before a backend exists.
 */
export const SAFETY_POLICY = {
  /** Longest report details, in UTF-16 code units. */
  maxReportDetailsLength: 500,
  /** Most blocked users one block-list page returns, and the largest `limit` a client may ask for. */
  maxBlockListPageSize: 50,
} as const;

/**
 * Why a user reports another rider: the four choices of the report form.
 *
 * - `unsafe_behavior`: behavior that made the reporter feel unsafe.
 * - `harassment`: harassment.
 * - `spam_or_misleading`: spam or misleading information.
 * - `other`: something else, which the optional details can explain.
 */
export const ReportReasonSchema = z.enum(['unsafe_behavior', 'harassment', 'spam_or_misleading', 'other']);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

/**
 * Optional free-text details of a report: 1 to `SAFETY_POLICY.maxReportDetailsLength`
 * characters that may span lines, under the same rule as chat text.
 *
 * The form asks the reporter not to include phone numbers or private addresses. A schema
 * cannot detect them, so details are private: they never appear in logs, analytics,
 * notifications or the receipt.
 */
export const ReportDetailsSchema = multilineTextSchema(SAFETY_POLICY.maxReportDetailsLength);
export type ReportDetails = z.infer<typeof ReportDetailsSchema>;

/**
 * The group where the reporter met the reported rider, and the chat message being reported
 * (`null` when the report is about the rider in the group as a whole).
 *
 * These are references only: the report never copies message text, and the source reads the
 * message itself. The source checks that the reporter may still read the group, that the
 * reported rider is or was one of its members, and that the message belongs to that group
 * and was sent by the reported rider.
 */
export const ReportContextSchema = z.strictObject({
  groupId: IdSchema,
  messageId: IdSchema.nullable(),
});
export type ReportContextDto = z.infer<typeof ReportContextSchema>;

/**
 * Reports another rider (`POST /reports`); the result is a `ReportReceiptDto`.
 *
 * - `operationId` is created once per report and reused on every retry, including after a
 *   failure whose outcome is unknown. A retry returns the original receipt, even if the
 *   reporter has lost access to the context since, so a lost response never creates a second
 *   report. The same ID with different input fails with `IDEMPOTENCY_CONFLICT`.
 * - `targetUserId` is the reported rider, never the caller.
 * - `reason` is the chosen reason, and `details` the optional text, omitted when the
 *   reporter adds none.
 * - `context` is omitted for a report made outside a group, for example about a rider seen in
 *   discovery, or after the reporter left the group and lost access to it.
 *
 * The reporter comes from the session; the strict schema rejects a reporter, copied message
 * text and locations. The checks, in order, are in `docs/api/groups.md`.
 */
export const ReportUserInputSchema = z.strictObject({
  operationId: OperationIdSchema,
  targetUserId: IdSchema,
  reason: ReportReasonSchema,
  details: ReportDetailsSchema.optional(),
  context: ReportContextSchema.optional(),
});
export type ReportUserInput = z.infer<typeof ReportUserInputSchema>;

/**
 * Proof that the source accepted a report: `id` is the receipt ID shown to the reporter, and
 * `receivedAt` when the report was accepted. The source issues it only after acceptance; a
 * failed submission returns an error and no receipt.
 *
 * A receipt does not mean a moderation decision was made. It has no status, outcome or
 * action, and echoes nothing of the report.
 */
export const ReportReceiptSchema = z.strictObject({
  id: IdSchema,
  receivedAt: TimestampSchema,
});
export type ReportReceiptDto = z.infer<typeof ReportReceiptSchema>;

/**
 * One rider the caller blocked: their public summary and when the block was made. Only the
 * blocker sees their blocks; the blocked rider is never told.
 */
export const BlockedUserSchema = z.strictObject({
  user: UserSchema,
  blockedAt: TimestampSchema,
});
export type BlockedUserDto = z.infer<typeof BlockedUserSchema>;

/**
 * Blocks a rider (`PUT /me/blocks/{userId}`, where `userId` names the rider); the result is a
 * `BlockUserResultDto`.
 *
 * The block filters each rider from the other's later discovery and matches, and prevents
 * them from sharing a group. If they share a live group, the caller leaves it in the same
 * operation. `operationId` makes a retry return the original result, including that leave;
 * the same ID for another rider fails with `IDEMPOTENCY_CONFLICT`. Blocking a rider who is
 * already blocked, with a new operation, changes nothing and returns the existing block with
 * no leave. Blocking oneself fails with `VALIDATION_FAILED`, and an unknown user with
 * `NOT_FOUND`.
 *
 * Unblocking (`DELETE /me/blocks/{userId}`) has no body and no result (`204`), and succeeds
 * whether or not the block exists. It allows future pairing again but restores no group
 * membership or chat access.
 */
export const BlockUserInputSchema = z.strictObject({
  operationId: OperationIdSchema,
});
export type BlockUserInput = z.infer<typeof BlockUserInputSchema>;

/**
 * Result of blocking a rider.
 *
 * - `blockedUser` is the block, as the block list shows it.
 * - `leftGroup` is the caller's leave when they shared a live group with the rider: the group
 *   left and the caller's request, now cancelled with it. It is `null` when they shared none.
 *   The normal leave rules apply to the members who remain: the earliest takes over as
 *   coordinator if needed, a ready group returns to forming, and with fewer than two left
 *   the group closes with `members_left`. They see an ordinary leave, never the block. A
 *   closed group, readable until its history expires, is not affected.
 *
 * Like any leave, the result holds nothing about the group afterwards: the caller may no
 * longer read it.
 */
export const BlockUserResultSchema = z
  .strictObject({
    blockedUser: BlockedUserSchema,
    leftGroup: LeaveGroupResultSchema.nullable(),
  })
  .refine(
    ({ blockedUser, leftGroup }) => leftGroup === null || leftGroup.rideRequest.user.id !== blockedUser.user.id,
    { message: 'Expected the caller to block someone else', path: ['blockedUser'] },
  );
export type BlockUserResultDto = z.infer<typeof BlockUserResultSchema>;

/**
 * Reads one page of the caller's block list (`GET /me/blocks`), newest block first.
 *
 * - `cursor` is omitted for the first page, and is otherwise the previous page's
 *   `nextCursor`. A malformed cursor fails with `VALIDATION_FAILED`.
 * - `limit` is the most blocked users wanted, 1 to `SAFETY_POLICY.maxBlockListPageSize`.
 */
export const BlockListQueryInputSchema = z.strictObject({
  cursor: CursorSchema.optional(),
  limit: z.int().min(1).max(SAFETY_POLICY.maxBlockListPageSize),
});
export type BlockListQueryInput = z.infer<typeof BlockListQueryInputSchema>;

/** Whether the blocks are listed newest first, each rider once. */
function hasDistinctBlocksNewestFirst(blockedUsers: readonly BlockedUserDto[]): boolean {
  let previous = Infinity;
  return (
    new Set(blockedUsers.map((blocked) => blocked.user.id)).size === blockedUsers.length &&
    blockedUsers.every((blocked) => {
      const blockedAt = Date.parse(blocked.blockedAt);
      const inOrder = blockedAt <= previous;
      previous = blockedAt;
      return inOrder;
    })
  );
}

/**
 * One page of the caller's block list.
 *
 * - `blockedUsers` are newest block first, each rider once, at most the requested `limit`.
 * - `nextCursor` reads the older blocks after this page, or is `null` on the last page. An
 *   empty page is always the last.
 *
 * A block or unblock made while paging changes the first page, so the app reloads from it
 * afterwards.
 */
export const BlockListPageSchema = z
  .strictObject({
    blockedUsers: z.array(BlockedUserSchema).max(SAFETY_POLICY.maxBlockListPageSize),
    nextCursor: CursorSchema.nullable(),
  })
  .refine((page) => hasDistinctBlocksNewestFirst(page.blockedUsers), {
    message: 'Expected each rider once, newest block first',
    path: ['blockedUsers'],
  })
  .refine((page) => page.nextCursor === null || page.blockedUsers.length > 0, {
    message: 'Expected no next cursor on an empty page',
    path: ['nextCursor'],
  });
export type BlockListPageDto = z.infer<typeof BlockListPageSchema>;
