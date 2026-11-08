import type { MapViewport, SubscriptionRequest } from '@ride-match/contracts';
import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query';

import { composeAppDataSource } from '../src/bootstrap/composeAppDataSource';
import { createQueryClient } from '../src/bootstrap/createQueryClient';
import { createSyncCoordinator } from '../src/data/createSyncCoordinator';
import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { currentUserQuery, nearbyQuery } from '../src/data/queries';
import { ANONYMOUS_VIEWER, queryKeys, type SignedInViewer } from '../src/data/queryKeys';
import { createEventSynchronizer } from '../src/data/synchronizeEvents';
import { createSessionController, type SessionController } from '../src/features/auth/createSessionController';
import { sessionViewerSource, viewerOfSession } from '../src/features/auth/sessionViewer';
import type { AppStateSource } from '../src/platform/appState';
import { memoryCredentialStore } from './helpers/credentialStore';
import { MOCK_LATENCY_MS } from './helpers/mockSource';

const START = Date.parse('2026-11-07T09:00:00.000Z');
const SECOND = 1000;
const DEMO_NUMBER = '+447700900123';
const CITY: MapViewport = { southWest: { latitude: 42.75, longitude: 74.4 }, northEast: { latitude: 43.1, longitude: 74.8 } };
const NEARBY: SubscriptionRequest = { kind: 'nearby', viewport: CITY };
const CITY_READ = { viewport: CITY, limit: 100 };

/** An `AppState` a test moves between foreground and background. */
function fakeAppState() {
  const listeners = new Set<(state: string) => void>();
  const appState: AppStateSource & { set(state: string): void } = {
    currentState: 'active',
    addEventListener: (_type, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    set(state) {
      appState.currentState = state;
      for (const listener of listeners) listener(state);
    },
  };
  return appState;
}

let cleanups: (() => void)[] = [];

function setup() {
  const simulator: Simulator<MockWorld> = createMockSimulator('active-neighborhood', {
    latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS },
  });
  let session: SessionController | null = null;
  const dataSource = createMockDataSource(simulator, { accessToken: () => session?.getAccessToken() ?? null });
  session = createSessionController({ auth: dataSource.auth, store: memoryCredentialStore().store, resumeStoredSession: false });
  const queryClient = createQueryClient();
  const synchronizer = createEventSynchronizer(queryClient);
  const apply = jest.spyOn(synchronizer, 'apply');
  const subscribe = jest.spyOn(dataSource.events, 'subscribe');
  const appState = fakeAppState();
  const sync = createSyncCoordinator({
    queryClient,
    events: dataSource.events,
    viewer: sessionViewerSource(session),
    appState,
    synchronizer,
  });
  const controller = session;
  cleanups.push(() => {
    sync.dispose();
    queryClient.clear();
    controller.dispose();
    simulator.dispose();
  });
  return { simulator, dataSource, session: controller, queryClient, sync, apply, subscribe, appState };
}

type Setup = ReturnType<typeof setup>;

/** Lets simulated calls of {@link MOCK_LATENCY_MS} each finish. */
const flush = (calls = 3) => jest.advanceTimersByTimeAsync(MOCK_LATENCY_MS * calls);

async function signIn({ dataSource, session }: Setup, phoneNumber = DEMO_NUMBER): Promise<SignedInViewer> {
  const challenge = dataSource.auth.requestOtp({ phoneNumber });
  await flush(1);
  const signedIn = session.signIn({ challengeId: (await challenge).id, code: DEMO_OTP_CODE });
  await flush(1);
  const user = await signedIn;
  return { kind: 'user', userId: user.id };
}

async function started(mock: Setup) {
  await mock.session.restore();
  mock.sync.start();
  await flush(1);
  return mock;
}

const live = (mock: Setup) => mock.simulator.stats().eventListeners;

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('subscriptions', () => {
  it('keeps one shared subscription while watched and feeds its events to the cache', async () => {
    const mock = await started(setup());
    const releaseA = mock.sync.watch(NEARBY);
    const releaseB = mock.sync.watch({ kind: 'nearby', viewport: { ...CITY } });
    await flush(1);
    expect(mock.subscribe).toHaveBeenCalledTimes(1);
    expect(live(mock)).toBe(1);

    await jest.advanceTimersByTimeAsync(8 * SECOND);
    expect(mock.apply).toHaveBeenCalledWith(expect.objectContaining({ type: 'nearby.upserted' }), ANONYMOUS_VIEWER);

    releaseA();
    expect(live(mock)).toBe(1);
    releaseB();
    await flush(1);
    expect(live(mock)).toBe(0);
  });

  it('makes user and group subscriptions only for a signed-in viewer, and reports a refusal', async () => {
    const mock = await started(setup());
    const onError = jest.fn();
    mock.sync.watch({ kind: 'user' }, onError);
    await flush(1);
    expect(mock.subscribe).not.toHaveBeenCalled();

    await signIn(mock);
    await flush(1);

    // The mock accepts a signed-in rider's user subscription (RIDE-001-A)…
    expect(mock.subscribe).toHaveBeenCalledWith({ kind: 'user' }, expect.any(Function));
    expect(onError).not.toHaveBeenCalled();
    // …and refuses a group subscription to someone who is not a member (GROUP-002-B).
    const onGroupError = jest.fn();
    mock.sync.watch({ kind: 'group', groupId: 'group_1' }, onGroupError);
    await flush(1);
    expect(onGroupError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'source', code: 'MEMBERSHIP_REQUIRED' }));
  });
});

describe('identity changes', () => {
  it('cancels the previous rider’s reads, so a late result cannot bring their data back', async () => {
    const mock = await started(setup());
    const rider = await signIn(mock);
    const read = mock.queryClient.fetchQuery(currentUserQuery(mock.dataSource, rider)).catch(() => undefined);

    // The session ends while the read is still on its way.
    void mock.session.discard();
    await flush(2);
    await read;

    expect(mock.queryClient.getQueryData(queryKeys.currentUser(rider))).toBeUndefined();
    expect(mock.queryClient.getQueryCache().findAll({ queryKey: queryKeys.viewer(rider) })).toEqual([]);
    // The removed query, settling late, still starts Query's own five-minute garbage-collection
    // timer; it finds nothing to collect.
    mock.simulator.dispose();
    await jest.advanceTimersByTimeAsync(5 * 60 * SECOND);
  });

  it('ends subscriptions, drops what they still deliver and subscribes again for the new viewer', async () => {
    const mock = await started(setup());
    mock.sync.watch(NEARBY);
    await flush(1);
    const firstDelivery = mock.subscribe.mock.calls[0]?.[1];

    const rider = await signIn(mock);
    await flush(1);

    expect(mock.subscribe).toHaveBeenCalledTimes(2);
    expect(live(mock)).toBe(1);
    // An event still arriving from the anonymous subscription is not applied.
    mock.apply.mockClear();
    firstDelivery?.({} as never);
    expect(mock.apply).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(8 * SECOND);
    expect(mock.apply).toHaveBeenCalledWith(expect.objectContaining({ type: 'nearby.upserted' }), rider);
  });

  it('keeps public anonymous reads when someone signs in', async () => {
    const mock = await started(setup());
    mock.queryClient.setQueryData(queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ), { items: [], truncated: false, previews: [] });

    await signIn(mock);

    expect(mock.queryClient.getQueryData(queryKeys.nearby(ANONYMOUS_VIEWER, CITY_READ))).toBeDefined();
  });
});

describe('connection and foreground', () => {
  it('follows the connection: reads wait offline, and reconnecting subscribes again and rereads', async () => {
    const mock = await started(setup());
    mock.sync.watch(NEARBY);
    const observer = new QueryObserver(mock.queryClient, nearbyQuery(mock.dataSource, ANONYMOUS_VIEWER, CITY_READ));
    const stop = observer.subscribe(() => undefined);
    cleanups.unshift(stop);
    await flush(2);
    expect(observer.getCurrentResult().status).toBe('success');

    mock.simulator.setConnection('disconnected');
    expect(onlineManager.isOnline()).toBe(false);
    expect(live(mock)).toBe(0);

    mock.simulator.setConnection('connected');
    expect(onlineManager.isOnline()).toBe(true);
    expect(observer.getCurrentResult().fetchStatus).toBe('fetching');
    await flush(2);
    expect(live(mock)).toBe(1);
    expect(mock.subscribe).toHaveBeenCalledTimes(2);
  });

  it('follows the foreground for Query’s focus', async () => {
    const mock = await started(setup());

    mock.appState.set('background');
    expect(focusManager.isFocused()).toBe(false);
    mock.appState.set('active');
    expect(focusManager.isFocused()).toBe(true);
  });

  it('leaks nothing after repeated resets and reconnects', async () => {
    const mock = await started(setup());
    mock.sync.watch(NEARBY);
    await flush(1);

    for (let round = 0; round < 5; round += 1) {
      mock.simulator.setConnection('disconnected');
      mock.simulator.setConnection('connected');
      mock.simulator.reset();
      mock.sync.resetWorld();
    }
    await flush(2);

    expect(live(mock)).toBe(1);
    expect(mock.simulator.stats().pendingOperations).toBe(0);
  });

  it('never holds a mutation for the connection', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.networkMode).toBe('always');
  });
});

describe('composition', () => {
  it('signs out and subscribes again into the new world when a demo scenario starts', async () => {
    const composition = composeAppDataSource({
      readConfig: () => ({ appEnv: 'development', dataSource: { kind: 'mock', scenario: 'active-neighborhood' } }),
      credentialStore: memoryCredentialStore().store,
      appState: fakeAppState(),
    });
    if (composition.status !== 'ready') throw new Error('composition failed');
    cleanups.push(composition.dispose);
    const { session, sync, devControls, dataSource } = composition;
    await session.restore();
    sync.start();
    const subscribe = jest.spyOn(dataSource.events, 'subscribe');
    sync.watch(NEARBY);
    await jest.advanceTimersByTimeAsync(2 * SECOND);
    expect(subscribe).toHaveBeenCalledTimes(1);

    devControls?.reset();
    await jest.advanceTimersByTimeAsync(2 * SECOND);

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(viewerOfSession(session.getState())).toEqual(ANONYMOUS_VIEWER);
  });
});

