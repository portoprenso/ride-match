import { PushDeviceReceiptSchema, type ApiErrorCode } from '@ride-match/contracts';

import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

/** Synthetic installations and Expo-shaped tokens; none reach a real push service. */
const PHONE = 'a1b2c3d4-0000-4000-8000-000000000001';
const TABLET = 'a1b2c3d4-0000-4000-8000-000000000002';
const TOKEN = 'ExponentPushToken[synthetic-token-1]';
const OTHER_TOKEN = 'ExponentPushToken[synthetic-token-2]';
const input = (pushToken = TOKEN) => ({ pushToken, platform: 'ios' as const, permission: 'granted' as const });

let simulators: Simulator<MockWorld>[] = [];

function world() {
  const simulator = createMockSimulator('empty-neighborhood', {
    latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS },
  });
  simulators.push(simulator);
  return simulator;
}

/** A rider signed in on the simulator; numbers from Ofcom's range for fiction. */
async function signIn(simulator: Simulator<MockWorld>, n: number) {
  const session = { accessToken: null as string | null, refreshToken: '' };
  const dataSource = createMockDataSource(simulator, { accessToken: () => session.accessToken });
  const challenge = await settle(
    dataSource.auth.requestOtp({ phoneNumber: `+4477009005${String(n).padStart(2, '0')}` }),
  );
  const signedIn = await settle(dataSource.auth.verifyOtp({ challengeId: challenge.id, code: DEMO_OTP_CODE }));
  session.accessToken = signedIn.accessToken;
  session.refreshToken = signedIn.refreshToken;
  return { dataSource, session, userId: signedIn.user.id };
}

async function failure(call: Promise<unknown>): Promise<ApiErrorCode | null> {
  try {
    await settle(call);
    return null;
  } catch (error) {
    return (error as { code: ApiErrorCode | null }).code;
  }
}

describe('mock push-device registration', () => {
  beforeEach(() => jest.useFakeTimers({ now: Date.parse('2026-11-08T09:00:00.000Z') }));
  afterEach(() => {
    simulators.forEach((simulator) => simulator.dispose());
    simulators = [];
    jest.useRealTimers();
  });

  it('stores an inert registration and answers a receipt that echoes no token or user', async () => {
    const simulator = world();
    const { dataSource, userId } = await signIn(simulator, 1);

    const receipt = await settle(dataSource.devices.register(PHONE, input()));

    expect(PushDeviceReceiptSchema.parse(receipt)).toEqual({ installationId: PHONE, registeredAt: expect.any(String) });
    expect(JSON.stringify(receipt)).not.toContain('synthetic-token');
    expect(simulator.state.pushDevices.get(PHONE)).toMatchObject({ userId, pushToken: TOKEN, permission: 'granted' });

    // An upsert: a retry or a changed permission replaces it.
    await settle(dataSource.devices.register(PHONE, { ...input(), permission: 'denied' }));
    expect(simulator.state.pushDevices.size).toBe(1);
    expect(simulator.state.pushDevices.get(PHONE)?.permission).toBe('denied');
  });

  it('gives an installation to the rider who signs in on it, and moves a token to one installation', async () => {
    const simulator = world();
    const first = await signIn(simulator, 2);
    const second = await signIn(simulator, 3);
    await settle(first.dataSource.devices.register(PHONE, input()));

    await settle(second.dataSource.devices.register(PHONE, input()));
    expect(simulator.state.pushDevices.get(PHONE)?.userId).toBe(second.userId);

    await settle(second.dataSource.devices.register(TABLET, input()));
    expect([...simulator.state.pushDevices.keys()]).toEqual([TABLET]);
  });

  it('removes only the caller’s own registration, whether or not one exists', async () => {
    const simulator = world();
    const owner = await signIn(simulator, 4);
    const other = await signIn(simulator, 5);
    await settle(owner.dataSource.devices.register(PHONE, input()));

    await expect(settle(other.dataSource.devices.remove(PHONE))).resolves.toBeUndefined();
    expect(simulator.state.pushDevices.has(PHONE)).toBe(true);
    await settle(owner.dataSource.devices.remove(PHONE));
    await settle(owner.dataSource.devices.remove(PHONE));
    expect(simulator.state.pushDevices.size).toBe(0);
  });

  it('drops the registrations of a session that signs out', async () => {
    const simulator = world();
    const rider = await signIn(simulator, 6);
    const elsewhere = await signIn(simulator, 7);
    await settle(rider.dataSource.devices.register(PHONE, input()));
    await settle(elsewhere.dataSource.devices.register(TABLET, input(OTHER_TOKEN)));

    await settle(rider.dataSource.auth.logout({ refreshToken: rider.session.refreshToken }));

    expect([...simulator.state.pushDevices.keys()]).toEqual([TABLET]);
  });

  it('refuses invalid input, then a missing session', async () => {
    const simulator = world();
    const { dataSource, session } = await signIn(simulator, 8);

    expect(await failure(dataSource.devices.register('install_1' as never, input()))).toBe('VALIDATION_FAILED');
    expect(await failure(dataSource.devices.register(PHONE, input('device-token-raw')))).toBe('VALIDATION_FAILED');
    expect(await failure(dataSource.devices.register(PHONE, { ...input(), userId: 'usr_1' } as never))).toBe(
      'VALIDATION_FAILED',
    );
    expect(await failure(dataSource.devices.remove('not-a-uuid' as never))).toBe('VALIDATION_FAILED');
    session.accessToken = null;
    expect(await failure(dataSource.devices.register(PHONE, input()))).toBe('UNAUTHENTICATED');
    expect(await failure(dataSource.devices.remove(PHONE))).toBe('UNAUTHENTICATED');
    expect(simulator.state.pushDevices.size).toBe(0);
  });
});
