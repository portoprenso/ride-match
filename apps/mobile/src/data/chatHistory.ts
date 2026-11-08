import { CHAT_POLICY, type ChatMessageDto, type ChatMessagePageDto, type Id } from '@ride-match/contracts';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { AppDataSource } from './AppDataSource';
import { withDataErrors } from './errors';
import { queryKeys, type SignedInViewer } from './queryKeys';

/*
 * Keeping a cached chat history whole (docs/api/groups.md, "Chat"; CHAT-001-C). The history is
 * `chatHistoryQuery`'s pages: the first holds the latest messages it read, and each later page
 * the older ones before it, so together they are one unbroken run of sequences ending at the
 * newest message held. New messages (an event, a confirmed send, a catch-up page) join the
 * first page only when they continue that run; a gap is never papered over.
 */

/** The cached shape of `chatHistoryQuery`. */
export type ChatHistoryData = InfiniteData<ChatMessagePageDto, string | null>;

/** The newest sequence the cached history holds; `0` when it holds no message. */
export function newestHeldSequence(data: ChatHistoryData): number {
  const latest = data.pages[0]?.messages;
  return latest?.[latest.length - 1]?.sequence ?? 0;
}

/**
 * What adding `messages` to the history does:
 *
 * - `duplicate`: every one is already held, or older than the newest held message (an
 *   echo, a retry's answer, or a message from a page not loaded yet): nothing changes.
 * - `appended`: the new ones continue the run; `data` is the history with them added to the
 *   first page, which also learns the newer `latestSequence`.
 * - `gap`: they start after a missing sequence, so messages were missed. The caller reads the
 *   history again rather than show a hole.
 */
export type AppendOutcome = { kind: 'duplicate' } | { kind: 'appended'; data: ChatHistoryData } | { kind: 'gap' };

export function appendMessages(data: ChatHistoryData, messages: readonly ChatMessageDto[]): AppendOutcome {
  const [first, ...older] = data.pages;
  if (first === undefined) return { kind: 'gap' };
  const newest = newestHeldSequence(data);
  const fresh = [...new Map(messages.map((message) => [message.id, message])).values()]
    .filter((message) => message.sequence > newest)
    .sort((one, other) => one.sequence - other.sequence);
  if (fresh.length === 0) return { kind: 'duplicate' };
  if (fresh.some((message, index) => message.sequence !== newest + 1 + index)) return { kind: 'gap' };
  const last = fresh[fresh.length - 1]!;
  return {
    kind: 'appended',
    data: {
      ...data,
      pages: [
        {
          ...first,
          messages: [...first.messages, ...fresh],
          latestSequence: Math.max(first.latestSequence, last.sequence),
        },
        ...older,
      ],
    },
  };
}

/**
 * Adds stored messages (an event's, or a confirmed send's) to the cached history of `groupId`,
 * if it is held: appended when they continue it, ignored when already held, and read again on
 * a gap. Returns the outcome, or `null` when no history is held (the next read will have them).
 */
export function addToHistory(
  queryClient: QueryClient,
  viewer: SignedInViewer,
  groupId: Id,
  messages: readonly ChatMessageDto[],
): AppendOutcome['kind'] | null {
  const key = queryKeys.chatHistory(viewer, groupId);
  const held = queryClient.getQueryData<ChatHistoryData>(key);
  if (held === undefined) return null;
  const outcome = appendMessages(held, messages);
  if (outcome.kind === 'appended') queryClient.setQueryData<ChatHistoryData>(key, outcome.data);
  if (outcome.kind === 'gap') void queryClient.invalidateQueries({ queryKey: key, exact: true });
  return outcome.kind;
}

/** At most this many catch-up pages in one go; the history is read again if more were missed. */
const MAX_CATCH_UP_PAGES = 20;

/**
 * Catches up the cached history of `groupId` with every message after the newest one held
 * (`afterSequence`), page after page, until a page is empty or ends at the group's
 * `latestSequence`, adding each page to the history as it arrives. Messages that arrive by event
 * meanwhile merge by ID, so nothing shows twice.
 *
 * If the source's newest sequence is below the one held (an `afterSequence` beyond it returns
 * an empty page), the held history no longer matches the group's, so it is read again from the
 * latest page; the same happens on a gap, or after {@link MAX_CATCH_UP_PAGES} pages.
 *
 * Resolves with how many messages were added; rejects with the read's `DataError`, leaving
 * what was already added. Does nothing when no history is held.
 */
export async function catchUpHistory(
  dataSource: AppDataSource,
  queryClient: QueryClient,
  viewer: SignedInViewer,
  groupId: Id,
): Promise<number> {
  const key = queryKeys.chatHistory(viewer, groupId);
  const reread = () => queryClient.invalidateQueries({ queryKey: key, exact: true });
  let added = 0;
  for (let read = 0; read < MAX_CATCH_UP_PAGES; read += 1) {
    const held = queryClient.getQueryData<ChatHistoryData>(key);
    if (held === undefined) return added;
    const after = newestHeldSequence(held);
    const page = await withDataErrors(
      dataSource.chat.getHistory(groupId, { afterSequence: after, limit: CHAT_POLICY.maxPageSize }),
    );
    const last = page.messages[page.messages.length - 1];
    if (last === undefined) {
      if (page.latestSequence < after) await reread();
      return added;
    }
    const outcome = addToHistory(queryClient, viewer, groupId, page.messages);
    if (outcome === 'appended') added += page.messages.filter((message) => message.sequence > after).length;
    if (outcome === 'gap' || outcome === null) return added;
    if (last.sequence >= page.latestSequence) return added;
  }
  await reread();
  return added;
}
