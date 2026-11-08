import {
  CHAT_POLICY,
  ChatMessageCreatedEventSchema,
  ChatMessagePageSchema,
  ChatMessageSchema,
  GROUP_POLICY,
  type ApiErrorCode,
  type ChatHistoryQueryInput,
  type DomainEventDto,
} from '@ride-match/contracts';

import type { AppDataSource } from '../src/data/AppDataSource';
import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import { CHAT_REPLY_DELAY_MS, SIMULATED_REPLIES } from '../src/data/mock/chat';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

const START = Date.parse('2026-11-01T09:00:00.000Z');
const SECOND = 1000;
/** A synthetic exact pickup point in the demo city, never shown publicly. */
const ORIGIN = { latitude: 42.8712, longitude: 74.5934 };

let simulators: Simulator<MockWorld>[] = [];
let operations = 0;
/** A deterministic synthetic UUID for operation `n`, as `OperationIdSchema` requires. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const nextId = () => uuid(++operations);

/** Scenario A: its forming TSUM group (Gulnara, Ilyas, Jyldyz) has three seeded messages. */
function world() {
  const simulator = createMockSimulator('active-neighborhood', {
    latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS },
  });
  simulators.push(simulator);
  return simulator;
}

type Rider = { dataSource: AppDataSource; userId: string; rideId: string };

/** A rider signed in on the shared simulator with an active request; numbers from Ofcom's fiction range. */
async function rider(simulator: Simulator<MockWorld>, n: number, options: { request?: boolean } = {}): Promise<Rider> {
  const session = { accessToken: null as string | null };
  const dataSource = createMockDataSource(simulator, { accessToken: () => session.accessToken });
  const challenge = await settle(
    dataSource.auth.requestOtp({ phoneNumber: `+4477009003${String(n).padStart(2, '0')}` }),
  );
  const signedIn = await settle(dataSource.auth.verifyOtp({ challengeId: challenge.id, code: DEMO_OTP_CODE }));
  session.accessToken = signedIn.accessToken;
  if (options.request === false) return { dataSource, userId: signedIn.user.id, rideId: '' };
  const ride = await settle(
    dataSource.rides.create({
      operationId: nextId(),
      origin: { source: 'manual', coordinates: ORIGIN },
      destinationPlaceId: 'place_tsum',
      departureOffsetMinutes: 5,
    }),
  );
  return { dataSource, userId: signedIn.user.id, rideId: ride.id };
}

const tsumGroup = (simulator: Simulator<MockWorld>) =>
  [...simulator.state.groups.values()].find((group) => group.status === 'forming')!;

/** Joins `who` to a ride or group and returns the group's ID. */
async function joinTarget(who: Rider, target: { kind: 'ride' | 'group'; id: string }): Promise<string> {
  const result = await settle(who.dataSource.groups.join({ operationId: nextId(), rideRequestId: who.rideId, target }));
  return result.group.id;
}

/** A rider in the seeded TSUM group, which already has three messages. */
async function memberOfTsum(simulator: Simulator<MockWorld>, n = 1) {
  const me = await rider(simulator, n);
  const groupId = await joinTarget(me, { kind: 'group', id: tsumGroup(simulator).id });
  return { me, groupId };
}

/** Two signing-in riders in a new group of two; `coordinator` coordinates it, so a test can close it. */
async function pairOfRiders(simulator: Simulator<MockWorld>) {
  const coordinator = await rider(simulator, 11);
  const member = await rider(simulator, 12);
  const groupId = await joinTarget(member, { kind: 'ride', id: coordinator.rideId });
  return { coordinator, member, groupId };
}

const send = (who: Rider, groupId: string, text: string, clientMessageId = nextId()) =>
  settle(who.dataSource.chat.send(groupId, { clientMessageId, text }));
const history = (who: Rider, groupId: string, input: ChatHistoryQueryInput) =>
  settle(who.dataSource.chat.getHistory(groupId, input));

const sourceError = (code: ApiErrorCode) =>
  expect.objectContaining({ kind: 'source', body: expect.objectContaining({ code }) });

function recordEvents(simulator: Simulator<MockWorld>) {
  const events: DomainEventDto[] = [];
  simulator.subscribe((event) => events.push(event));
  return () => events.filter((event) => event.type === 'chat.message.created');
}

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  for (const simulator of simulators) simulator.dispose();
  simulators = [];
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('sending', () => {
  it('stores the text with the source’s sender, time and next sequence, and tells the members', async () => {
    const simulator = world();
    const { me, groupId } = await memberOfTsum(simulator);
    const chatEvents = recordEvents(simulator);
    const clientMessageId = nextId();

    const message = await send(me, groupId, 'Hello!\nI’m by the entrance.', clientMessageId);

    expect(ChatMessageSchema.parse(message)).toEqual(message);
    expect(message).toMatchObject({
      groupId,
      sender: { id: me.userId },
      text: 'Hello!\nI’m by the entrance.',
      sequence: 4,
      clientMessageId,
    });
    expect(Date.parse(message.createdAt)).toBeGreaterThanOrEqual(START);
    expect(chatEvents().map((event) => ChatMessageCreatedEventSchema.parse(event))).toEqual([
      expect.objectContaining({ audience: { kind: 'group', groupId }, payload: { message } }),
    ]);
  });

  it('rejects text out of bounds and fields only the source sets, storing nothing', async () => {
    const simulator = world();
    const { me, groupId } = await memberOfTsum(simulator);
    const invalid = [
      { clientMessageId: nextId(), text: '' },
      { clientMessageId: nextId(), text: ' padded' },
      { clientMessageId: nextId(), text: 'tab\there' },
      { clientMessageId: nextId(), text: 'x'.repeat(CHAT_POLICY.maxTextLength + 1) },
      { clientMessageId: 'not-a-uuid', text: 'Hi' },
      { clientMessageId: nextId(), text: 'Hi', sender: { id: 'user_1', displayName: 'Aida', avatarUrl: null } },
      { clientMessageId: nextId(), text: 'Hi', sequence: 1 },
    ];

    for (const input of invalid) {
      await expect(settle(me.dataSource.chat.send(groupId, input as never))).rejects.toEqual(
        sourceError('VALIDATION_FAILED'),
      );
    }
    expect(simulator.state.messages.get(groupId)).toHaveLength(3);

    const longest = await send(me, groupId, 'x'.repeat(CHAT_POLICY.maxTextLength));
    expect(longest.sequence).toBe(4);
  });

  it('returns the stored message for a retry, without a second message or event', async () => {
    const simulator = world();
    const { me, groupId } = await memberOfTsum(simulator);
    const chatEvents = recordEvents(simulator);
    const clientMessageId = nextId();

    const first = await send(me, groupId, 'On my way', clientMessageId);
    const retry = await send(me, groupId, 'On my way', clientMessageId);

    expect(retry).toEqual(first);
    expect(simulator.state.messages.get(groupId)).toHaveLength(4);
    expect(chatEvents()).toHaveLength(1);
    await expect(send(me, groupId, 'Something else', clientMessageId)).rejects.toEqual(
      sourceError('IDEMPOTENCY_CONFLICT'),
    );
  });

  it('keeps one message when the answer is lost after the source stored it', async () => {
    const simulator = world();
    const { me, groupId } = await memberOfTsum(simulator);
    const clientMessageId = nextId();
    simulator.failNext({ kind: 'network', afterCommit: true }, 'chat.send');

    await expect(send(me, groupId, 'See you soon', clientMessageId)).rejects.toMatchObject({ kind: 'network' });
    const retry = await send(me, groupId, 'See you soon', clientMessageId);

    expect(retry).toMatchObject({ sequence: 4, clientMessageId });
    expect(simulator.state.messages.get(groupId)).toHaveLength(4);
  });

  it('stores nothing when the request never reached the source, so the retry stores it once', async () => {
    const simulator = world();
    const { me, groupId } = await memberOfTsum(simulator);
    const clientMessageId = nextId();
    simulator.failNext({ kind: 'network' }, 'chat.send');

    await expect(send(me, groupId, 'Hello', clientMessageId)).rejects.toMatchObject({ kind: 'network' });
    expect(simulator.state.messages.get(groupId)).toHaveLength(3);
    await expect(send(me, groupId, 'Hello', clientMessageId)).resolves.toMatchObject({ sequence: 4 });
  });

  it('refuses a new message to a closed group but still returns a retried one', async () => {
    const simulator = world();
    const { coordinator, member, groupId } = await pairOfRiders(simulator);
    const clientMessageId = nextId();
    const sent = await send(member, groupId, 'Ready when you are', clientMessageId);

    await settle(
      coordinator.dataSource.groups.updateStatus(groupId, {
        operationId: nextId(),
        status: 'cancelled',
        expectedVersion: 1,
      }),
    );

    await expect(send(member, groupId, 'Ready when you are', clientMessageId)).resolves.toEqual(sent);
    await expect(send(member, groupId, 'Anyone there?')).rejects.toEqual(sourceError('GROUP_CLOSED'));
    await expect(send(coordinator, groupId, 'Sorry, cancelled')).rejects.toEqual(sourceError('GROUP_CLOSED'));
  });
});

describe('access', () => {
  it('lets only current members read and send, never revealing whether a group exists', async () => {
    const simulator = world();
    const { groupId } = await memberOfTsum(simulator);
    const outsider = await rider(simulator, 2);
    const anonymous = createMockDataSource(simulator);

    for (const id of [groupId, 'group_unknown']) {
      await expect(history(outsider, id, { limit: 10 })).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
      await expect(send(outsider, id, 'Hi')).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    }
    await expect(settle(anonymous.chat.getHistory(groupId, { limit: 10 }))).rejects.toEqual(
      sourceError('UNAUTHENTICATED'),
    );
  });

  it('ends a member’s access as they leave, a retry of their own earlier send included', async () => {
    const simulator = world();
    const { me, groupId } = await memberOfTsum(simulator);
    const clientMessageId = nextId();
    await send(me, groupId, 'Bye for now', clientMessageId);

    await settle(me.dataSource.groups.leave(groupId, { operationId: nextId() }));

    await expect(history(me, groupId, { limit: 10 })).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    await expect(send(me, groupId, 'Bye for now', clientMessageId)).rejects.toEqual(sourceError('MEMBERSHIP_REQUIRED'));
    // The message stays in the group's chat, still from them.
    expect(simulator.state.messages.get(groupId)?.[3]).toMatchObject({ senderId: me.userId, text: 'Bye for now' });
  });

  it('keeps a closed group’s history readable by its members at closure until it expires', async () => {
    const simulator = world();
    const { coordinator, member, groupId } = await pairOfRiders(simulator);
    await send(member, groupId, 'Thanks!');
    await settle(
      coordinator.dataSource.groups.updateStatus(groupId, {
        operationId: nextId(),
        status: 'cancelled',
        expectedVersion: 1,
      }),
    );

    await expect(history(coordinator, groupId, { limit: 10 })).resolves.toMatchObject({
      messages: [expect.objectContaining({ text: 'Thanks!' })],
    });

    // Pass the hour in steps, so the groups' timed events run in order.
    for (let minute = 0; minute < GROUP_POLICY.historyRetentionSeconds / 60; minute += 1) {
      await jest.advanceTimersByTimeAsync(60 * SECOND);
    }
    // Tokens last 15 minutes, so the member signs in again on the same number.
    const again = await rider(simulator, 12, { request: false });
    await expect(history(again, groupId, { limit: 10 })).rejects.toEqual(sourceError('HISTORY_EXPIRED'));
    await expect(send(again, groupId, 'Thanks!')).rejects.toEqual(sourceError('HISTORY_EXPIRED'));
  });
});

describe('history pages', () => {
  /** A TSUM member after sending enough messages for several pages: sequences 1–10. */
  async function longChat() {
    const simulator = world();
    const { me, groupId } = await memberOfTsum(simulator);
    for (let n = 4; n <= 10; n += 1) await send(me, groupId, `Message ${n}`);
    return { simulator, me, groupId };
  }

  it('reads the latest page, then older pages until the first message, each message once', async () => {
    const { me, groupId } = await longChat();

    const latest = await history(me, groupId, { limit: 4 });
    expect(ChatMessagePageSchema.parse(latest)).toEqual(latest);
    expect(latest.messages.map((message) => message.sequence)).toEqual([7, 8, 9, 10]);
    expect(latest.latestSequence).toBe(10);

    const sequences = latest.messages.map((message) => message.sequence);
    let cursor = latest.olderCursor;
    while (cursor !== null) {
      const page = ChatMessagePageSchema.parse(await history(me, groupId, { beforeCursor: cursor, limit: 4 }));
      sequences.unshift(...page.messages.map((message) => message.sequence));
      cursor = page.olderCursor;
    }
    expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('catches up page by page after a sequence until a page ends at the latest', async () => {
    const { me, groupId } = await longChat();

    const caughtUp: number[] = [];
    let after = 2;
    for (;;) {
      const page = ChatMessagePageSchema.parse(await history(me, groupId, { afterSequence: after, limit: 3 }));
      caughtUp.push(...page.messages.map((message) => message.sequence));
      const last = page.messages[page.messages.length - 1];
      if (last === undefined || last.sequence === page.latestSequence) break;
      after = last.sequence;
    }
    expect(caughtUp).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);

    await expect(history(me, groupId, { afterSequence: 10, limit: 3 })).resolves.toEqual({
      messages: [],
      olderCursor: null,
      latestSequence: 10,
    });
    await expect(history(me, groupId, { afterSequence: 25, limit: 3 })).resolves.toMatchObject({
      messages: [],
      latestSequence: 10,
    });
  });

  it('reads an empty chat as an empty page', async () => {
    const simulator = world();
    const { member, groupId } = await pairOfRiders(simulator);

    await expect(history(member, groupId, { limit: 10 })).resolves.toEqual({
      messages: [],
      olderCursor: null,
      latestSequence: 0,
    });
  });

  it('rejects both positions together, and a cursor that is malformed or from another group', async () => {
    const { simulator, me, groupId } = await longChat();
    const { olderCursor } = await history(me, groupId, { limit: 4 });
    const other = await pairOfRiders(simulator);
    await send(other.member, other.groupId, 'One');
    await send(other.member, other.groupId, 'Two');
    const otherCursor = (await history(other.member, other.groupId, { limit: 1 })).olderCursor!;

    await expect(
      settle(me.dataSource.chat.getHistory(groupId, { beforeCursor: olderCursor!, afterSequence: 2, limit: 4 })),
    ).rejects.toEqual(sourceError('VALIDATION_FAILED'));
    for (const beforeCursor of ['garbage', otherCursor, olderCursor!.replace(/~\d+$/, '~99')]) {
      await expect(history(me, groupId, { beforeCursor, limit: 4 })).rejects.toEqual(sourceError('VALIDATION_FAILED'));
    }
    await expect(history(other.member, other.groupId, { beforeCursor: otherCursor, limit: 4 })).resolves.toMatchObject({
      messages: [expect.objectContaining({ text: 'One' })],
    });
  });
});

describe('simulated replies', () => {
  it('has the earliest demo rider answer after a pause, telling the members', async () => {
    const simulator = world();
    const { me, groupId } = await memberOfTsum(simulator);
    const chatEvents = recordEvents(simulator);
    const gulnara = tsumGroup(simulator).coordinatorId;

    await send(me, groupId, 'Hi everyone');
    await jest.advanceTimersByTimeAsync(CHAT_REPLY_DELAY_MS);

    const reply = ChatMessageCreatedEventSchema.parse(chatEvents()[1]).payload.message;
    // Gulnara has written once before, so she gives the second answer.
    expect(reply).toMatchObject({ sender: { id: gulnara }, text: SIMULATED_REPLIES[1], sequence: 5 });
    await expect(history(me, groupId, { afterSequence: 4, limit: 5 })).resolves.toMatchObject({
      messages: [reply],
    });
  });

  it('answers only the last of several quick messages, and only demo riders answer', async () => {
    const simulator = world();
    const { me, groupId } = await memberOfTsum(simulator);
    await send(me, groupId, 'One');
    await send(me, groupId, 'Two');
    await jest.advanceTimersByTimeAsync(CHAT_REPLY_DELAY_MS);
    expect(simulator.state.messages.get(groupId)).toHaveLength(6);

    // A group of two riders who sign in has no demo rider to answer.
    const pair = await pairOfRiders(simulator);
    await send(pair.member, pair.groupId, 'Hello?');
    await jest.advanceTimersByTimeAsync(CHAT_REPLY_DELAY_MS);
    expect(simulator.state.messages.get(pair.groupId)).toHaveLength(1);
  });
});
