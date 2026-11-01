import { z } from 'zod';

import { CursorSchema, IdSchema, OperationIdSchema, TimestampSchema, multilineTextSchema } from './common.js';
import { UserSchema } from './users.js';

/**
 * Chat limits chosen for the mock MVP (CONTRACT-003-B). The schemas enforce them; revisit
 * them before a backend exists.
 */
export const CHAT_POLICY = {
  /** Longest message text, in UTF-16 code units. */
  maxTextLength: 1000,
  /** Most messages one history page returns, and the largest `limit` a client may ask for. */
  maxPageSize: 50,
} as const;

/**
 * Text of one chat message: plain text of 1 to `CHAT_POLICY.maxTextLength` characters (UTF-16
 * code units).
 *
 * The app trims surrounding whitespace and writes line breaks as `\n` before sending. The
 * schema rewrites nothing, so text that is not already clean fails, and the source stores and
 * returns it unchanged. Line breaks inside the text are allowed; other control characters,
 * such as `\r` and tabs, are not. Message text never belongs in logs, analytics or
 * notifications.
 */
export const ChatTextSchema = multilineTextSchema(CHAT_POLICY.maxTextLength);
export type ChatText = z.infer<typeof ChatTextSchema>;

/**
 * Position of a message in its group's chat: 1 for the first message, then one more for each
 * later message, with no gaps. The sequence orders messages; `createdAt` is only for display.
 * A gap between the sequences the app holds means it missed messages, which it reads with
 * `afterSequence`.
 */
export const MessageSequenceSchema = z.int().min(1);
export type MessageSequence = z.infer<typeof MessageSequenceSchema>;

/**
 * One stored chat message, as the group's members see it: in history pages, as the result of
 * sending, and in the realtime event of CONTRACT-004-A.
 *
 * - `id` is the canonical message ID, set by the source.
 * - `groupId` is the group whose chat holds the message.
 * - `sender` is the sender's public summary, which the source takes from the authenticated
 *   caller, so nobody can send as someone else. It stays on the message after the sender
 *   leaves.
 * - `createdAt` is when the source stored the message, and `sequence` its position.
 * - `clientMessageId` is the sender's ID for the send intent. The sender's app replaces its
 *   pending message with the stored one that carries this ID. With the sender, it identifies
 *   one message, so a retry or an echoed event never shows twice.
 *
 * Messages are never edited or deleted, and have no delivery or read status: sending and
 * failed states exist only in the app. Only the group's members, and its members at closure
 * until the history expires, may read them.
 */
export const ChatMessageSchema = z.strictObject({
  id: IdSchema,
  groupId: IdSchema,
  sender: UserSchema,
  text: ChatTextSchema,
  createdAt: TimestampSchema,
  sequence: MessageSequenceSchema,
  clientMessageId: OperationIdSchema,
});
export type ChatMessageDto = z.infer<typeof ChatMessageSchema>;

/**
 * Sends a text message to the caller's group (`POST /groups/{groupId}/messages`); the result is
 * the stored `ChatMessageDto`.
 *
 * - `clientMessageId` is the send's operation ID: a UUID the app creates once per message and
 *   reuses on every retry, including after a timeout. A retry returns the message already
 *   stored instead of storing a second one, even if the group closed in between. The same ID
 *   with different text fails with `IDEMPOTENCY_CONFLICT`.
 * - `text` is the trimmed message text.
 *
 * The source sets the sender, time, sequence and message ID; the strict schema rejects them
 * from the caller. The checks, in order, are in `docs/api/groups.md`.
 */
export const SendChatMessageInputSchema = z.strictObject({
  clientMessageId: OperationIdSchema,
  text: ChatTextSchema,
});
export type SendChatMessageInput = z.infer<typeof SendChatMessageInputSchema>;

/**
 * Reads one page of a group's chat (`GET /groups/{groupId}/messages`) in one of three modes:
 *
 * - no position: the latest messages, to open the chat;
 * - `beforeCursor`: the messages just before an earlier page, using that page's `olderCursor`,
 *   to scroll back;
 * - `afterSequence`: the messages after the newest sequence the app holds, to catch up after a
 *   reconnect or a gap. `0` reads from the first message.
 *
 * The two positions are mutually exclusive. `limit` is the most messages wanted, 1 to
 * `CHAT_POLICY.maxPageSize`. A malformed cursor, or one from another group, fails with
 * `VALIDATION_FAILED`.
 */
export const ChatHistoryQueryInputSchema = z
  .strictObject({
    beforeCursor: CursorSchema.optional(),
    afterSequence: z.int().min(0).optional(),
    limit: z.int().min(1).max(CHAT_POLICY.maxPageSize),
  })
  .refine((input) => input.beforeCursor === undefined || input.afterSequence === undefined, {
    message: 'Expected beforeCursor or afterSequence, not both',
    path: ['afterSequence'],
  });
export type ChatHistoryQueryInput = z.infer<typeof ChatHistoryQueryInputSchema>;

/**
 * Whether a page lists one group's messages in consecutive sequences, each message once: no
 * repeated ID, and no sender intent (`clientMessageId`) stored twice.
 */
function hasConsecutiveMessages(messages: readonly ChatMessageDto[]): boolean {
  const first = messages[0];
  return (
    messages.every(
      (message, index) =>
        message.groupId === first?.groupId && message.sequence === (first?.sequence ?? 0) + index,
    ) &&
    new Set(messages.map((message) => message.id)).size === messages.length &&
    new Set(messages.map((message) => `${message.sender.id}:${message.clientMessageId}`)).size ===
      messages.length
  );
}

/**
 * One page of a group's chat, in any mode.
 *
 * - `messages` are in ascending sequence order with no gaps, at most the requested `limit`.
 *   The latest page holds the newest messages, an older page those just before its cursor, and
 *   a catch-up page those just after `afterSequence`.
 * - `olderCursor` reads the messages before this page's first one. It is `null` exactly when
 *   nothing is older: the page is empty or starts at sequence 1.
 * - `latestSequence` is the group's newest sequence when the page was read, or `0` before the
 *   first message. Catch-up is complete when a page is empty or ends at `latestSequence`;
 *   otherwise the app reads again after the page's last sequence. An `afterSequence` beyond
 *   `latestSequence` returns an empty page: the app's history no longer matches the group's,
 *   so it reloads the latest page.
 *
 * Messages sent while the app pages also arrive by event; the app merges both by message ID.
 */
export const ChatMessagePageSchema = z
  .strictObject({
    messages: z.array(ChatMessageSchema).max(CHAT_POLICY.maxPageSize),
    olderCursor: CursorSchema.nullable(),
    latestSequence: z.int().min(0),
  })
  .refine((page) => hasConsecutiveMessages(page.messages), {
    message: 'Expected one group’s messages, each once, in consecutive sequence order',
    path: ['messages'],
  })
  .refine((page) => (page.messages[page.messages.length - 1]?.sequence ?? 0) <= page.latestSequence, {
    message: 'Expected no message newer than the latest sequence',
    path: ['latestSequence'],
  })
  .refine((page) => (page.olderCursor === null) === ((page.messages[0]?.sequence ?? 1) === 1), {
    message: 'Expected an older cursor exactly when older messages exist',
    path: ['olderCursor'],
  });
export type ChatMessagePageDto = z.infer<typeof ChatMessagePageSchema>;
