import { act, renderHook } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';

import { composeAppDataSource } from '../src/bootstrap/composeAppDataSource';
import { createUnavailableDataSource } from '../src/data/createUnavailableDataSource';
import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { AuthSessionProvider, useSessionState } from '../src/features/auth/AuthSessionProvider';
import { createSessionController, NoSessionError, type SessionController } from '../src/features/auth/createSessionController';
import { createSecureCredentialStore, refreshTokenKey } from '../src/platform/secureStorage/credentialStore';
import { memoryCredentialStore } from './helpers/credentialStore';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

const START = Date.parse('2026-11-07T09:00:00.000Z');
const MINUTE = 60_000;
// Ofcom's range for fiction: synthetic numbers that reach no one.
const DEMO_NUMBER = '+447700900123';

let simulators: Simulator<MockWorld>[] = [];
let controllers: SessionController[] = [];

/**
 * A mock source wired to a session controller exactly as the composition root wires them.
 * Passing `simulator` relaunches the app against an existing world, as a restart against a server.
 */
function setup({
  stored = null as string | null,
  resumeStoredSession = true,
  simulator = null as Simulator<MockWorld> | null,
} = {}) {
  const world =
    simulator ??
    createMockSimulator('empty-neighborhood', { latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS } });
  if (!simulator) simulators.push(world);
  let session: SessionController | null = null;
  const dataSource = createMockDataSource(world, { accessToken: () => session?.getAccessToken() ?? null });
  const credentials = memoryCredentialStore(stored);
  session = createSessionController({ auth: dataSource.auth, store: credentials.store, resumeStoredSession });
  controllers.push(session);
  return { simulator: world, dataSource, session, credentials };
}

type Setup = ReturnType<typeof setup>;

/** Lets a chain of simulated calls (each one {@link MOCK_LATENCY_MS} long) finish. */
async function flush(calls = 4) {
  await jest.advanceTimersByTimeAsync(MOCK_LATENCY_MS * calls);
}

async function signIn({ dataSource, session }: Setup) {
  const challenge = await settle(dataSource.auth.requestOtp({ phoneNumber: DEMO_NUMBER }));
  const user = session.signIn({ challengeId: challenge.id, code: DEMO_OTP_CODE });
  await flush(1);
  return user;
}

/** Signs in on one launch, then returns the next launch, which finds that session stored. */
async function launchWithStoredSession() {
  const first = setup();
  await first.session.restore();
  await signIn(first);
  return setup({ stored: first.credentials.stored(), simulator: first.simulator });
}

const sourceError = (code: string) => expect.objectContaining({ kind: 'source', body: expect.objectContaining({ code }) });

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  for (const controller of controllers) controller.dispose();
  for (const simulator of simulators) simulator.dispose();
  controllers = [];
  simulators = [];
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('credential store', () => {
  it('keeps the refresh token under the namespace key, readable only on this unlocked device', async () => {
    const store = createSecureCredentialStore('mock');
    const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

    await store.write('demo-refresh.token');
    await expect(store.read()).resolves.toBe('demo-refresh.token');
    await expect(createSecureCredentialStore('api').read()).resolves.toBeNull();
    await store.clear();
    await expect(store.read()).resolves.toBeNull();

    expect(refreshTokenKey('mock')).toBe('ridematch.mock.refreshToken');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('ridematch.mock.refreshToken', 'demo-refresh.token', options);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ridematch.mock.refreshToken', options);
  });
});

describe('sign-in', () => {
  it('starts signed out with nothing stored, then signs in, keeping the access token in memory only', async () => {
    const mock = setup();
    await mock.session.restore();
    expect(mock.session.getState()).toEqual({ status: 'signed-out', reason: 'none' });
    expect(mock.session.getAccessToken()).toBeNull();

    const user = await signIn(mock);

    expect(user).toEqual(expect.objectContaining({ displayName: 'Demo rider 123' }));
    expect(mock.session.getState()).toEqual({ status: 'signed-in', user, persisted: true });
    expect(mock.session.getAccessToken()).toMatch(/^demo-access\./);
    expect(mock.credentials.stored()).toMatch(/^demo-refresh\./);
    // Only the refresh token reaches storage.
    expect(mock.credentials.store.write).toHaveBeenCalledTimes(1);
    expect(mock.credentials.store.write).not.toHaveBeenCalledWith(mock.session.getAccessToken());
    // The data source now sends it.
    await expect(settle(mock.dataSource.auth.getCurrentUser())).resolves.toEqual(expect.objectContaining({ user }));
  });

  it('leaves the state unchanged when the code is refused', async () => {
    const mock = setup();
    await mock.session.restore();
    const challenge = await settle(mock.dataSource.auth.requestOtp({ phoneNumber: DEMO_NUMBER }));

    await expect(settle(mock.session.signIn({ challengeId: challenge.id, code: '000000' }))).rejects.toEqual(
      sourceError('OTP_INVALID'),
    );
    expect(mock.session.getState()).toEqual({ status: 'signed-out', reason: 'none' });
    expect(mock.credentials.store.write).not.toHaveBeenCalled();
  });

  it('stays signed in for this launch when the token cannot be saved, and says so', async () => {
    const mock = setup();
    await mock.session.restore();
    mock.credentials.fail.write = true;

    await signIn(mock);

    expect(mock.session.getState()).toEqual(expect.objectContaining({ status: 'signed-in', persisted: false }));
    expect(mock.credentials.stored()).toBeNull();
  });

  it('refuses a second sign-in over a signed-in rider', async () => {
    const mock = setup();
    await mock.session.restore();
    await signIn(mock);

    await expect(mock.session.signIn({ challengeId: 'challenge_x', code: DEMO_OTP_CODE })).rejects.toThrow('already signed in');
  });
});

describe('restoring at launch', () => {
  it('renews a stored session and reads the rider', async () => {
    const next = await launchWithStoredSession();
    const before = next.credentials.stored();

    const restored = next.session.restore();
    expect(next.session.getState()).toEqual({ status: 'restoring' });
    await flush();
    await restored;

    expect(next.session.getState()).toEqual(
      expect.objectContaining({ status: 'signed-in', user: expect.objectContaining({ displayName: 'Demo rider 123' }) }),
    );
    expect(next.credentials.stored()).not.toBe(before);
  });

  it('ends a stored session the source refuses as expired, clearing it', async () => {
    const mock = setup({ stored: 'demo-refresh.unknown-token-0001' });

    const restored = mock.session.restore();
    await flush();
    await restored;

    expect(mock.session.getState()).toEqual({ status: 'signed-out', reason: 'expired' });
    expect(mock.credentials.stored()).toBeNull();
  });

  it('keeps the stored session when the source is unreachable, and tries again later', async () => {
    const next = await launchWithStoredSession();
    next.simulator.setConnection('disconnected');

    await next.session.restore();
    expect(next.session.getState()).toEqual({ status: 'restore-failed' });
    expect(next.session.getAccessToken()).toBeNull();
    expect(next.credentials.stored()).not.toBeNull();

    next.simulator.setConnection('connected');
    const retried = next.session.restore();
    await flush();
    await retried;
    expect(next.session.getState()).toEqual(expect.objectContaining({ status: 'signed-in' }));
  });

  it('reports a store it cannot read as a failed restore', async () => {
    const mock = setup({ stored: 'demo-refresh.whatever-0001' });
    mock.credentials.fail.read = true;

    await mock.session.restore();

    expect(mock.session.getState()).toEqual({ status: 'restore-failed' });
  });

  it('clears the demo namespace instead of resuming when the source cannot keep sessions', async () => {
    const mock = setup({ stored: 'demo-refresh.from-last-launch', resumeStoredSession: false });

    await mock.session.restore();

    expect(mock.session.getState()).toEqual({ status: 'signed-out', reason: 'none' });
    expect(mock.credentials.stored()).toBeNull();
    expect(mock.credentials.store.read).not.toHaveBeenCalled();
  });

  it('lets a sign-in during the restore win over the restore’s late result', async () => {
    const next = await launchWithStoredSession();
    const restored = next.session.restore();
    const challenge = next.dataSource.auth.requestOtp({ phoneNumber: '+447700900456' });
    await flush(1);
    const signedIn = next.session.signIn({ challengeId: (await challenge).id, code: DEMO_OTP_CODE });
    await flush();
    await Promise.all([restored, signedIn]);

    expect(next.session.getState()).toEqual(
      expect.objectContaining({ status: 'signed-in', user: expect.objectContaining({ displayName: 'Demo rider 456' }) }),
    );
  });
});

describe('refresh', () => {
  it('shares one refresh among every caller that finds the access token expired', async () => {
    const mock = setup();
    await mock.session.restore();
    await signIn(mock);
    const refreshSpy = jest.spyOn(mock.dataSource.auth, 'refreshSession');
    mock.simulator.advanceTime(16 * MINUTE);

    const reads = [1, 2, 3].map(() => mock.session.runAuthenticated(() => mock.dataSource.auth.getCurrentUser()));
    await flush(6);
    const results = await Promise.all(reads);

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.user.displayName)).toEqual(['Demo rider 123', 'Demo rider 123', 'Demo rider 123']);
    expect(mock.credentials.store.write).toHaveBeenCalledTimes(2);
  });

  it('ends the session as expired when the refresh token is refused', async () => {
    const mock = setup();
    await mock.session.restore();
    await signIn(mock);
    mock.simulator.failNext({ kind: 'source', code: 'REFRESH_TOKEN_INVALID' });

    await expect(settle(mock.session.refresh())).rejects.toEqual(sourceError('REFRESH_TOKEN_INVALID'));

    expect(mock.session.getState()).toEqual({ status: 'signed-out', reason: 'expired' });
    expect(mock.session.getAccessToken()).toBeNull();
    expect(mock.credentials.stored()).toBeNull();
  });

  it('keeps the session through a refresh lost on the way, so the next one can try again', async () => {
    const mock = setup();
    await mock.session.restore();
    await signIn(mock);
    mock.simulator.failNext({ kind: 'network' });

    await expect(settle(mock.session.refresh())).rejects.toEqual(expect.objectContaining({ kind: 'network' }));
    expect(mock.session.getState()).toEqual(expect.objectContaining({ status: 'signed-in' }));
    await expect(settle(mock.session.refresh())).resolves.toBeUndefined();
  });

  it('needs a session', async () => {
    const mock = setup();
    await mock.session.restore();

    await expect(mock.session.refresh()).rejects.toThrow(NoSessionError);
  });
});

describe('signing out', () => {
  it('revokes the session at the source, then clears it locally', async () => {
    const mock = setup();
    await mock.session.restore();
    await signIn(mock);
    const token = mock.session.getAccessToken();

    await expect(settle(mock.session.signOut())).resolves.toEqual({ revoked: true, revokeError: null, storageCleared: true });

    expect(mock.session.getState()).toEqual({ status: 'signed-out', reason: 'signed-out' });
    expect(mock.credentials.stored()).toBeNull();
    // The revoked token no longer works at the source.
    await expect(settle(createMockDataSource(mock.simulator, { accessToken: () => token }).auth.getCurrentUser())).rejects.toEqual(
      sourceError('UNAUTHENTICATED'),
    );
  });

  it('signs out locally even offline and with a failing store, reporting what was not confirmed', async () => {
    const mock = setup();
    await mock.session.restore();
    await signIn(mock);
    mock.simulator.setConnection('disconnected');
    mock.credentials.fail.clear = true;

    const result = await mock.session.signOut();

    expect(result).toEqual({ revoked: false, revokeError: expect.objectContaining({ kind: 'network' }), storageCleared: false });
    expect(mock.session.getState()).toEqual({ status: 'signed-out', reason: 'signed-out' });
    expect(mock.session.getAccessToken()).toBeNull();
  });

  it('waits for a refresh in flight and revokes the rotated credentials', async () => {
    const mock = setup();
    await mock.session.restore();
    await signIn(mock);
    const logout = jest.spyOn(mock.dataSource.auth, 'logout');

    const refreshed = mock.session.refresh();
    const signedOut = mock.session.signOut();
    await flush(3);
    await refreshed;
    await expect(signedOut).resolves.toEqual(expect.objectContaining({ revoked: true }));

    const rotated = jest.mocked(mock.credentials.store.write).mock.calls.at(-1)?.[0];
    expect(rotated).toMatch(/^demo-refresh\./);
    expect(logout).toHaveBeenCalledWith({ refreshToken: rotated });
    expect(mock.credentials.stored()).toBeNull();
  });

  it('never lets a late save bring back a token after signing out', async () => {
    const mock = setup();
    await mock.session.restore();
    let releaseWrite: () => void = () => undefined;
    jest.mocked(mock.credentials.store.write).mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseWrite = resolve)),
    );

    // The sign-in's save is still running when the rider signs out.
    const challenge = await settle(mock.dataSource.auth.requestOtp({ phoneNumber: DEMO_NUMBER }));
    const signedIn = mock.session.signIn({ challengeId: challenge.id, code: DEMO_OTP_CODE });
    await flush(1);
    const signedOut = mock.session.signOut();
    await flush(1);
    releaseWrite();
    await Promise.all([signedIn, signedOut]);

    expect(mock.session.getState()).toEqual({ status: 'signed-out', reason: 'signed-out' });
    expect(mock.credentials.store.write).toHaveBeenCalledTimes(1);
    expect(mock.credentials.stored()).toBeNull();
  });
});

describe('composition', () => {
  it('signs the app out when the demo controls start a scenario', async () => {
    const composition = composeAppDataSource({
      readConfig: () => ({ appEnv: 'development', dataSource: { kind: 'mock', scenario: 'empty-neighborhood' } }),
      credentialStore: memoryCredentialStore().store,
    });
    if (composition.status !== 'ready') throw new Error('composition failed');
    const { session, dataSource, devControls } = composition;
    await session.restore();
    const challenge = dataSource.auth.requestOtp({ phoneNumber: DEMO_NUMBER });
    await jest.advanceTimersByTimeAsync(2000);
    const signedIn = session.signIn({ challengeId: (await challenge).id, code: DEMO_OTP_CODE });
    await jest.advanceTimersByTimeAsync(2000);
    await signedIn;
    expect(session.getState()).toEqual(expect.objectContaining({ status: 'signed-in' }));

    devControls?.reset();

    expect(session.getState()).toEqual({ status: 'signed-out', reason: 'reset' });
    expect(session.getAccessToken()).toBeNull();
    composition.dispose();
  });

  it('re-renders hooks with the session state', async () => {
    // Rendering schedules React's own timers, so this test runs on real ones.
    jest.useRealTimers();
    const session = createSessionController({
      auth: createUnavailableDataSource('not used').auth,
      store: memoryCredentialStore().store,
      resumeStoredSession: true,
    });
    controllers.push(session);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthSessionProvider controller={session}>{children}</AuthSessionProvider>
    );
    const { result } = await renderHook(() => useSessionState(), { wrapper });
    expect(result.current).toEqual({ status: 'restoring' });

    await act(() => session.restore());

    expect(result.current).toEqual({ status: 'signed-out', reason: 'none' });
  });
});
