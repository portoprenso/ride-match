import { screen, userEvent } from '@testing-library/react-native';
import type { ChatMessageDto, ChatMessagePageDto } from '@ride-match/contracts';

import { CHAT_REPLY_DELAY_MS, SIMULATED_REPLIES, storeMessage } from '../src/data/mock/chat';
import { leaveGroup, updateGroupStatus } from '../src/data/mock/groups';
import {
  buildTimeline,
  describeSendError,
  describeSender,
  pendingOutgoing,
  toChatText,
} from '../src/features/chat/chatTimeline';
import { appendMessages, newestHeldSequence } from '../src/data/chatHistory';
import { DataError } from '../src/data/errors';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import {
  ANSWER_MS,
  actAs,
  appRider,
  captureSimulator,
  confirmJoiningAida,
  recordAnalytics,
  signInWithDemoCode,
  withActiveRequest,
} from './helpers/groupFlow';
import { BLOCKED, device, openHome, press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** The app rider joins Aida's ride, then opens the group chat; returns the simulator and group. */
async function openChatWithAida(before?: (simulator: Simulator<MockWorld>, groupId: string) => void) {
  const captured = captureSimulator();
  await withActiveRequest();
  await confirmJoiningAida();
  await press('Join Aida');
  await wait(ANSWER_MS);
  const simulator = captured.simulator!;
  const group = [...simulator.state.groups.values()].find((candidate) =>
    candidate.members.some((member) => member.userId === appRider(simulator)),
  )!;
  before?.(simulator, group.id);
  await press('Open group chat');
  await wait(2 * ANSWER_MS);
  return { simulator, group };
}

async function typeMessage(text: string) {
  await userEvent.type(screen.getByLabelText('Message'), text);
}

/** The message texts on screen, top to bottom. */
const shownTexts = (pattern: RegExp) => screen.getAllByText(pattern).map((node) => node.props.children as string);

describe('the group chat', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('sends a message, shows it sending, then as stored, and a demo rider answers (14)', async () => {
    const events = recordAnalytics();
    const { simulator, group } = await openChatWithAida();

    expect(screen.getByRole('header', { name: 'Asia Mall · 2 people' })).toBeOnTheScreen();
    expect(screen.getByText('Temporary group chat')).toBeOnTheScreen();
    expect(screen.getByText('No messages yet. Say hello and agree where to meet.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    await typeMessage('  Hi Aida!  ');
    await press('Send message');

    // Shown at once, trimmed, before the source answers.
    expect(screen.getByText('You · Sending…')).toBeOnTheScreen();
    expect(screen.getByText('Hi Aida!')).toBeOnTheScreen();
    expect(screen.getByLabelText('Message').props.value).toBe('');
    await wait(2 * ANSWER_MS);

    expect(screen.queryByText('You · Sending…')).not.toBeOnTheScreen();
    expect(screen.getByText(/^You · \d{1,2}:\d{2}/)).toBeOnTheScreen();
    expect(screen.getAllByText('Hi Aida!')).toHaveLength(1);
    expect(simulator.state.messages.get(group.id)).toEqual([expect.objectContaining({ text: 'Hi Aida!' })]);
    const chat = events().filter((event) => event.name.startsWith('message_'));
    expect(chat).toEqual([
      expect.objectContaining({ name: 'message_send_clicked', properties: {} }),
      expect.objectContaining({ name: 'message_sent', properties: {} }),
    ]);

    // Aida, a demo rider, answers a few seconds later through the group subscription.
    await wait(CHAT_REPLY_DELAY_MS);
    await wait(2 * ANSWER_MS);
    expect(screen.getByText(SIMULATED_REPLIES[0])).toBeOnTheScreen();
    expect(screen.getByText(/^Aida · \d{1,2}:\d{2}/)).toBeOnTheScreen();
    expect(shownTexts(/^(Hi Aida!|Sounds good, see you there\.)$/)).toEqual(['Hi Aida!', SIMULATED_REPLIES[0]]);
  });

  it('opens on the latest messages and loads earlier ones in order, each once', async () => {
    await openChatWithAida((simulator, groupId) => {
      const aida = simulator.state.groups.get(groupId)!.coordinatorId;
      simulator.schedule(0, (context) => {
        for (let n = 1; n <= 45; n += 1) {
          storeMessage(context.state, context.ids, groupId, {
            senderId: aida,
            text: `Note ${n}`,
            createdAt: context.now,
          });
        }
      });
    });

    const latest = shownTexts(/^Note \d+$/);
    expect(latest).toHaveLength(30);
    expect(latest[0]).toBe('Note 16');
    expect(latest.at(-1)).toBe('Note 45');
    expect(screen.queryByText('Start of this group’s chat')).not.toBeOnTheScreen();

    await press('Load earlier messages');
    await wait(2 * ANSWER_MS);

    expect(shownTexts(/^Note \d+$/)).toEqual(Array.from({ length: 45 }, (_, index) => `Note ${index + 1}`));
    expect(screen.getByText('Start of this group’s chat')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Load earlier messages' })).not.toBeOnTheScreen();
  });

  it('keeps a message that wasn’t sent, never resends it on reconnect, and retries it under the same ID (45)', async () => {
    const events = recordAnalytics();
    const { simulator, group } = await openChatWithAida();
    simulator.failNext({ kind: 'network' }, 'chat.send');

    await typeMessage('At the entrance');
    await press('Send message');
    await wait(2 * ANSWER_MS);

    expect(screen.getByText('You · not sent')).toBeOnTheScreen();
    expect(screen.getByText('At the entrance')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Your text is preserved. Retry sends the same message once; reconnecting doesn’t send it automatically.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Check latest messages' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Message').props.value).toBe('');

    // The connection drops and returns: the chat says so, and nothing is sent by itself.
    simulator.setConnection('disconnected');
    await wait();
    expect(screen.getByText('Connection interrupted')).toBeOnTheScreen();
    simulator.setConnection('connected');
    await wait(2 * ANSWER_MS);
    expect(screen.queryByText('Connection interrupted')).not.toBeOnTheScreen();
    expect(simulator.state.messages.get(group.id) ?? []).toHaveLength(0);
    expect(screen.getByText('You · not sent')).toBeOnTheScreen();

    await press('Retry message');
    await wait(2 * ANSWER_MS);

    const stored = simulator.state.messages.get(group.id)!;
    expect(stored).toHaveLength(1);
    expect(screen.queryByText('You · not sent')).not.toBeOnTheScreen();
    expect(screen.getAllByText('At the entrance')).toHaveLength(1);
    const sends = events().filter((event) => event.name.startsWith('message_'));
    expect(sends.map((event) => event.name)).toEqual(['message_send_clicked', 'message_send_clicked', 'message_sent']);
  });

  it('shows a message once when its answer was lost but the source stored it', async () => {
    const { simulator, group } = await openChatWithAida();
    simulator.failNext({ kind: 'network', afterCommit: true }, 'chat.send');

    await typeMessage('By the doors');
    await press('Send message');
    await wait(2 * ANSWER_MS);

    // The source stored it and told the group, so the history shows it and nothing is left unsent.
    expect(simulator.state.messages.get(group.id)).toHaveLength(1);
    expect(screen.getAllByText('By the doors')).toHaveLength(1);
    expect(screen.queryByText('You · not sent')).not.toBeOnTheScreen();
  });

  it('catches up every missed message, page by page, in order', async () => {
    const { simulator, group } = await openChatWithAida();
    // Seventy messages the screen never heard about (no events), then a send that fails.
    const aida = group.coordinatorId;
    simulator.schedule(0, (context) => {
      for (let n = 1; n <= 70; n += 1) {
        storeMessage(context.state, context.ids, group.id, {
          senderId: aida,
          text: `Missed ${n}`,
          createdAt: context.now,
        });
      }
    });
    simulator.failNext({ kind: 'network' }, 'chat.send');
    await typeMessage('Anyone there?');
    await press('Send message');
    await wait(2 * ANSWER_MS);
    expect(screen.queryByText('Missed 1')).not.toBeOnTheScreen();

    await press('Check latest messages');
    await wait(4 * ANSWER_MS);

    expect(screen.getByText('70 new messages.')).toBeOnTheScreen();
    expect(shownTexts(/^Missed \d+$/)).toEqual(Array.from({ length: 70 }, (_, index) => `Missed ${index + 1}`));
    expect(screen.getByText('You · not sent')).toBeOnTheScreen();

    await press('Check latest messages');
    await wait(2 * ANSWER_MS);
    expect(screen.getByText('You’re up to date.')).toBeOnTheScreen();
  });

  it('clears the typed text and the chat when access ends', async () => {
    const { simulator, group } = await openChatWithAida();
    // The rider leaves on another device: their access ends there.
    const elsewhere = await actAs(simulator, appRider(simulator), '+447700900242');
    elsewhere.act((context, token) =>
      leaveGroup(context, token, group.id, { operationId: '00000000-0000-4000-8000-000000000242' }),
    );
    for (let step = 0; step < 10; step += 1) await wait(ANSWER_MS / 5);

    await typeMessage('Still here?');
    await press('Send message');
    for (let step = 0; step < 10; step += 1) await wait(ANSWER_MS / 5);

    expect(screen.getByText(/^You no longer have access\./)).toBeOnTheScreen();
    expect(screen.queryByText('Still here?')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Message')).not.toBeOnTheScreen();
  });

  it('opens another member’s menu from their message', async () => {
    await openChatWithAida((simulator, groupId) => {
      const aida = simulator.state.groups.get(groupId)!.coordinatorId;
      simulator.schedule(0, (context) =>
        storeMessage(context.state, context.ids, groupId, {
          senderId: aida,
          text: 'Meet by the main entrance?',
          createdAt: context.now,
        }),
      );
    });

    await press(/^Aida · .*Meet by the main entrance\?$/);

    expect(screen.getByRole('header', { name: 'Aida' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Report Aida' })).toBeEnabled();
    await press('Close');
    expect(screen.queryByRole('header', { name: 'Aida' })).not.toBeOnTheScreen();
  });

  it('keeps the history but offers no composer once the group closes', async () => {
    const { simulator, group } = await openChatWithAida();
    const aida = await actAs(simulator, group.coordinatorId, '+447700900241');
    aida.act((context, token) =>
      updateGroupStatus(context, token, group.id, {
        operationId: '00000000-0000-4000-8000-000000000241',
        status: 'cancelled',
        expectedVersion: group.version,
      }),
    );
    // Short steps: the home card's clock unmounts as the request ends (see DEVELOPMENT).
    for (let step = 0; step < 10; step += 1) await wait(ANSWER_MS / 5);

    expect(screen.getByRole('header', { name: 'Group chat · closed' })).toBeOnTheScreen();
    expect(screen.getByText('Read-only · group closed')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'This group has closed.' })).toBeOnTheScreen();
    expect(screen.getByText('The coordinator cancelled it. No one can join or send messages now.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sending is unavailable' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Message')).not.toBeOnTheScreen();

    // An hour later the history is no longer kept, and the chat leaves the screen (37).
    for (let minute = 0; minute < 61; minute += 1) await wait(60 * 1000);
    expect(screen.getByText(/^You no longer have access\./)).toBeOnTheScreen();
  });

  it('shows exactly one message in scenario H: a lost answer, a retry, a duplicate event', async () => {
    const captured = captureSimulator();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'failed-message';
    device({ permission: BLOCKED });
    await openHome();
    await press('Sign in');
    await signInWithDemoCode();
    await wait(ANSWER_MS);
    await press('Open my group');
    await wait(ANSWER_MS);
    await press('Open group chat');
    await wait(2 * ANSWER_MS);
    const simulator = captured.simulator!;
    const groupId = [...simulator.state.groups.keys()][0]!;
    expect(screen.getByText('Hi! Glad we’re going together.')).toBeOnTheScreen();
    const chatEvents: string[] = [];
    simulator.subscribe((event) => {
      if (event.type === 'chat.message.created') chatEvents.push(event.payload.message.id);
    });

    await typeMessage('I’m at the entrance now.');
    await press('Send message');
    await wait(2 * ANSWER_MS);
    expect(screen.getByText('You · not sent')).toBeOnTheScreen();

    await press('Retry message');
    await wait(2 * ANSWER_MS);

    // The retry found the stored message; its event then came twice.
    expect(chatEvents).toHaveLength(2);
    expect(new Set(chatEvents).size).toBe(1);
    expect(simulator.state.messages.get(groupId)).toHaveLength(3);
    expect(screen.getAllByText('I’m at the entrance now.')).toHaveLength(1);
    expect(screen.queryByText('You · not sent')).not.toBeOnTheScreen();
  });
});

describe('chat pieces', () => {
  const message = (sequence: number, senderId: string, clientMessageId: string): ChatMessageDto => ({
    id: `message_${sequence}`,
    groupId: 'group_1',
    sender: { id: senderId, displayName: senderId === 'user_me' ? 'Demo rider' : 'Aida', avatarUrl: null },
    text: `Message ${sequence}`,
    createdAt: '2026-11-08T09:41:00.000Z',
    sequence,
    clientMessageId,
  });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const page = (messages: ChatMessageDto[]): ChatMessagePageDto => ({
    messages,
    olderCursor: messages[0]?.sequence === 1 || messages.length === 0 ? null : 'cursor',
    latestSequence: 10,
  });

  it('merges pages and answers by message ID, in sequence order, with sending messages last', () => {
    const newest = page([message(3, 'user_aida', id(3)), message(4, 'user_me', id(4))]);
    const older = page([message(1, 'user_aida', id(1)), message(2, 'user_me', id(2))]);
    const outgoing = [
      // Stored and already in a page: shown once, from the page.
      { clientMessageId: id(4), text: 'Message 4', stored: message(4, 'user_me', id(4)), failed: null },
      // Stored, not yet in a page.
      { clientMessageId: id(5), text: 'Message 5', stored: message(5, 'user_me', id(5)), failed: null },
      { clientMessageId: id(6), text: 'Still sending', stored: null, failed: null },
      { clientMessageId: id(7), text: 'Not sent', stored: null, failed: 'retry' as const },
    ];

    const timeline = buildTimeline([newest, older], outgoing, 'user_me');

    expect(timeline.map((entry) => (entry.kind === 'message' ? entry.message.sequence : entry.text))).toEqual([
      1,
      2,
      3,
      4,
      5,
      'Still sending',
      'Not sent',
    ]);
    expect(timeline.filter((entry) => entry.kind === 'message' && entry.own)).toHaveLength(3);
    expect(pendingOutgoing([newest, older], outgoing, 'user_me').map((sent) => sent.clientMessageId)).toEqual([
      id(5),
      id(6),
      id(7),
    ]);
  });

  it('appends only messages that continue the held history, and reports duplicates and gaps', () => {
    const held = { pages: [page([message(3, 'user_aida', id(3)), message(4, 'user_me', id(4))])], pageParams: [null] };

    expect(appendMessages(held, [message(4, 'user_me', id(4))])).toEqual({ kind: 'duplicate' });
    expect(appendMessages(held, [message(2, 'user_aida', id(2))])).toEqual({ kind: 'duplicate' });
    expect(appendMessages(held, [message(6, 'user_aida', id(6))])).toEqual({ kind: 'gap' });
    const next = appendMessages(held, [
      message(6, 'user_aida', id(6)),
      message(5, 'user_aida', id(5)),
      message(4, 'user_me', id(4)),
    ]);
    expect(next.kind).toBe('appended');
    if (next.kind !== 'appended') return;
    expect(next.data.pages[0]!.messages.map((entry) => entry.sequence)).toEqual([3, 4, 5, 6]);
    expect(next.data.pages[0]!.latestSequence).toBe(10);
    expect(newestHeldSequence(next.data)).toBe(6);
  });

  it('cleans typed text as the contract requires, or finds nothing to send', () => {
    expect(toChatText('  Hello\r\nthere\t!  ')).toBe('Hello\nthere !');
    expect(toChatText(' \n\t ')).toBeNull();
  });

  it('names the sender, the viewer as “You”', () => {
    expect(describeSender(message(1, 'user_me', id(1)), 'user_me')).toMatch(/^You · /);
    expect(describeSender(message(1, 'user_aida', id(1)), 'user_me')).toMatch(/^Aida · /);
  });

  it('maps each send failure to what the viewer can do next', () => {
    const source = (code: string) =>
      new DataError('source', code, { body: { code: code as never, message: code, requestId: 'req_1' } });
    expect(describeSendError(source('MEMBERSHIP_REQUIRED')).kind).toBe('revoked');
    expect(describeSendError(source('HISTORY_EXPIRED')).kind).toBe('revoked');
    expect(describeSendError(source('GROUP_CLOSED')).kind).toBe('closed');
    expect(describeSendError(source('VALIDATION_FAILED')).kind).toBe('invalid');
    expect(describeSendError(source('SESSION_EXPIRED')).kind).toBe('sign-in');
    expect(describeSendError(new DataError('network', 'offline')).kind).toBe('retry');
  });
});
