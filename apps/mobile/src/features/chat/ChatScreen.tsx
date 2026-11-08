import { CHAT_POLICY, IdSchema, type ChatMessageDto, type GroupMemberDto } from '@ride-match/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { addToHistory, catchUpHistory } from '../../data/chatHistory';
import { useDataSource } from '../../data/DataSourceProvider';
import { withDataErrors, type DataError } from '../../data/errors';
import { createOperationId } from '../../data/operationId';
import { chatHistoryQuery, groupDetailQuery } from '../../data/queries';
import { queryKeys } from '../../data/queryKeys';
import { useConnectionState } from '../../data/useConnectionState';
import { useEventSubscription } from '../../data/SyncProvider';
import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { Notice } from '../../ui/Notice';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { SheetHost } from '../../ui/SheetHost';
import { TextField } from '../../ui/TextField';
import { UnavailableScreen } from '../../ui/UnavailableScreen';
import { colors, radii, spacing } from '../../ui/tokens';
import { useViewer } from '../auth/AuthSessionProvider';
import { useClock } from '../discovery/useClock';
import { describeClosure } from '../groups/groupLifecycle';
import { MeetingPointSheet } from '../groups/MeetingPointSheet';
import { MemberMenu } from '../groups/MemberMenu';
import { BlockSheet } from '../safety/BlockSheet';
import { ReportSheet } from '../safety/ReportSheet';
import {
  buildTimeline,
  describeSendError,
  describeSender,
  pendingOutgoing,
  toChatText,
  type OutgoingMessage,
  type TimelineEntry,
} from './chatTimeline';

/** How close to the end (points) still counts as reading the newest messages, so new ones scroll into view. */
const NEAR_END = 80;

type ChatScreenProps = {
  /** The route's raw parameter; it is only ever sent to the source, never shown. */
  groupId: string | undefined;
  onBack: () => void;
  onGoHome: () => void;
};

type ChatSheet =
  | { kind: 'member'; member: GroupMemberDto; messageId: string }
  | { kind: 'report'; member: GroupMemberDto; messageId: string }
  | { kind: 'block'; member: GroupMemberDto; messageId: string; reported: boolean }
  | { kind: 'meeting'; openedId: string }
  | null;

/**
 * The group chat route (designs 14, 36, 37, 45): the member-only messages of one group, newest at
 * the bottom, with a composer pinned above the keyboard.
 *
 * - **Access** is the source's decision, as on the group screen: a malformed ID, an anonymous
 *   viewer, a non-member, an unknown group and an expired history all show the same unavailable
 *   state (37). When access ends while the chat is open (the source refuses a read or a send, or
 *   a closed group's `historyExpiresAt` passes on the device clock), the group's private reads are
 *   removed and the typed text and unsent messages are dropped at once; nothing later restores
 *   them.
 * - **History:** the latest page first (`chatHistoryQuery`); "Load earlier messages" reads the
 *   page before it, keeping the reader's place, until the start of the chat. Messages show once
 *   each, ordered by sequence, with sender and time; another member's message opens that
 *   member's menu (`MemberMenu`). Events and confirmed sends join the history by message ID
 *   (`chatHistory.ts`), so an echo or a duplicate never shows twice, and new messages scroll into
 *   view only while the reader is at the end.
 * - **Catching up:** "Check latest messages" reads every message after the newest held, page by
 *   page (`catchUpHistory`). It is offered while the connection is interrupted (with a badge) or
 *   a message was not sent. Reconnecting rereads the history (the sync coordinator) but never
 *   sends anything.
 * - **Sending:** the text is trimmed and its line endings normalized (`toChatText`); it shows at
 *   once as "Sending…", then as the source's stored message. The composer is read-only while a
 *   message is on its way, so messages keep their order. A message the source could not confirm
 *   stays as "You · not sent" with its text (45); only "Retry message" sends it again, under the
 *   same client message ID, so it cannot post twice. If the history shows it was stored after
 *   all, it shows once, as stored. Text the source refused goes back in the composer. Analytics
 *   record only that a send was pressed and confirmed, never the text.
 * - **Closed groups** (36): read-only, with the closure's reason and the one-hour retention; no
 *   composer, and unsent messages can no longer be retried.
 * - **Report and block** from a member's menu (`ReportSheet` with the message as context,
 *   `BlockSheet`). Blocking a member of the live group leaves it in the same operation and
 *   returns to the map; in a closed chat the block changes nothing there and the screen says so.
 *
 * Message text never reaches a log, analytics or a notification.
 */
export function ChatScreen({ groupId, onBack, onGoHome }: ChatScreenProps) {
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
  const viewer = useViewer();
  const connection = useConnectionState();
  const now = useClock();
  const valid = groupId !== undefined && IdSchema.safeParse(groupId).success;
  const member = viewer.kind === 'user' && valid ? viewer : null;
  const placeholderViewer = member ?? { kind: 'user' as const, userId: '' };
  const groupQuery = useQuery({
    ...groupDetailQuery(dataSource, placeholderViewer, groupId ?? ''),
    enabled: member !== null,
  });
  const history = useInfiniteQuery({
    ...chatHistoryQuery(dataSource, placeholderViewer, groupId ?? ''),
    enabled: member !== null,
  });
  useEventSubscription(member !== null && groupId !== undefined ? { kind: 'group', groupId } : null);

  const [draft, setDraft] = useState('');
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ChatSheet>(null);
  // A report or block on its way: the sheet stays until the source answers.
  const [sheetPending, setSheetPending] = useState(false);
  // Said after a block that left no group (a closed chat): the history stays as it was.
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null);
  const closeSheet = useCallback(() => {
    setSheet(null);
    setSheetPending(false);
  }, []);

  // Access ends: the source refused, or a closed group's history ran out on the device clock.
  const denied = (error: DataError | null) =>
    error?.code === 'MEMBERSHIP_REQUIRED' || error?.code === 'HISTORY_EXPIRED';
  const [revoked, setRevoked] = useState(false);
  const closure = groupQuery.data?.closure ?? null;
  // Sticky: removing the private reads also removes the closure that told the time.
  if (!revoked && closure !== null && now >= Date.parse(closure.historyExpiresAt)) setRevoked(true);
  const lostAccess = member !== null && (revoked || denied(groupQuery.error) || denied(history.error));
  if (lostAccess && (draft !== '' || outgoing.length > 0 || sheet !== null)) {
    // Private text leaves with access, adjusted during render so it never shows again.
    setDraft('');
    setOutgoing([]);
    setSheet(null);
  }
  useEffect(() => {
    if (!lostAccess || member === null || groupId === undefined) return;
    void queryClient.cancelQueries({ queryKey: queryKeys.group(member, groupId) });
    queryClient.removeQueries({ queryKey: queryKeys.group(member, groupId) });
  }, [lostAccess, member, groupId, queryClient]);

  const markOutgoing = (clientMessageId: string, change: Partial<OutgoingMessage>) =>
    setOutgoing((current) =>
      current.map((sent) => (sent.clientMessageId === clientMessageId ? { ...sent, ...change } : sent)),
    );

  const send = useMutation<ChatMessageDto, DataError, { clientMessageId: string; text: string }>({
    mutationFn: (input) => withDataErrors(dataSource.chat.send(groupId ?? '', input)),
    onSuccess: (stored, input) => {
      analytics.track('message_sent');
      markOutgoing(input.clientMessageId, { stored, failed: null });
      if (member !== null && groupId !== undefined) addToHistory(queryClient, member, groupId, [stored]);
    },
    onError: (error, input) => {
      const outcome = describeSendError(error);
      if (outcome.kind === 'revoked') {
        setRevoked(true);
        return;
      }
      if (outcome.kind === 'invalid') {
        // The source refused the text itself: it goes back in the (still empty) composer.
        setOutgoing((current) => current.filter((sent) => sent.clientMessageId !== input.clientMessageId));
        setDraft(input.text);
        setFieldError(outcome.message);
        return;
      }
      markOutgoing(input.clientMessageId, { failed: outcome.kind === 'closed' ? 'closed' : 'retry' });
      if (outcome.kind === 'closed') void groupQuery.refetch();
    },
  });

  const catchUp = useMutation<number, DataError>({
    mutationFn: () =>
      member === null || groupId === undefined
        ? Promise.resolve(0)
        : catchUpHistory(dataSource, queryClient, member, groupId),
    onError: (error) => {
      if (denied(error)) setRevoked(true);
    },
  });

  // Keep only outgoing messages no history page holds yet (adjusted during render, not in an effect).
  const pages = history.data?.pages ?? [];
  const stillPending = member === null ? outgoing : pendingOutgoing(pages, outgoing, member.userId);
  if (stillPending.length !== outgoing.length) setOutgoing(stillPending);

  // Scrolling: follow new messages only while the reader is at the end.
  const scroller = useRef<ScrollView>(null);
  const atEnd = useRef(true);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    atEnd.current = contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR_END;
  };

  if (member === null) {
    return (
      <UnavailableScreen
        title="Chat unavailable"
        message="You don’t have access to this chat. Only the group’s current members can open it."
        onGoHome={onGoHome}
      />
    );
  }
  if (lostAccess) {
    return (
      <UnavailableScreen
        title="Chat unavailable"
        message="You no longer have access. You may have left this group, or its history may have expired. Private messages have been cleared from this view."
        onGoHome={onGoHome}
      />
    );
  }
  const group = groupQuery.data;
  if (group === undefined || history.data === undefined) {
    const failed = groupQuery.error !== null || history.error !== null;
    return (
      <Screen>
        <ScreenHeader title="Group chat" onBack={onBack} backLabel="Back to group" />
        <View style={styles.centre}>
          <AppText color="muted" accessibilityLiveRegion="polite">
            {failed ? 'The chat couldn’t be loaded.' : 'Loading the chat…'}
          </AppText>
          {failed ? (
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => {
                void groupQuery.refetch();
                void history.refetch();
              }}
            />
          ) : null}
        </View>
      </Screen>
    );
  }

  const live = group.status === 'forming' || group.status === 'ready';
  const timeline = buildTimeline(pages, outgoing, member.userId);
  const text = toChatText(draft);
  const sending = send.isPending;
  const unsent = timeline.some((entry) => entry.kind === 'failed');
  const interrupted = connection === 'disconnected';

  function submit() {
    if (text === null || sending) return;
    const clientMessageId = createOperationId();
    analytics.track('message_send_clicked');
    atEnd.current = true;
    setOutgoing((current) => [...current, { clientMessageId, text, stored: null, failed: null }]);
    setDraft('');
    setFieldError(null);
    send.mutate({ clientMessageId, text });
  }

  /** Sends a message that was not sent again, under its original client message ID. */
  function retry(clientMessageId: string) {
    const sent = outgoing.find((entry) => entry.clientMessageId === clientMessageId);
    if (sent === undefined || sending) return;
    analytics.track('message_send_clicked');
    markOutgoing(clientMessageId, { failed: null });
    send.mutate({ clientMessageId, text: sent.text });
  }

  const memberOf = (message: ChatMessageDto) =>
    message.sender.id === member.userId
      ? null
      : (group.members.find((entry) => entry.user.id === message.sender.id) ?? null);
  const people = `${group.members.length} ${group.members.length === 1 ? 'person' : 'people'}`;
  const closed = live ? null : describeClosure(group);

  return (
    <Screen
      footer={
        live ? (
          <View style={styles.composer}>
            <View style={styles.field}>
              <TextField
                label="Message"
                placeholder="Write a message…"
                value={draft}
                onChangeText={(typed) => {
                  setDraft(typed);
                  if (fieldError !== null) setFieldError(null);
                }}
                multiline
                maxLength={CHAT_POLICY.maxTextLength}
                disabled={sending}
                error={fieldError ?? undefined}
              />
            </View>
            <IconButton
              icon={<Icon name="send" />}
              accessibilityLabel="Send message"
              disabled={text === null}
              busy={sending}
              onPress={submit}
            />
          </View>
        ) : (
          <ActionFooter>
            <Button label="Sending is unavailable" disabled onPress={() => undefined} />
            <Button label="Back to the map" variant="secondary" onPress={onGoHome} />
          </ActionFooter>
        )
      }
    >
      <ScreenHeader
        title={live ? `${group.destination.label} · ${people}` : 'Group chat · closed'}
        onBack={onBack}
        backLabel="Back to group"
      />
      {interrupted ? (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <Badge label="Connection interrupted" tone="warning" />
          <AppText variant="small" color="muted">
            Messages may be out of date. Nothing is sent automatically when the connection returns.
          </AppText>
        </View>
      ) : null}
      {blockedNotice === null ? null : (
        <View accessibilityLiveRegion="polite">
          <Notice message={blockedNotice} />
        </View>
      )}
      <ScrollView
        ref={scroller}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={onScroll}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (atEnd.current) scroller.current?.scrollToEnd({ animated: false });
        }}
      >
        {closed === null ? (
          <View style={styles.intro}>
            <Badge label="Temporary group chat" />
            <AppText variant="small" color="muted">
              Text only. Chat becomes read-only when the group closes.
            </AppText>
            {group.meetingPoint === null ? null : (
              <Button
                label="View meeting point"
                variant="secondary"
                onPress={() => group.meetingPoint && setSheet({ kind: 'meeting', openedId: group.meetingPoint.id })}
              />
            )}
          </View>
        ) : (
          <View style={styles.intro}>
            <Badge label="Read-only · group closed" tone="warning" />
            <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
              This group has closed.
            </AppText>
            <AppText color="muted">
              {[closed.body, 'No one can join or send messages now.'].filter(Boolean).join(' ')}
            </AppText>
            <Notice message="History is available only to authorized members, for up to one hour after closure." />
          </View>
        )}
        {history.hasNextPage ? (
          <Button
            label="Load earlier messages"
            variant="ghost"
            busy={history.isFetchingNextPage}
            onPress={() => {
              atEnd.current = false;
              void history.fetchNextPage();
            }}
          />
        ) : timeline.length > 0 ? (
          <AppText variant="small" color="muted" style={styles.start}>
            Start of this group’s chat
          </AppText>
        ) : (
          <AppText color="muted" style={styles.start}>
            {live ? 'No messages yet. Say hello and agree where to meet.' : 'No messages were sent in this group.'}
          </AppText>
        )}
        {history.isFetchNextPageError ? (
          <AppText variant="small" color="danger" accessibilityLiveRegion="polite">
            Earlier messages couldn’t be loaded. Try again.
          </AppText>
        ) : null}
        <View style={styles.messages} accessibilityLiveRegion="polite">
          {timeline.map((entry) => (
            <MessageRow
              key={entry.key}
              entry={entry}
              viewerId={member.userId}
              live={live}
              retrying={sending}
              onRetry={retry}
              onMember={(found) =>
                entry.kind === 'message' && setSheet({ kind: 'member', member: found, messageId: entry.message.id })
              }
              memberOf={memberOf}
            />
          ))}
        </View>
        {unsent && live ? (
          <Notice message="Your text is preserved. Retry sends the same message once; reconnecting doesn’t send it automatically." />
        ) : null}
        {live && (unsent || interrupted || catchUp.isError) ? (
          <View style={styles.check}>
            <Button
              label="Check latest messages"
              variant="secondary"
              busy={catchUp.isPending}
              onPress={() => catchUp.mutate()}
            />
            {catchUp.isError ? (
              <AppText variant="small" color="danger" accessibilityLiveRegion="polite">
                The latest messages couldn’t be checked. Try again when you’re connected.
              </AppText>
            ) : catchUp.isSuccess ? (
              <AppText variant="small" color="muted" accessibilityLiveRegion="polite">
                {catchUp.data === 0
                  ? 'You’re up to date.'
                  : `${catchUp.data} new ${catchUp.data === 1 ? 'message' : 'messages'}.`}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <SheetHost open={sheet !== null} onDismiss={closeSheet} dismissible={!sheetPending}>
        {sheet?.kind === 'member' ? (
          <MemberMenu
            member={sheet.member}
            onReport={() => setSheet({ ...sheet, kind: 'report' })}
            onBlock={() => setSheet({ ...sheet, kind: 'block', reported: false })}
            onClose={() => setSheet(null)}
          />
        ) : sheet?.kind === 'report' ? (
          <ReportSheet
            target={sheet.member.user}
            context={{ groupId: group.id, messageId: sheet.messageId }}
            onPendingChange={setSheetPending}
            onClose={closeSheet}
            onBlock={() => setSheet({ ...sheet, kind: 'block', reported: true })}
          />
        ) : sheet?.kind === 'block' && member !== null ? (
          <BlockSheet
            viewer={member}
            target={sheet.member.user}
            group={group}
            onPendingChange={setSheetPending}
            onReport={sheet.reported ? undefined : () => setSheet({ ...sheet, kind: 'report' })}
            onBlocked={(result) => {
              closeSheet();
              if (result.leftGroup !== null) onGoHome();
              else setBlockedNotice(`You blocked ${sheet.member.user.displayName}.`);
            }}
            onClose={closeSheet}
          />
        ) : sheet?.kind === 'meeting' ? (
          <MeetingPointSheet point={group.meetingPoint} openedId={sheet.openedId} onReturn={() => setSheet(null)} />
        ) : null}
      </SheetHost>
    </Screen>
  );
}

/**
 * One chat row. The viewer's messages sit on the right in lime; others' on the left in white,
 * and press to open that member's menu while they are still in the group. A message on its way
 * reads "You · Sending…" until the source stores it; one not sent reads "You · not sent", with
 * "Retry message" while the group is live (45).
 */
function MessageRow({
  entry,
  viewerId,
  live,
  retrying,
  onRetry,
  memberOf,
  onMember,
}: {
  entry: TimelineEntry;
  viewerId: string;
  live: boolean;
  retrying: boolean;
  onRetry: (clientMessageId: string) => void;
  memberOf: (message: ChatMessageDto) => GroupMemberDto | null;
  onMember: (member: GroupMemberDto) => void;
}) {
  if (entry.kind === 'sending') {
    return (
      <View style={[styles.bubble, styles.own]}>
        <AppText variant="small" color="muted">
          You · Sending…
        </AppText>
        <AppText>{entry.text}</AppText>
      </View>
    );
  }
  if (entry.kind === 'failed') {
    return (
      <View style={[styles.bubble, styles.own, styles.failed]}>
        <AppText variant="small" color="danger">
          You · not sent
        </AppText>
        <AppText>{entry.text}</AppText>
        {entry.retryable && live ? (
          <Button
            label="Retry message"
            variant="secondary"
            disabled={retrying}
            onPress={() => onRetry(entry.clientMessageId)}
          />
        ) : null}
      </View>
    );
  }
  const label = describeSender(entry.message, viewerId);
  const content = (
    <>
      <AppText variant="small" color="muted">
        {label}
      </AppText>
      <AppText>{entry.message.text}</AppText>
    </>
  );
  if (entry.own) return <View style={[styles.bubble, styles.own]}>{content}</View>;
  const sender = live ? memberOf(entry.message) : null;
  if (sender === null) return <View style={[styles.bubble, styles.theirs]}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${entry.message.text}`}
      accessibilityHint={`Opens actions for ${sender.user.displayName}`}
      onPress={() => onMember(sender)}
      style={({ pressed }) => [styles.bubble, styles.theirs, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  status: {
    marginTop: spacing.md,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  list: {
    flex: 1,
    marginTop: spacing.md,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  intro: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  start: {
    textAlign: 'center',
  },
  messages: {
    gap: spacing.sm,
  },
  bubble: {
    maxWidth: '85%',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  own: {
    alignSelf: 'flex-end',
    backgroundColor: colors.lime,
  },
  failed: {
    backgroundColor: colors.dangerSoft,
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: {
    backgroundColor: colors.soft,
  },
  check: {
    gap: spacing.xs,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
  },
});
