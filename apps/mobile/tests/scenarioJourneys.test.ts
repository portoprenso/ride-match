import { JoinGroupResultSchema, NearbySnapshotSchema, NotificationPayloadSchema, type NotificationPayloadDto } from '@ride-match/contracts';

import { composeAppDataSource } from '../src/bootstrap/composeAppDataSource';
import { withSessionRenewal } from '../src/bootstrap/withSessionRenewal';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import { createMockDevControls } from '../src/data/mock/createMockDevControls';
import { MOCK_DEMO_SIGN_IN } from '../src/data/mock/auth';
import { startMockPush } from '../src/data/mock/push';
import { MOCK_SCENARIO_KEYS, type MockScenarioKey } from '../src/data/mock/scenarios';
import { queryKeys } from '../src/data/queryKeys';
import { createSessionController, type SessionController } from '../src/features/auth/createSessionController';
import { memoryCredentialStore } from './helpers/credentialStore';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

const START = Date.parse('2026-11-21T09:00:00Z');
const intent = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cleanups: (() => void)[] = [];

function setup(scenario: MockScenarioKey) {
  const simulator = createMockSimulator(scenario, { latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS } });
  cleanups.push(() => simulator.dispose());
  let access: string | null = null;
  const source = createMockDataSource(simulator, { accessToken: () => access });
  const signIn = async () => {
    const challenge = await settle(source.auth.requestOtp({ phoneNumber: MOCK_DEMO_SIGN_IN.phoneNumber }));
    const credentials = await settle(source.auth.verifyOtp({ challengeId: challenge.id, code: MOCK_DEMO_SIGN_IN.code }));
    access = credentials.accessToken;
    return credentials;
  };
  return { simulator, source, signIn };
}

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(START); });
afterEach(() => {
  cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
  jest.runAllTicks();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

it('D forms one group, then grows to four without auto-readiness or retry duplication', async () => {
  const { simulator, source, signIn } = setup('group-formation');
  await signIn();
  const own = (await settle(source.rides.getOwnRequest()))!;
  const target = [...simulator.state.rides.values()].find((ride) => simulator.state.users.get(ride.userId)?.displayName === 'Aida')!;
  const input = { operationId: intent(1), rideRequestId: own.id, target: { kind: 'ride' as const, id: target.id } };
  const joined = await settle(source.groups.join(input));
  expect(JoinGroupResultSchema.parse(joined).group.members).toHaveLength(2);
  await settle(source.groups.join(input));
  simulator.advanceTime(5000);
  expect((await settle(source.groups.getGroup(joined.group.id))).members).toHaveLength(3);
  simulator.advanceTime(5000);
  const full = await settle(source.groups.getGroup(joined.group.id));
  expect(full.members).toHaveLength(4);
  expect(full.status).toBe('forming');
  expect(simulator.state.groups.size).toBe(1);
});

it('E commits the competing join before the caller fails, leaving their request active', async () => {
  const { simulator, source, signIn } = setup('last-seat-conflict');
  await signIn();
  const own = (await settle(source.rides.getOwnRequest()))!;
  const groupId = [...simulator.state.groups.keys()][0]!;
  expect((await settle(source.groups.getPreview(groupId))).memberCount).toBe(3);
  await expect(settle(source.groups.join({ operationId: intent(2), rideRequestId: own.id, target: { kind: 'group', id: groupId } })))
    .rejects.toMatchObject({ code: 'GROUP_FULL' });
  expect((await settle(source.groups.getPreview(groupId))).memberCount).toBe(4);
  expect((await settle(source.rides.getOwnRequest()))?.status).toBe('active');
  expect(simulator.state.groups.get(groupId)!.members.some((member) => member.userId === own.user.id)).toBe(false);
});

it('F expires the existing request without automatically creating another', async () => {
  const { simulator, source, signIn } = setup('request-expiration');
  await signIn();
  expect((await settle(source.rides.getOwnRequest()))?.status).toBe('active');
  simulator.advanceTime(20000);
  const expired = await settle(source.rides.getOwnRequest());
  expect(expired?.status).toBe('expired');
  expect(simulator.state.rides.size).toBe(1);
});

it('G changes canonical history offline, rejects sends and recovers through a fresh read', async () => {
  const { simulator, source, signIn } = setup('offline-resync');
  await signIn();
  const groupId = [...simulator.state.groups.keys()][0]!;
  const before = await settle(source.chat.getHistory(groupId, { limit: 50 }));
  const connections: string[] = [];
  const stop = source.events.watchConnection((state) => connections.push(state));
  cleanups.push(stop);
  simulator.advanceTime(5000);
  await expect(source.chat.send(groupId, { clientMessageId: intent(3), text: 'This must not queue.' })).rejects.toMatchObject({ kind: 'network' });
  simulator.advanceTime(5000);
  simulator.advanceTime(5000);
  const recovered = await settle(source.chat.getHistory(groupId, { limit: 50 }));
  expect(recovered.messages).toHaveLength(before.messages.length + 1);
  expect(recovered.messages.at(-1)?.text).toBe('A plan update while you were offline.');
  expect(recovered.messages.some((message) => message.text === 'This must not queue.')).toBe(false);
  expect(connections).toEqual(['connected', 'disconnected', 'connected']);
});

it('I retains browsing and accepts an explicitly manual pickup without a device fix', async () => {
  const { source, signIn } = setup('location-unavailable');
  await signIn();
  const created = await settle(source.rides.create({
    operationId: intent(4), origin: { source: 'manual', coordinates: { latitude: 42.87, longitude: 74.59 } },
    destinationPlaceId: 'place_asia_mall', departureOffsetMinutes: 0,
  }));
  expect(created.origin.source).toBe('manual');
  expect(created.status).toBe('active');
});

it('K delivers generic ready/message payloads only to an eligible registration', async () => {
  const { simulator, source, signIn } = setup('notification-entry');
  await signIn();
  const delivered: NotificationPayloadDto[] = [];
  cleanups.push(startMockPush(simulator, (_installation, payload) => { delivered.push(payload); }));
  await settle(source.devices.register(intent(5), { pushToken: 'ExponentPushToken[scenario-test]', permission: 'granted', platform: 'ios' }));
  simulator.advanceTime(30000);
  expect(delivered.map((payload) => payload.kind)).toContain('group.ready');
  simulator.advanceTime(10000);
  expect(delivered.map((payload) => payload.kind)).toContain('chat.message_created');
  delivered.forEach((payload) => expect(NotificationPayloadSchema.safeParse(payload).success).toBe(true));
  expect(JSON.stringify(delivered)).not.toContain('The group is ready to meet.');
});

it.each(['group-formation', 'offline-resync', 'notification-entry'] as const)(
  '%s does not run actor side effects after source deadlines during delayed catch-up',
  async (key) => {
    const { simulator, source, signIn } = setup(key);
    await signIn();
    if (key === 'group-formation') {
      const own = (await settle(source.rides.getOwnRequest()))!;
      const target = [...simulator.state.rides.values()].find((ride) => simulator.state.users.get(ride.userId)?.displayName === 'Aida')!;
      await settle(source.groups.join({ operationId: intent(6), rideRequestId: own.id, target: { kind: 'ride', id: target.id } }));
    }
    const group = [...simulator.state.groups.values()][0]!;
    const members = group.members.length;
    const messages = simulator.state.messages.get(group.id)?.length ?? 0;
    simulator.advanceTime(2 * 60 * 60 * 1000);
    expect(group.status).toBe('cancelled');
    expect(group.members).toHaveLength(members);
    expect(simulator.state.messages.get(group.id)?.length ?? 0).toBe(messages);
  },
);

it('N coalesces refresh after access expiry, then clears credentials when refresh expires', async () => {
  const { simulator } = setup('session-expiration');
  let controller: SessionController | null = null;
  const raw = createMockDataSource(simulator, { accessToken: () => controller?.getAccessToken() ?? null });
  const store = memoryCredentialStore();
  controller = createSessionController({ auth: raw.auth, store: store.store, resumeStoredSession: false });
  cleanups.push(() => controller?.dispose());
  const source = withSessionRenewal(raw, () => controller);
  const refresh = jest.spyOn(raw.auth, 'refreshSession');
  const challenge = await settle(raw.auth.requestOtp({ phoneNumber: MOCK_DEMO_SIGN_IN.phoneNumber }));
  await settle(controller.signIn({ challengeId: challenge.id, code: MOCK_DEMO_SIGN_IN.code }));
  simulator.advanceTime(20000);
  const reads = Promise.all([source.auth.getCurrentUser(), source.auth.getCurrentUser()]);
  await jest.advanceTimersByTimeAsync(100);
  expect((await reads)[0].user.id).toBe((await reads)[1].user.id);
  expect(refresh).toHaveBeenCalledTimes(1);
  simulator.advanceTime(20000);
  const refused = source.auth.getCurrentUser().catch((error: unknown) => error);
  await jest.advanceTimersByTimeAsync(100);
  expect(await refused).toMatchObject({ code: 'REFRESH_TOKEN_INVALID' });
  expect(controller.getState().status).toBe('signed-out');
  expect(store.stored()).toBeNull();
  refresh.mockRestore();
});

it.each(MOCK_SCENARIO_KEYS)('%s resets to its fresh timer/listener/receipt/failure baseline', async (key) => {
  const { simulator, source, signIn } = setup(key);
  const controls = createMockDevControls(simulator, key);
  const fresh = simulator.stats();
  const publicSnapshot = await settle(source.rides.getNearby({
    viewport: { southWest: { latitude: 42.75, longitude: 74.4 }, northEast: { latitude: 43.1, longitude: 74.8 } }, limit: 100,
  }));
  expect(NearbySnapshotSchema.safeParse(publicSnapshot).success).toBe(true);
  expect(JSON.stringify(publicSnapshot)).not.toContain('scenarioPlan');
  await signIn();
  simulator.failNext({ kind: 'network' }, 'places.search');
  const pending = source.auth.getCurrentUser().catch((error: unknown) => error);
  controls.reset();
  expect(await pending).toMatchObject({ kind: 'network' });
  expect(simulator.state.auth.sessions.size).toBe(0);
  expect(simulator.stats()).toEqual(fresh);
  controls.reset();
  expect(simulator.stats()).toEqual(fresh);
  expect(controls.getSnapshot()).toEqual({ scenario: key, connection: 'connected', timeAheadMs: 0 });
});

it('composition scenario switching signs out and clears protected query state and credentials', async () => {
  const store = memoryCredentialStore();
  const app = composeAppDataSource({
    readConfig: () => ({ appEnv: 'development', dataSource: { kind: 'mock', scenario: 'notification-entry' } }),
    credentialStore: store.store,
  });
  expect(app.status).toBe('ready');
  if (app.status !== 'ready' || !app.devControls) throw new Error('Expected mock composition');
  cleanups.push(() => app.dispose());
  app.sync.start();
  const challengePromise = app.dataSource.auth.requestOtp({ phoneNumber: MOCK_DEMO_SIGN_IN.phoneNumber });
  await jest.advanceTimersByTimeAsync(1000);
  const challenge = await challengePromise;
  const signIn = app.session.signIn({ challengeId: challenge.id, code: MOCK_DEMO_SIGN_IN.code });
  await jest.advanceTimersByTimeAsync(1000);
  const user = await signIn;
  const key = queryKeys.chatHistory({ kind: 'user', userId: user.id }, 'group_reset');
  app.queryClient.setQueryData(key, { messages: ['synthetic private cache'] });
  expect(store.stored()).not.toBeNull();
  app.devControls.selectScenario('group-formation');
  await jest.advanceTimersByTimeAsync(1000);
  expect(app.session.getState().status).toBe('signed-out');
  expect(app.queryClient.getQueryData(key)).toBeUndefined();
  expect(store.stored()).toBeNull();
});
