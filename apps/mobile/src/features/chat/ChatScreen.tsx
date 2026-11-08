import { CHAT_POLICY, IdSchema, type ChatMessageDto, type GroupMemberDto } from '@ride-match/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { useDataSource } from '../../data/DataSourceProvider';
import { withDataErrors, type DataError } from '../../data/errors';
import { createOperationId } from '../../data/operationId';
import { chatHistoryQuery, groupDetailQuery } from '../../data/queries';
import { queryKeys } from '../../data/queryKeys';
import { useEventSubscription } from '../../data/SyncProvider';
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
import { MeetingPointSheet } from '../groups/MeetingPointSheet';
import { MemberMenu } from '../groups/MemberMenu';
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

type ChatSheet = { kind: 'member'; member: GroupMemberDto } | { kind: 'meeting'; openedId: string } | null;

/**
 * The group chat route (design 14): the member-only messages of one group, newest at the
 * bottom, with a composer pinned above the keyboard.
 *
 * - **Access** is the source's decision, as on the group screen: a malformed ID, an anonymous
 *   viewer, a non-member, an unknown group and an expired history all show the same unavailable
 *   state, and a denial while open removes the group's private reads at once.
 * - **History:** the latest page first (`chatHistoryQuery`); "Load earlier messages" reads the
 *   page before it, keeping the reader's place, until the start of the chat. Messages are shown
 *   once each, ordered by sequence, with sender and time; another member's message opens that
 *   member's menu (`MemberMenu`). New messages arrive through the group subscription, which
 *   rereads the history, and scroll into view only while the reader is at the end.
 * - **Sending:** the text is trimmed and its line endings normalized (`toChatText`); it shows at
 *   once as "Sending…", then as the source's stored message. The composer is read-only while a
 *   message is on its way, so messages keep their order. A message the source could not confirm
 *   goes back in the composer with its client message ID, so sending it again cannot post it
 *   twice; if the history then shows it was stored after all, the composer lets it go. A fuller failed-message view is CHAT-001-C's. Analytics record only that a send was
 *   pressed and confirmed, never the text.
 * - **Closed groups:** history stays readable; the composer is replaced by a note that sending is
 *   over (the full read-only view, 36, is CHAT-001-C's).
 *
 * Message text never reaches a log, analytics or a notification.
 */
export function ChatScreen({ groupId, onBack, onGoHome }: ChatScreenProps) {
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
  const viewer = useViewer();
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

  const denied = (error: DataError | null) =>
    error?.code === 'MEMBERSHIP_REQUIRED' || error?.code === 'HISTORY_EXPIRED';
  const [revoked, setRevoked] = useState(false);
  const lostAccess = member !== null && (revoked || denied(groupQuery.error) || denied(history.error));
  useEffect(() => {
    if (!lostAccess || member === null || groupId === undefined) return;
    void queryClient.cancelQueries({ queryKey: queryKeys.group(member, groupId) });
    queryClient.removeQueries({ queryKey: queryKeys.group(member, groupId) });
  }, [lostAccess, member, groupId, queryClient]);

  const [draft, setDraft] = useState('');
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  /** The last unconfirmed message: sending the same text again reuses its client message ID. */
  const [unconfirmed, setUnconfirmed] = useState<{ clientMessageId: string; text: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ChatSheet>(null);

  const send = useMutation<ChatMessageDto, DataError, { clientMessageId: string; text: string }>({
    mutationFn: (input) => withDataErrors(dataSource.chat.send(groupId ?? '', input)),
    onSuccess: (stored, input) => {
      analytics.track('message_sent');
      setOutgoing((current) =>
        current.map((sent) => (sent.clientMessageId === input.clientMessageId ? { ...sent, stored } : sent)),
      );
      if (member !== null && groupId !== undefined) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.chatHistory(member, groupId) });
      }
    },
    onError: (error, input) => {
      setOutgoing((current) => current.filter((sent) => sent.clientMessageId !== input.clientMessageId));
      const outcome = describeSendError(error);
      if (outcome.kind === 'revoked') {
        setRevoked(true);
        return;
      }
      setFailure(outcome.message);
      if (outcome.kind === 'closed') {
        void groupQuery.refetch();
        return;
      }
      // The composer was read-only while sending, so it is still empty: the text goes back.
      setDraft(input.text);
      if (outcome.kind === 'retry') setUnconfirmed(input);
    },
  });

  // Keep only outgoing messages no history page holds yet (adjusted during render, not in an effect).
  const pages = history.data?.pages ?? [];
  const stillPending = member === null ? outgoing : pendingOutgoing(pages, outgoing, member.userId);
  if (stillPending.length !== outgoing.length) setOutgoing(stillPending);
  // An unconfirmed message the source did store (its answer was lost) shows up in the history:
  // it was sent, so the composer no longer holds it.
  if (
    member !== null &&
    unconfirmed !== null &&
    pages.some((page) =>
      page.messages.some(
        (message) => message.sender.id === member.userId && message.clientMessageId === unconfirmed.clientMessageId,
      ),
    )
  ) {
    setUnconfirmed(null);
    setFailure(null);
    if (toChatText(draft) === unconfirmed.text) setDraft('');
  }

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

  function submit() {
    if (text === null || sending) return;
    const clientMessageId = unconfirmed?.text === text ? unconfirmed.clientMessageId : createOperationId();
    analytics.track('message_send_clicked');
    atEnd.current = true;
    setOutgoing((current) => [...current, { clientMessageId, text, stored: null }]);
    setDraft('');
    setUnconfirmed(null);
    setFailure(null);
    send.mutate({ clientMessageId, text });
  }

  const memberOf = (message: ChatMessageDto) =>
    message.sender.id === member.userId
      ? null
      : (group.members.find((entry) => entry.user.id === message.sender.id) ?? null);

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
                  if (failure !== null) setFailure(null);
                }}
                multiline
                maxLength={CHAT_POLICY.maxTextLength}
                disabled={sending}
                error={failure ?? undefined}
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
          <Notice
            tone="warning"
            message="This group has closed. Sending is unavailable; the history stays for up to an hour."
          />
        )
      }
    >
      <ScreenHeader
        title={`${group.destination.label} · ${group.members.length} ${group.members.length === 1 ? 'person' : 'people'}`}
        onBack={onBack}
        backLabel="Back to group"
      />
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
            No messages yet. Say hello and agree where to meet.
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
              onMember={(found) => setSheet({ kind: 'member', member: found })}
              memberOf={memberOf}
            />
          ))}
        </View>
      </ScrollView>
      <SheetHost open={sheet !== null} onDismiss={() => setSheet(null)}>
        {sheet?.kind === 'member' ? (
          <MemberMenu member={sheet.member} onClose={() => setSheet(null)} />
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
 * reads "You · Sending…" until the source stores it.
 */
function MessageRow({
  entry,
  viewerId,
  memberOf,
  onMember,
}: {
  entry: TimelineEntry;
  viewerId: string;
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
  const sender = memberOf(entry.message);
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
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: {
    backgroundColor: colors.soft,
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
