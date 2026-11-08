import { act, screen, userEvent } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { RIDE_POLICY, type OwnRideRequestDto } from '@ride-match/contracts';

import * as sinks from '../src/analytics/sinks';
import { createMemorySink } from '../src/analytics/sinks';
import { withSessionRenewal } from '../src/bootstrap/withSessionRenewal';
import type { AppDataSource } from '../src/data/AppDataSource';
import { createUnavailableDataSource } from '../src/data/createUnavailableDataSource';
import { DataError } from '../src/data/errors';
import type { SessionController } from '../src/features/auth/createSessionController';
import { describeCancelError } from '../src/features/rides/CancelRequestSheet';
import { describeOwnRequest, formatCountdown } from '../src/features/rides/useOwnRequest';
import { BLOCKED, device, openHome, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;
const SEARCH_MS = 300 + ANSWER_MS;
const WINDOW_MS = RIDE_POLICY.activeLifetimeSeconds * 1000;

const searchingBadge = () => screen.queryByText(/^Searching · \d+:\d{2} left$/);
const ownMarker = () => screen.queryByLabelText(/^Your request to Asia Mall, /);

function recordAnalytics() {
  const sink = createMemorySink();
  jest.spyOn(sinks, 'selectAnalyticsSink').mockReturnValue(sink);
  return () => sink.events().map((event) => event.name);
}

/** Captures the app's foreground listeners, to send it to the background and back. */
function controlAppState() {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => listeners.splice(listeners.indexOf(listener as never), 1) } as never;
  });
  return async (state: AppStateStatus) => {
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
    await act(async () => {
      for (const listener of [...listeners]) listener(state);
    });
  };
}

/** Anonymous with location blocked: Asia Mall, a named pickup, sign-in, then publish (in 5 min). */
async function publishRequest() {
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'empty-neighborhood';
  device({ permission: BLOCKED });
  const app = await openHome();
  await wait(ANSWER_MS);
  await press('Choose a destination');
  await userEvent.type(screen.getByLabelText('Destination'), 'Asia');
  await wait(SEARCH_MS);
  await press('Asia Mall, Shopping centre');
  await wait(ANSWER_MS);
  await press('Create my ride request');
  await press('Choose a named place');
  await wait(SEARCH_MS);
  await press('Ala-Too Square, City square');
  await press('Confirm this pickup');
  await press('Continue to sign in');
  await press('Continue with demo identity');
  await wait(ANSWER_MS);
  await userEvent.type(screen.getByLabelText('Demo code'), '123456');
  await press('Verify demo code');
  await wait(ANSWER_MS);
  await press('Publish my request');
  await wait(ANSWER_MS);
  return app;
}

describe('the rider’s own request on home', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('shows the searching card with a countdown and a “You” marker (10)', async () => {
    await publishRequest();

    expect(searchingBadge()).toBeOnTheScreen();
    // On the card and on the marker.
    expect(screen.getAllByText('You · leaving in 5 min')).toHaveLength(2);
    expect(ownMarker()).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Create my ride request' })).not.toBeOnTheScreen();
    const before = searchingBadge()!.props.children as string;
    await wait(5_000);
    expect(searchingBadge()!.props.children).not.toBe(before);
  });

  it('cancels after confirmation, from the source’s answer, and offers a new request explicitly (28)', async () => {
    await publishRequest();

    await press('Cancel request');
    expect(screen.getByRole('header', { name: 'Stop looking for a ride?' })).toBeOnTheScreen();
    await press('Keep searching');
    expect(searchingBadge()).toBeOnTheScreen();

    await press('Cancel request');
    await press('Cancel my request');
    await wait(ANSWER_MS);

    expect(screen.queryByRole('header', { name: 'Stop looking for a ride?' })).not.toBeOnTheScreen();
    expect(searchingBadge()).not.toBeOnTheScreen();
    expect(ownMarker()).not.toBeOnTheScreen();
    // Nothing restarts by itself; a new request is the rider's choice.
    expect(screen.getByRole('button', { name: 'Create my ride request' })).toBeOnTheScreen();
  });

  it('expires in the foreground: the open cancel closes, the outcome shows once, and a new draft is explicit (27)', async () => {
    const events = recordAnalytics();
    await publishRequest();
    await press('Cancel request');

    // Minute by minute, so the app renders in between, as time passes on screen.
    for (let elapsed = 0; elapsed < WINDOW_MS; elapsed += 60_000) await wait(60_000);
    await wait(2 * ANSWER_MS);

    expect(screen.queryByRole('header', { name: 'Stop looking for a ride?' })).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Your request expired.' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeOnTheScreen();
    expect(ownMarker()).not.toBeOnTheScreen();
    expect(events().filter((name) => name === 'ride_request_expired')).toHaveLength(1);

    await press('Review a new request');
    expect(screen.getByRole('header', { name: 'When are you leaving?' })).toBeOnTheScreen();
    await pressLast('Keep browsing');
    expect(screen.queryByRole('header', { name: 'Your request expired.' })).not.toBeOnTheScreen();
    expect(events().filter((name) => name === 'ride_request_created')).toHaveLength(1);
  });

  it('after the window ends in the background, shows the source’s outcome on return, with no cancel', async () => {
    const setAppState = controlAppState();
    await publishRequest();

    await setAppState('background');
    for (let elapsed = 0; elapsed <= WINDOW_MS; elapsed += 60_000) await wait(60_000);
    await setAppState('active');
    await wait(3 * ANSWER_MS);

    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Your request expired.' })).toBeOnTheScreen();
  });
});

describe('request card pieces', () => {
  const request = (status: OwnRideRequestDto['status']) =>
    ({ id: 'ride_1', status, expiresAt: '2026-11-07T10:15:00.000Z' }) as OwnRideRequestDto;
  const at = (time: string) => Date.parse(`2026-11-07T${time}.000Z`);

  it('words the window from the source’s status, with the device only counting down', () => {
    expect(describeOwnRequest(request('active'), at('10:00:28'))).toMatchObject({
      kind: 'searching',
      secondsLeft: 872,
    });
    expect(describeOwnRequest(request('active'), at('10:15:00'))).toMatchObject({ kind: 'ending' });
    expect(describeOwnRequest(request('expired'), at('10:00:00'))).toMatchObject({ kind: 'expired' });
    expect(describeOwnRequest(request('grouped'), at('10:00:00'))).toMatchObject({ kind: 'grouped' });
    expect(describeOwnRequest(request('cancelled'), at('10:00:00'))).toEqual({ kind: 'none' });
    expect(describeOwnRequest(null, at('10:00:00'))).toEqual({ kind: 'none' });
    expect(formatCountdown(872)).toBe('14:32');
  });

  it('retries a cancel only when its outcome is unknown', () => {
    const refused = (code: string) =>
      new DataError('source', 'refused', { body: { code, message: 'Refused', requestId: 'req_1' } as never });
    expect(describeCancelError(refused('RIDE_EXPIRED'))).toMatchObject({ close: true, retry: false });
    expect(describeCancelError(refused('VERSION_CONFLICT'))).toMatchObject({ close: false, retry: false });
    expect(describeCancelError(new DataError('network', 'no answer'))).toMatchObject({ retry: true });
  });

  it('runs signed-in calls through the session’s renewal, and public reads as they are', async () => {
    const base = createUnavailableDataSource('stand-in');
    const getOwnRequest = jest.fn().mockResolvedValue(null);
    const getNearby = jest.fn().mockResolvedValue({ items: [], truncated: false, previews: [] });
    const dataSource: AppDataSource = { ...base, rides: { ...base.rides, getOwnRequest, getNearby } };
    const runAuthenticated = jest.fn((operation: () => Promise<unknown>) => operation());
    const session = { runAuthenticated } as unknown as SessionController;
    const renewed = withSessionRenewal(dataSource, () => session);

    await renewed.rides.getOwnRequest();
    expect(runAuthenticated).toHaveBeenCalledTimes(1);
    await renewed.rides.getNearby({} as never);
    expect(runAuthenticated).toHaveBeenCalledTimes(1);
    expect(getNearby).toHaveBeenCalledTimes(1);
  });
});
