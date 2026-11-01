import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ApiErrorSchema,
  CHAT_POLICY,
  ChatHistoryQueryInputSchema,
  ChatMessagePageSchema,
  ChatMessageSchema,
  ChatTextSchema,
  MessageSequenceSchema,
  SendChatMessageInputSchema,
  type ChatMessageDto,
} from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic riders and messages of one demo group; no real person or conversation.
const riderA = { id: 'user_rider_a', displayName: 'Rider A', avatarUrl: null };
const riderB = { id: 'user_rider_b', displayName: 'Rider B', avatarUrl: null };
const clientId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const message = (sequence: number, sender = riderA): ChatMessageDto => ({
  id: `msg_${sequence}`,
  groupId: 'group_1',
  sender,
  text: `Demo message ${sequence}`,
  createdAt: new Date(Date.UTC(2026, 10, 1, 9, 30) + sequence * 1000).toISOString(),
  sequence,
  clientMessageId: clientId(sequence),
});
const messages = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => message(from + index, index % 2 ? riderB : riderA));

describe('ChatTextSchema', () => {
  it.each([
    ['one character', 'k'],
    ['a sentence', 'I am at the fountain.'],
    ['line breaks inside', 'On my way.\n\nTwo minutes.'],
    ['emoji and other scripts', 'Иду 👍'],
    ['the longest text', 'a'.repeat(CHAT_POLICY.maxTextLength)],
  ])('accepts %s', (_label, text) => {
    expect(ChatTextSchema.parse(text)).toBe(text);
  });

  it.each([
    ['empty text', ''],
    ['only spaces', '   '],
    ['leading whitespace', ' hello'],
    ['a trailing line break', 'hello\n'],
    ['a carriage return', 'one\r\ntwo'],
    ['a tab', 'one\ttwo'],
    ['another control character', 'bell\u0007'],
    ['text one character too long', 'a'.repeat(CHAT_POLICY.maxTextLength + 1)],
    ['a number', 42],
  ])('rejects %s', (_label, text) => {
    expect(accepts(ChatTextSchema, text)).toBe(false);
  });
});

describe('MessageSequenceSchema', () => {
  it.each([1, 2, 1000])('accepts %d', (sequence) => {
    expect(accepts(MessageSequenceSchema, sequence)).toBe(true);
  });

  it.each([0, -1, 1.5, '1'])('rejects %s', (sequence) => {
    expect(accepts(MessageSequenceSchema, sequence)).toBe(false);
  });
});

describe('ChatMessageSchema', () => {
  it('accepts a stored message', () => {
    expect(ChatMessageSchema.parse(message(1))).toEqual(message(1));
  });

  it.each([
    ['a missing sender', { ...message(1), sender: undefined }],
    ['a sender given only by ID', { ...message(1), sender: 'user_rider_a' }],
    ['a sender phone number', { ...message(1), sender: { ...riderA, phoneNumber: '+12025550142' } }],
    ['a sequence of 0', { ...message(1), sequence: 0 }],
    ['a client message ID that is not a UUID', { ...message(1), clientMessageId: 'retry-1' }],
    ['a timestamp with an offset', { ...message(1), createdAt: '2026-11-01T15:31:00+06:00' }],
    ['untrimmed text', { ...message(1), text: ' hi ' }],
    ['a delivery status', { ...message(1), status: 'sent' }],
    ['a read receipt', { ...message(1), readBy: ['user_rider_b'] }],
    ['an attachment', { ...message(1), attachmentUrl: 'https://example.com/a.png' }],
    ['an edit time', { ...message(1), editedAt: '2026-11-01T09:32:00Z' }],
    ['a sender location', { ...message(1), coordinates: { latitude: 42.8762, longitude: 74.6041 } }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ChatMessageSchema, value)).toBe(false);
  });
});

describe('SendChatMessageInputSchema', () => {
  const send = { clientMessageId: clientId(7), text: 'Running two minutes late.' };

  it('accepts a client message ID and text', () => {
    expect(SendChatMessageInputSchema.parse(send)).toEqual(send);
  });

  it.each([
    ['a missing client message ID', { text: send.text }],
    ['a client message ID that is not a UUID', { ...send, clientMessageId: 'msg-1' }],
    ['empty text', { ...send, text: '' }],
    ['text that is too long', { ...send, text: 'a'.repeat(CHAT_POLICY.maxTextLength + 1) }],
    ['a sender chosen by the caller', { ...send, senderId: 'user_rider_b' }],
    ['a time chosen by the caller', { ...send, createdAt: '2026-11-01T09:40:00Z' }],
    ['a sequence chosen by the caller', { ...send, sequence: 8 }],
    ['a message ID chosen by the caller', { ...send, id: 'msg_8' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(SendChatMessageInputSchema, value)).toBe(false);
  });
});

describe('ChatHistoryQueryInputSchema', () => {
  it.each([
    ['the latest page', { limit: 30 }],
    ['an older page', { beforeCursor: 'c.older~1', limit: 30 }],
    ['a catch-up page', { afterSequence: 12, limit: 50 }],
    ['catch-up from the first message', { afterSequence: 0, limit: 1 }],
  ])('accepts %s', (_label, value) => {
    expect(ChatHistoryQueryInputSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['both positions', { beforeCursor: 'c.older~1', afterSequence: 12, limit: 30 }],
    ['a missing limit', { afterSequence: 12 }],
    ['a limit of 0', { limit: 0 }],
    ['a limit above the page size', { limit: CHAT_POLICY.maxPageSize + 1 }],
    ['a negative sequence', { afterSequence: -1, limit: 30 }],
    ['a fractional sequence', { afterSequence: 1.5, limit: 30 }],
    ['a cursor with spaces', { beforeCursor: 'c older', limit: 30 }],
    ['an empty cursor', { beforeCursor: '', limit: 30 }],
    ['a newer-messages cursor', { afterCursor: 'c.newer~1', limit: 30 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ChatHistoryQueryInputSchema, value)).toBe(false);
  });
});

describe('ChatMessagePageSchema', () => {
  it.each([
    ['an empty chat', { messages: [], olderCursor: null, latestSequence: 0 }],
    ['the whole chat in one page', { messages: messages(1, 3), olderCursor: null, latestSequence: 3 }],
    ['a latest page with older messages', { messages: messages(21, 40), olderCursor: 'c.before~21', latestSequence: 40 }],
    ['a catch-up page with more to read', { messages: messages(13, 15), olderCursor: 'c.before~13', latestSequence: 22 }],
    ['an empty catch-up page', { messages: [], olderCursor: null, latestSequence: 40 }],
    ['a full page', { messages: messages(1, CHAT_POLICY.maxPageSize), olderCursor: null, latestSequence: 60 }],
  ])('accepts %s', (_label, value) => {
    expect(ChatMessagePageSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['messages out of order', { messages: [message(2), message(1)], olderCursor: 'c.before~2', latestSequence: 2 }],
    ['a gap in the sequence', { messages: [message(1), message(3)], olderCursor: null, latestSequence: 3 }],
    ['a repeated message', { messages: [message(1), message(1)], olderCursor: null, latestSequence: 1 }],
    [
      'a repeated message ID',
      { messages: [message(1), { ...message(2), id: 'msg_1' }], olderCursor: null, latestSequence: 2 },
    ],
    [
      'one send intent stored twice',
      { messages: [message(1), { ...message(2), clientMessageId: clientId(1) }], olderCursor: null, latestSequence: 2 },
    ],
    [
      'messages of two groups',
      { messages: [message(1), { ...message(2), groupId: 'group_2' }], olderCursor: null, latestSequence: 2 },
    ],
    ['a message newer than the latest sequence', { messages: messages(1, 3), olderCursor: null, latestSequence: 2 }],
    ['no cursor although older messages exist', { messages: messages(5, 6), olderCursor: null, latestSequence: 6 }],
    ['a cursor although nothing is older', { messages: messages(1, 2), olderCursor: 'c.before~1', latestSequence: 2 }],
    ['a cursor on an empty page', { messages: [], olderCursor: 'c.before~1', latestSequence: 0 }],
    ['more messages than a page holds', { messages: messages(1, CHAT_POLICY.maxPageSize + 1), olderCursor: null, latestSequence: 60 }],
    ['a newer-messages cursor', { messages: [], olderCursor: null, latestSequence: 0, newerCursor: 'c.after~1' }],
    ['a total count', { messages: [], olderCursor: null, latestSequence: 0, total: 0 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ChatMessagePageSchema, value)).toBe(false);
  });
});

describe('send, retry, scroll back and catch up walkthrough', () => {
  it('keeps one message per send intent and recovers every missed page', () => {
    // A sends; the response is lost, so the app retries with the same client message ID.
    const send = SendChatMessageInputSchema.parse({ clientMessageId: clientId(41), text: 'I see the fountain.' });
    const stored = ChatMessageSchema.parse({ ...message(41), ...send });
    const retried = ChatMessageSchema.parse({ ...message(41), ...send });
    expect(retried).toEqual(stored);
    expect(
      ApiErrorSchema.parse({ code: 'IDEMPOTENCY_CONFLICT', message: 'This message was already sent.', requestId: 'req_1' })
        .code,
    ).toBe('IDEMPOTENCY_CONFLICT');

    // Opening the chat reads the latest page, and scrolling back follows its cursor.
    const latest = ChatMessagePageSchema.parse({ messages: messages(22, 41), olderCursor: 'c.before~22', latestSequence: 41 });
    expect(accepts(ChatHistoryQueryInputSchema, { beforeCursor: latest.olderCursor, limit: 20 })).toBe(true);
    const older = ChatMessagePageSchema.parse({ messages: messages(2, 21), olderCursor: 'c.before~2', latestSequence: 41 });
    const oldest = ChatMessagePageSchema.parse({ messages: messages(1, 1), olderCursor: null, latestSequence: 41 });
    expect(oldest.olderCursor).toBeNull();
    expect(older.messages.at(-1)?.sequence).toBe((latest.messages[0]?.sequence ?? 0) - 1);

    // After a reconnect, the app catches up from its newest sequence until a page ends at the latest.
    let held = 41;
    const catchUpPages = [
      { messages: messages(42, 61), olderCursor: 'c.before~42', latestSequence: 65 },
      { messages: messages(62, 65), olderCursor: 'c.before~62', latestSequence: 65 },
    ];
    for (const raw of catchUpPages) {
      expect(accepts(ChatHistoryQueryInputSchema, { afterSequence: held, limit: 20 })).toBe(true);
      const page = ChatMessagePageSchema.parse(raw);
      expect(page.messages[0]?.sequence).toBe(held + 1);
      held = page.messages.at(-1)?.sequence ?? held;
    }
    expect(held).toBe(65);
  });
});
