import { NotificationPayloadSchema, type NotificationPayloadDto } from '@ride-match/contracts';

import type { AppDataSource } from '../src/data/AppDataSource';
import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import { MEETING_POINT_DELAY_MS } from '../src/data/mock/meetingPoints';
import { startMockPush } from '../src/data/mock/push';
import type { MockScenarioKey } from '../src/data/mock/scenarios';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

let simulators: Simulator<MockWorld>[] = [];
let operations = 0;
const nextId = () => `11111111-1111-4111-8111-${String(++operations).padStart(12, '0')}`;
/** A synthetic installation per rider. */
const installation = (n: number) => `b1b2c3d4-0000-4000-8000-${String(n).padStart(12, '0')}`;

function world(scenario: MockScenarioKey) {
  const simulator = createMockSimulator(scenario, { latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS } });
  simulators.push(simulator);
  const delivered: { installationId: string; payload: NotificationPayloadDto }[] = [];
  const stop = startMockPush(simulator, (installationId, payload) => delivered.push({ installationId, payload }));
  return { simulator, delivered, stop };
}

const userNamed = (simulator: Simulator<MockWorld>, name: string) =>
  [...simulator.state.users.values()].find((user) => user.displayName === name)!.id;

/**
 * Signs in as rider `name` (a seeded rider, linked to a synthetic number from Ofcom's range for
 * fiction) and registers installation `n` with `permission`.
 */
async function device(
  simulator: Simulator<MockWorld>,
  name: string,
  n: number,
  permission: 'granted' | 'denied' = 'granted',
): Promise<{ dataSource: AppDataSource; userId: string; refreshToken: string }> {
  const phoneNumber = `+4477009006${String(n).padStart(2, '0')}`;
  const userId = userNamed(simulator, name);
  simulator.state.auth.accounts.set(phoneNumber, userId);
  const session = { accessToken: null as string | null };
  const dataSource = createMockDataSource(simulator, { accessToken: () => session.accessToken });
  const challenge = await settle(dataSource.auth.requestOtp({ phoneNumber }));
  const signedIn = await settle(dataSource.auth.verifyOtp({ challengeId: challenge.id, code: DEMO_OTP_CODE }));
  session.accessToken = signedIn.accessToken;
  await settle(
    dataSource.devices.register(installation(n), {
      pushToken: `ExponentPushToken[test-${n}]`,
      platform: 'android',
      permission,
    }),
  );
  return { dataSource, userId, refreshToken: signedIn.refreshToken };
}

const kinds = (delivered: { installationId: string; payload: NotificationPayloadDto }[]) =>
  delivered.map(({ installationId, payload }) => `${payload.kind} → ${installationId.slice(-2)}`);

describe('mock push service', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: Date.parse('2026-11-08T09:00:00.000Z') });
    operations = 0;
  });
  afterEach(() => {
    simulators.forEach((simulator) => simulator.dispose());
    simulators = [];
    jest.useRealTimers();
  });

  it('notifies the other members of a message, never its sender, with IDs and times only', async () => {
    const { simulator, delivered } = world('safety');
    const aida = await device(simulator, 'Aida', 1);
    await device(simulator, 'Bolot', 2);
    await device(simulator, 'Demo rider 123', 3);
    const group = [...simulator.state.groups.values()][0]!;

    const message = await settle(
      aida.dataSource.chat.send(group.id, { clientMessageId: nextId(), text: 'Meet at the bus stop by my flat' }),
    );

    // In member order: the demo rider joined before Bolot.
    expect(kinds(delivered)).toEqual(['chat.message_created → 03', 'chat.message_created → 02']);
    const [first] = delivered;
    expect(NotificationPayloadSchema.parse(first!.payload)).toMatchObject({
      kind: 'chat.message_created',
      groupId: group.id,
      messageId: message.id,
    });
    expect(JSON.stringify(delivered)).not.toContain('bus stop');
    // At most an hour, as the contract allows.
    expect(Date.parse(first!.payload.expiresAt) - Date.parse(first!.payload.issuedAt)).toBe(3600 * 1000);
  });

  it('delivers nothing to a denied permission or a signed-out session', async () => {
    const { simulator, delivered } = world('safety');
    const aida = await device(simulator, 'Aida', 4);
    await device(simulator, 'Bolot', 5, 'denied');
    const demo = await device(simulator, 'Demo rider 123', 6);
    await settle(demo.dataSource.auth.logout({ refreshToken: demo.refreshToken }));
    const group = [...simulator.state.groups.values()][0]!;

    await settle(aida.dataSource.chat.send(group.id, { clientMessageId: nextId(), text: 'Hello' }));

    expect(delivered).toEqual([]);
  });

  it('tells the members other than the coordinator that the group is ready', async () => {
    const { simulator, delivered } = world('safety');
    const aida = await device(simulator, 'Aida', 7);
    await device(simulator, 'Bolot', 8);
    const group = [...simulator.state.groups.values()][0]!;
    simulator.advanceTime(MEETING_POINT_DELAY_MS);
    expect(simulator.state.groups.get(group.id)!.meetingPoint).not.toBeNull();
    delivered.length = 0;

    await settle(
      aida.dataSource.groups.updateStatus(group.id, {
        operationId: nextId(),
        status: 'ready',
        expectedVersion: simulator.state.groups.get(group.id)!.version,
      }),
    );

    expect(kinds(delivered)).toEqual(['group.ready → 08']);
  });

  it('tells the members already in a group that someone joined, never the rider who joined', async () => {
    const { simulator, delivered } = world('safety');
    await device(simulator, 'Aida', 12);
    await device(simulator, 'Bolot', 13);
    const chinara = await device(simulator, 'Chinara', 14);
    const group = [...simulator.state.groups.values()][0]!;
    const ride = [...simulator.state.rides.values()].find((entry) => entry.userId === chinara.userId)!;

    await settle(
      chinara.dataSource.groups.join({
        operationId: nextId(),
        rideRequestId: ride.id,
        target: { kind: 'group', id: group.id },
      }),
    );

    expect(kinds(delivered)).toEqual(['group.member_joined → 12', 'group.member_joined → 13']);
  });

  it('tells the owner of a request about new matches, naming the target of a single one', async () => {
    const { simulator, delivered } = world('match-appears');
    simulator.state.users.set('usr_pushowner', { id: 'usr_pushowner', displayName: 'Push owner', avatarUrl: null });
    const owner = await device(simulator, 'Push owner', 9);
    await settle(
      owner.dataSource.rides.create({
        operationId: nextId(),
        origin: { source: 'manual', coordinates: { latitude: 42.8746, longitude: 74.6122 } },
        destinationPlaceId: 'place_asia_mall',
        departureOffsetMinutes: 5,
      }),
    );
    await jest.advanceTimersByTimeAsync(0);
    simulator.advanceTime(60_000);

    const matches = delivered.filter(({ payload }) => payload.kind === 'matches.available');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(({ installationId }) => installationId === installation(9))).toBe(true);
    const ride = [...simulator.state.rides.values()].find((entry) => entry.userId === owner.userId)!;
    const arrived = simulator.state.ownerMatches.get(ride.id)!.matches;
    const [first] = matches;
    expect(first!.payload).toMatchObject({ rideRequestId: ride.id });
    expect(matches).toHaveLength(arrived.length);
    expect(first!.payload).toMatchObject({ target: { kind: arrived[0]!.target.kind, id: arrived[0]!.target.id } });
  });

  it('stops delivering when stopped', async () => {
    const { simulator, delivered, stop } = world('safety');
    const aida = await device(simulator, 'Aida', 10);
    await device(simulator, 'Bolot', 11);
    stop();
    const group = [...simulator.state.groups.values()][0]!;
    await settle(aida.dataSource.chat.send(group.id, { clientMessageId: nextId(), text: 'Hello' }));
    expect(delivered).toEqual([]);
  });
});
