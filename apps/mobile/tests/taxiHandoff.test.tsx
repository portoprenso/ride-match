import { act, screen } from '@testing-library/react-native';
import { AppState, Linking, Share, type AppStateStatus } from 'react-native';

import { replaceMeetingPoint } from '../src/data/mock/meetingPoints';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { describeTripForSharing } from '../src/features/groups/TaxiReviewSheet';
import { ANSWER_MS, captureSimulator, recordAnalytics, signInWithDemoCode } from './helpers/groupFlow';
import { BLOCKED, device, openHome, press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

const STORE_ID = 'appmetrica_tracking_id=1178268795219780156';
const WEBSITE_ID = 'appmetrica_tracking_id=25395763362139037';

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

/** Scenario L: the demo rider signs in and opens their ready group as its coordinator. */
async function openReadyGroup() {
  const captured = captureSimulator();
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'taxi-unavailable';
  device({ permission: BLOCKED });
  await openHome();
  await press('Sign in');
  await signInWithDemoCode();
  await wait(ANSWER_MS);
  await press('Open my group');
  await wait(ANSWER_MS);
  const simulator: Simulator<MockWorld> = captured.simulator!;
  const group = [...simulator.state.groups.values()][0]!;
  return { simulator, group };
}

async function reviewTrip() {
  await press('Review Yandex Go handoff');
  await wait(ANSWER_MS);
}

describe('taxi handoff', () => {
  let consoleSpies: jest.SpyInstance[];
  beforeEach(() => {
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => jest.spyOn(console, level));
  });

  afterEach(async () => {
    await flushTimersAndRestore();
    // Neither the link nor the places ever reach the console.
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toMatch(/redirect\.appmetrica|42\.81/);
    }
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('reviews the fresh trip, hands it to Yandex Go, and keeps the group ready (16, 17, 49)', async () => {
    const events = recordAnalytics();
    const setAppState = controlAppState();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { simulator, group } = await openReadyGroup();

    expect(screen.getByRole('header', { name: 'Ready to head out.' })).toBeOnTheScreen();
    await reviewTrip();

    expect(screen.getByRole('header', { name: 'One last look.' })).toBeOnTheScreen();
    expect(screen.getByText('These trip details will be sent to Yandex Go.')).toBeOnTheScreen();
    expect(screen.getAllByText('Asanbay, bus stop by the park').length).toBeGreaterThan(0);
    expect(screen.getByText('Pickup')).toBeOnTheScreen();
    expect(screen.getByText('Destination')).toBeOnTheScreen();
    expect(screen.getByText(/^Booking and payment happen in Yandex Go\./)).toBeOnTheScreen();
    expect(open).not.toHaveBeenCalled();

    await press('Open Yandex Go');
    await wait();

    expect(open).toHaveBeenCalledTimes(1);
    const link = open.mock.calls[0]![0];
    expect(link).toMatch(/^https:\/\/3\.redirect\.appmetrica\.yandex\.com\/route\?/);
    expect(link).toContain('start-lat=42.8158&start-lon=74.6268&end-lat=42.8556&end-lon=74.5859');
    expect(link).toContain(STORE_ID);
    expect(screen.queryByRole('header', { name: 'One last look.' })).not.toBeOnTheScreen();
    expect(screen.getByText(/^Yandex Go was asked to open your trip\./)).toBeOnTheScreen();
    const names = events().map((event) => event.name);
    expect(names.filter((name) => name.startsWith('taxi_'))).toEqual(['taxi_open_clicked', 'taxi_opened']);
    expect(JSON.stringify(events())).not.toMatch(/42\.8|redirect/);

    // The handoff changed nothing in the group.
    const record = simulator.state.groups.get(group.id)!;
    expect(record.status).toBe('ready');
    expect(record.version).toBe(group.version);

    // Back from Yandex Go, the group is read again: a change made meanwhile, without an event, shows.
    await setAppState('background');
    record.meetingPoint = { ...record.meetingPoint!, label: 'Asanbay, park gate' };
    await setAppState('active');
    await wait(ANSWER_MS);
    expect(screen.getByText('Asanbay, park gate')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mark group complete' })).toBeOnTheScreen();
  });

  it('offers a retry, the website link and the trip details when the link is refused (38)', async () => {
    const events = recordAnalytics();
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('Could not open URL'))
      .mockRejectedValueOnce(new Error('Could not open URL'))
      .mockResolvedValue(true);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await openReadyGroup();
    await reviewTrip();

    await press('Open Yandex Go');
    await wait();
    expect(screen.getByRole('header', { name: 'Couldn’t open Yandex Go.' })).toBeOnTheScreen();
    expect(screen.getByText('Your group is still ready. No booking or payment was made in Along.')).toBeOnTheScreen();

    await press('Try opening again');
    await wait();
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1]![0]).toContain(STORE_ID);
    expect(screen.getByRole('header', { name: 'Couldn’t open Yandex Go.' })).toBeOnTheScreen();

    await press('Copy or share trip details');
    await wait();
    expect(share).toHaveBeenCalledWith({
      message: 'Pickup: Asanbay, bus stop by the park (42.8158, 74.6268)\nDestination: Asia Mall (42.8556, 74.5859)',
    });

    await press('Use browser fallback');
    await wait();
    expect(open).toHaveBeenCalledTimes(3);
    expect(open.mock.calls[2]![0]).toContain(WEBSITE_ID);
    expect(screen.queryByRole('header', { name: 'Couldn’t open Yandex Go.' })).not.toBeOnTheScreen();
    expect(
      events()
        .map((event) => event.name)
        .filter((name) => name.startsWith('taxi_')),
    ).toEqual(['taxi_open_clicked', 'taxi_open_clicked', 'taxi_open_clicked', 'taxi_opened']);
  });

  it('asks for a new review when the meeting point changes under it', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { simulator, group } = await openReadyGroup();
    await reviewTrip();

    await act(async () => {
      simulator.schedule(0, (context) => replaceMeetingPoint(context, group.id));
    });
    await wait(ANSWER_MS);

    // A changed point returns the group to forming, so the old details can't open Yandex Go.
    expect(screen.getByRole('header', { name: 'The trip details changed.' })).toBeOnTheScreen();
    expect(screen.getByText('Your group is no longer ready, so Yandex Go can’t open from here.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open Yandex Go' })).not.toBeOnTheScreen();
    await press('Back to group');
    expect(screen.queryByRole('button', { name: 'Review Yandex Go handoff' })).not.toBeOnTheScreen();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('taxi pieces', () => {
  it('writes the trip details with names and coordinates', () => {
    expect(
      describeTripForSharing({
        groupId: 'group_1',
        meetingPointId: 'point_1',
        pickup: { label: 'Gate', coordinates: { latitude: 1.5, longitude: 2 } },
        destination: { label: 'Mall', coordinates: { latitude: -3, longitude: 4.25 } },
        trip: { pickup: { latitude: 1.5, longitude: 2 }, destination: { latitude: -3, longitude: 4.25 } },
      }),
    ).toBe('Pickup: Gate (1.5, 2)\nDestination: Mall (-3, 4.25)');
  });
});
