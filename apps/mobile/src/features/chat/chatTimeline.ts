import type { ChatMessageDto, ChatMessagePageDto } from '@ride-match/contracts';

import type { DataError } from '../../data/errors';

/**
 * A message the viewer sent from this screen: its client message ID (kept for every retry), its
 * text, the source's stored message once the source answered (`null` until then), and whether
 * the last attempt failed: `retry` when it may be sent again (design 45), `closed` when the group
 * closed first. It exists only in the app; nothing about it is stored as a canonical status.
 */
export type OutgoingMessage = {
  clientMessageId: string;
  text: string;
  stored: ChatMessageDto | null;
  failed: 'retry' | 'closed' | null;
};

/** One row of the chat: a stored message, the viewer's message on its way, or one not sent. */
export type TimelineEntry =
  | { kind: 'message'; key: string; message: ChatMessageDto; own: boolean }
  | { kind: 'sending'; key: string; text: string }
  | { kind: 'failed'; key: string; clientMessageId: string; text: string; retryable: boolean };

/** Whether `message` is the stored form of the viewer's send intent `clientMessageId`. */
const storesIntent = (message: ChatMessageDto, viewerId: string, clientMessageId: string) =>
  message.sender.id === viewerId && message.clientMessageId === clientMessageId;

/**
 * The chat in a stable order, from history pages (newest page first, as Query holds them) and
 * the viewer's outgoing messages:
 *
 * - Stored messages appear once each, merged by message ID and ordered by sequence, whatever
 *   order the pages and answers arrived in.
 * - A sent message the source answered but no page holds yet shows as that stored message;
 *   once a page holds it, the page's copy is the one shown, never both.
 * - Messages still sending, or not sent, follow in the order they were first sent, as the
 *   viewer's own. A failed message the history shows was stored after all (its answer was
 *   lost) shows once, as stored.
 */
export function buildTimeline(
  pages: readonly ChatMessagePageDto[],
  outgoing: readonly OutgoingMessage[],
  viewerId: string,
): TimelineEntry[] {
  const stored = new Map<string, ChatMessageDto>();
  for (const page of pages) for (const message of page.messages) stored.set(message.id, message);
  for (const sent of outgoing)
    if (sent.stored !== null && !stored.has(sent.stored.id)) stored.set(sent.stored.id, sent.stored);

  const messages = [...stored.values()].sort((first, second) => first.sequence - second.sequence);
  const entries: TimelineEntry[] = messages.map((message) => ({
    kind: 'message',
    key: message.id,
    message,
    own: message.sender.id === viewerId,
  }));
  for (const sent of outgoing) {
    if (sent.stored !== null || messages.some((message) => storesIntent(message, viewerId, sent.clientMessageId)))
      continue;
    entries.push(
      sent.failed === null
        ? { kind: 'sending', key: `outgoing:${sent.clientMessageId}`, text: sent.text }
        : {
            kind: 'failed',
            key: `outgoing:${sent.clientMessageId}`,
            clientMessageId: sent.clientMessageId,
            text: sent.text,
            retryable: sent.failed === 'retry',
          },
    );
  }
  return entries;
}

/**
 * The outgoing messages still worth holding: those not yet in any history page. A page that
 * holds the stored message replaces the local copy, so the list never grows for the chat's life.
 */
export function pendingOutgoing(
  pages: readonly ChatMessagePageDto[],
  outgoing: readonly OutgoingMessage[],
  viewerId: string,
): OutgoingMessage[] {
  return outgoing.filter(
    (sent) =>
      !pages.some((page) => page.messages.some((message) => storesIntent(message, viewerId, sent.clientMessageId))),
  );
}

/**
 * The text to send from what the viewer typed, or `null` when nothing is left to send.
 *
 * Line endings become `\n`, other control characters (such as tabs) become spaces, and the
 * surrounding whitespace is trimmed, as the contract's text rules require; nothing else is
 * rewritten. The composer's own limit keeps it within `CHAT_POLICY.maxTextLength`.
 */
export function toChatText(typed: string): string | null {
  const text = typed
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .trim();
  return text === '' ? null : text;
}

/** A message time such as "9:41", in the device's locale. */
export function formatMessageTime(at: string): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "You · 9:42" or "Aida · 9:41": who sent a stored message, and when the source stored it. */
export function describeSender(message: ChatMessageDto, viewerId: string): string {
  const name = message.sender.id === viewerId ? 'You' : message.sender.displayName;
  return `${name} · ${formatMessageTime(message.createdAt)}`;
}

/**
 * What a failed send means for the viewer:
 *
 * - `revoked`: they are no longer a member, or the history expired: the chat must leave the
 *   screen.
 * - `closed`: the group closed; nothing was sent, and sending is over.
 * - `invalid`: the source refused the text itself.
 * - `retry`: no answer, or the service was busy: the message may have been stored. It stays on
 *   screen as not sent, with its text and client message ID, and only the viewer's "Retry
 *   message" sends it again, under the same ID, so it cannot post twice. Nothing resends it on
 *   reconnect.
 * - `sign-in`: the session ended.
 */
export type SendFailure = { kind: 'revoked' | 'closed' | 'invalid' | 'retry' | 'sign-in'; message: string };

export function describeSendError(error: DataError): SendFailure {
  switch (error.code) {
    case 'MEMBERSHIP_REQUIRED':
    case 'HISTORY_EXPIRED':
      return { kind: 'revoked', message: 'You no longer have access to this chat.' };
    case 'GROUP_CLOSED':
      return { kind: 'closed', message: 'This group has closed, so your message wasn’t sent.' };
    case 'VALIDATION_FAILED':
    case 'IDEMPOTENCY_CONFLICT':
      return { kind: 'invalid', message: 'This message can’t be sent. Check it and try again.' };
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return { kind: 'sign-in', message: 'Your session ended. Sign in again to keep chatting.' };
    default:
      return { kind: 'retry', message: 'Your message wasn’t sent.' };
  }
}
