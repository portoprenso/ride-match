import {
  ChatHistoryQueryInputSchema,
  SendChatMessageInputSchema,
  type ChatMessageDto,
  type ChatMessagePageDto,
} from '@ride-match/contracts';

import { authenticate } from './auth';
import type { IdGenerator } from './ids';
import { isMember } from './groups';
import { chatMessageCreated, toChatMessageDto } from './serializers';
import type { WorkContext } from './simulator';
import { isLiveGroup, type GroupRecord, type MessageRecord, type MockWorld, type UserRecord } from './world';

/*
 * The temporary group chat (docs/api/groups.md, "Chat"; CHAT-001-A): history pages, sending, and
 * the simulated replies of the demo riders.
 *
 * - The source sets each message's ID, sender, time and sequence. Sequences count 1, 2, 3… per
 *   group with no gaps, so a message's index in its group's list is its sequence minus one.
 * - A send is identified by its sender, its group and its client message ID. Sending it again
 *   returns the stored message instead of storing another, even after the group closed, so a
 *   lost answer never creates a second message.
 * - Access is the group read's: current members, and the members at closure until the history
 *   expires. A member who left loses it at once, a retry of their own earlier send included.
 *
 * Message text is private to the group's members: it never reaches a log, an analytics event or
 * a notification.
 */

type Context = WorkContext<MockWorld>;

/** How long after a rider's message a demo rider in the group answers it. */
export const CHAT_REPLY_DELAY_MS = 4_000;

/** What demo riders answer, in turn. Generic on purpose: no place, time or location. */
export const SIMULATED_REPLIES = [
  'Sounds good, see you there.',
  'On my way to the meeting point.',
  'Thanks! I’ll be there a few minutes early.',
  'Great, I’ll keep an eye on the chat.',
] as const;

/** The cursor prefix; the rest is the group and the first sequence of the page it came from. */
const CURSOR_PREFIX = 'chat';

/** A synthetic UUID for the source's own send intents (seeded and simulated messages). */
function sourceClientMessageId(ids: IdGenerator): string {
  const counter = ids.next('source-message').split('_')[1] ?? '0';
  return `00000000-0000-4000-8000-${counter.padStart(12, '0')}`;
}

/**
 * Appends a message to the group's chat with the next sequence and returns it. Callers check
 * access and text first; seeds use it to give a group some history.
 */
export function storeMessage(
  world: MockWorld,
  ids: IdGenerator,
  groupId: string,
  message: { senderId: string; text: string; createdAt: number; clientMessageId?: string },
): MessageRecord {
  const chat = world.messages.get(groupId) ?? [];
  const record: MessageRecord = {
    id: ids.next('message'),
    senderId: message.senderId,
    text: message.text,
    createdAt: message.createdAt,
    sequence: chat.length + 1,
    clientMessageId: message.clientMessageId ?? sourceClientMessageId(ids),
  };
  chat.push(record);
  world.messages.set(groupId, chat);
  return record;
}

/**
 * The group the caller may read the chat of: `MEMBERSHIP_REQUIRED` for an unknown group, a
 * non-member and a member who left (so the answer never reveals whether a group exists), then
 * `HISTORY_EXPIRED` once a closed group's history is no longer kept.
 */
function readableGroup(context: Context, user: UserRecord, groupId: string): GroupRecord {
  const group = context.state.groups.get(groupId);
  if (group === undefined || !isMember(group, user.id)) {
    throw context.sourceError('MEMBERSHIP_REQUIRED', 'Only this group’s members can see its chat.');
  }
  if (group.closure !== null && context.now >= group.closure.historyExpiresAt) {
    throw context.sourceError('HISTORY_EXPIRED', 'This group’s history is no longer kept.');
  }
  return group;
}

function encodeCursor(groupId: string, sequence: number): string {
  return `${CURSOR_PREFIX}~${groupId}~${sequence}`;
}

/**
 * The sequence an older-history cursor stands for: the first message of the page it came from.
 * `null` when the cursor is malformed, belongs to another group, or names a sequence this
 * group never issued a cursor for (only pages starting after sequence 1 have one).
 */
function decodeCursor(cursor: string, groupId: string, latestSequence: number): number | null {
  const [prefix, cursorGroupId, sequenceText, ...rest] = cursor.split('~');
  if (prefix !== CURSOR_PREFIX || cursorGroupId !== groupId || rest.length > 0) return null;
  if (sequenceText === undefined || !/^[1-9][0-9]*$/.test(sequenceText)) return null;
  const sequence = Number(sequenceText);
  return sequence >= 2 && sequence <= latestSequence ? sequence : null;
}

/**
 * `GET /groups/{groupId}/messages`: one page of the group's chat.
 *
 * In this order: `VALIDATION_FAILED` for an invalid query (both positions, a bad limit),
 * `UNAUTHENTICATED`/`SESSION_EXPIRED`, `MEMBERSHIP_REQUIRED`, `HISTORY_EXPIRED`, then
 * `VALIDATION_FAILED` for a cursor that is malformed or from another group.
 *
 * - No position: the newest `limit` messages.
 * - `beforeCursor`: the `limit` messages just before the page the cursor came from.
 * - `afterSequence`: the first `limit` messages after that sequence; empty beyond the newest.
 *
 * Messages are in ascending sequence order; `olderCursor` is `null` exactly when the page is
 * empty or starts at sequence 1; `latestSequence` is the group's newest sequence now (`0`
 * before the first message). Reading changes nothing.
 */
export function readChatHistory(
  context: Context,
  accessToken: string | null,
  groupId: string,
  input: unknown,
): ChatMessagePageDto {
  const parsed = ChatHistoryQueryInputSchema.safeParse(input);
  if (!parsed.success) throw context.sourceError('VALIDATION_FAILED', 'The history request is not valid.');
  const query = parsed.data;
  const user = authenticate(context, accessToken);
  readableGroup(context, user, groupId);

  const chat = context.state.messages.get(groupId) ?? [];
  const latestSequence = chat.length;
  let page: readonly MessageRecord[];
  if (query.afterSequence !== undefined) {
    page = chat.slice(query.afterSequence, query.afterSequence + query.limit);
  } else if (query.beforeCursor !== undefined) {
    const before = decodeCursor(query.beforeCursor, groupId, latestSequence);
    if (before === null) throw context.sourceError('VALIDATION_FAILED', 'The history cursor is not valid.');
    // Messages with sequences below `before` sit at indexes 0 … before - 2.
    page = chat.slice(Math.max(0, before - 1 - query.limit), before - 1);
  } else {
    page = chat.slice(Math.max(0, latestSequence - query.limit));
  }

  const first = page[0];
  return {
    messages: page.map((message) => toChatMessageDto(context.state, groupId, message)),
    olderCursor: first === undefined || first.sequence === 1 ? null : encodeCursor(groupId, first.sequence),
    latestSequence,
  };
}

/**
 * `POST /groups/{groupId}/messages`: the caller sends a text message to their group.
 *
 * In this order: `VALIDATION_FAILED` (text that is empty, too long, not trimmed or with control
 * characters other than `\n`; a client message ID that is not a UUID; any field the source
 * sets), `UNAUTHENTICATED`/`SESSION_EXPIRED`, `MEMBERSHIP_REQUIRED` (a former member's retry
 * too), `HISTORY_EXPIRED`, then the stored message for a client message ID the caller already
 * used in this group (`IDEMPOTENCY_CONFLICT` if the text differs), and only then `GROUP_CLOSED`
 * for a completed or cancelled group. So a retry after a lost answer returns the one stored
 * message, even if the group closed in between.
 *
 * A new message gets the next sequence, the caller as sender and the current time; its members
 * are told (`chat.message.created`, the sender included), and a demo rider answers it
 * {@link CHAT_REPLY_DELAY_MS} later ({@link scheduleSimulatedReply}). A retry emits nothing.
 */
export function sendChatMessage(
  context: Context,
  accessToken: string | null,
  groupId: string,
  input: unknown,
): ChatMessageDto {
  const parsed = SendChatMessageInputSchema.safeParse(input);
  if (!parsed.success) throw context.sourceError('VALIDATION_FAILED', 'The message is not valid.');
  const { clientMessageId, text } = parsed.data;
  const user = authenticate(context, accessToken);
  const group = readableGroup(context, user, groupId);
  const { state } = context;

  const stored = state.messages
    .get(groupId)
    ?.find((message) => message.senderId === user.id && message.clientMessageId === clientMessageId);
  if (stored !== undefined) {
    if (stored.text !== text) {
      throw context.sourceError('IDEMPOTENCY_CONFLICT', 'This message ID was already used for different text.');
    }
    return toChatMessageDto(state, groupId, stored);
  }
  if (!isLiveGroup(group)) throw context.sourceError('GROUP_CLOSED', 'This group has closed. Its chat is read-only.');

  const record = storeMessage(state, context.ids, groupId, {
    senderId: user.id,
    text,
    createdAt: context.now,
    clientMessageId,
  });
  const message = toChatMessageDto(state, groupId, record);
  context.emit(chatMessageCreated(context.eventEnvelope(), message));
  scheduleSimulatedReply(context, groupId, record);
  return message;
}

/** Whether a user signs in to the demo (the app's rider or a test's), rather than being a seeded demo rider. */
function signsIn(world: MockWorld, userId: string): boolean {
  return [...world.auth.accounts.values()].includes(userId);
}

/**
 * Schedules a demo rider's answer to `trigger`: {@link CHAT_REPLY_DELAY_MS} later, the earliest
 * member (join order) other than the sender who is a seeded demo rider answers with the next of
 * {@link SIMULATED_REPLIES}.
 *
 * Nobody answers if, by then, the group closed, the chat moved on (a newer message arrived, so
 * only the last of several quick messages gets an answer), or no seeded rider other than the
 * sender is still a member. Demo riders never answer each other: answers are stored here, not
 * sent, so they schedule nothing.
 */
function scheduleSimulatedReply(context: Context, groupId: string, trigger: MessageRecord): void {
  context.schedule(context.now + CHAT_REPLY_DELAY_MS, (later) => {
    const { state } = later;
    const group = state.groups.get(groupId);
    const chat = state.messages.get(groupId) ?? [];
    if (group === undefined || !isLiveGroup(group) || chat.length !== trigger.sequence) return;
    const replier = group.members.find(
      (member) => member.userId !== trigger.senderId && !signsIn(state, member.userId),
    );
    if (replier === undefined) return;
    const answers = chat.filter((message) => message.senderId === replier.userId).length;
    const record = storeMessage(state, later.ids, groupId, {
      senderId: replier.userId,
      text: SIMULATED_REPLIES[answers % SIMULATED_REPLIES.length]!,
      createdAt: later.now,
    });
    later.emit(chatMessageCreated(later.eventEnvelope(), toChatMessageDto(state, groupId, record)));
  });
}
