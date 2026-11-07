import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import type { NearbySnapshotDto } from '@ride-match/contracts';
import { router } from 'expo-router';
import type { Region } from 'react-native-maps';

import * as sinks from '../src/analytics/sinks';
import { createMemorySink } from '../src/analytics/sinks';
import { DataError } from '../src/data/errors';
import { DiscoveryPanel, describeActivity } from '../src/features/discovery/DiscoveryPanel';
import { describeDiscovery, type DiscoveryState } from '../src/features/discovery/useNearbyDiscovery';
import { toViewport } from '../src/features/discovery/viewport';
import { DEMO_CITY_REGION } from '../src/features/map/mapCamera';
import { BLOCKED, device, openHome, press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** The stand-in map's camera commands (`tests/setup/reactNativeMaps.ts`). */
const { animateToRegion } = jest.requireMock<{ animateToRegion: jest.Mock }>('react-native-maps');

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;

/** The city centre at street scale: another viewport than the demo city's, with activity in it. */
const CENTRE: Region = { latitude: 42.876, longitude: 74.604, latitudeDelta: 0.02, longitudeDelta: 0.02 };
/** Outside the demo coverage. */
const FAR_AWAY: Region = { latitude: 43.6, longitude: 75.6, latitudeDelta: 0.02, longitudeDelta: 0.02 };

/** The map comes to rest on `region`, as after the user moved it. */
async function moveMap(region: Region) {
  const map = screen.getByTestId('home-map');
  await act(async () => {
    fireEvent(map, 'regionChangeComplete', region);
  });
}

/** Records analytics in memory for the test to read. */
function recordAnalytics() {
  const sink = createMemorySink();
  jest.spyOn(sinks, 'selectAnalyticsSink').mockReturnValue(sink);
  return () => sink.events().map((event) => ({ name: event.name, properties: event.properties }));
}

async function openDemoControlsAndReturn(action: () => Promise<void>) {
  await press('Demo scenarios');
  await action();
  await act(async () => router.back());
  await wait();
}

describe('discovery on home', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('loads the demo city and says honestly what it found, without moving the camera', async () => {
    const events = recordAnalytics();
    device({ permission: BLOCKED });
    await openHome();

    expect(screen.getByRole('header', { name: 'Finding nearby plans…' })).toBeOnTheScreen();
    expect(screen.getByText('A loading view does not mean the area is empty.')).toBeOnTheScreen();

    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Going the same way?' })).toBeOnTheScreen();
    expect(screen.getByText(/^\d+ ride plans in this view: \d+ riders? and \d+ groups?\.$/)).toBeOnTheScreen();
    expect(animateToRegion).not.toHaveBeenCalled();
    const names = events().map((event) => event.name);
    expect(names.filter((name) => name === 'map_opened')).toHaveLength(1);
    expect(events().filter((event) => event.name === 'nearby_activity_exposed')).toEqual([
      { name: 'nearby_activity_exposed', properties: expect.objectContaining({ truncated: false }) },
    ]);
  });

  it('shows an empty area as empty, and records the zero exposure', async () => {
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'empty-neighborhood';
    const events = recordAnalytics();
    device({ permission: BLOCKED });
    await openHome();
    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'You could be the first.' })).toBeOnTheScreen();
    expect(screen.getByText('There are no active ride plans in this area right now.')).toBeOnTheScreen();
    expect(events().filter((event) => event.name === 'nearby_activity_exposed')).toEqual([
      { name: 'nearby_activity_exposed', properties: { countBucket: '0', truncated: false } },
    ]);
  });

  it('reads a moved view, keeping the previous one marked as updating meanwhile', async () => {
    device({ permission: BLOCKED });
    await openHome();
    await wait(ANSWER_MS);

    await moveMap(CENTRE);
    expect(screen.getByText('Updating for this area…')).toBeOnTheScreen();

    await wait(ANSWER_MS);
    expect(screen.queryByText('Updating for this area…')).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Going the same way?' })).toBeOnTheScreen();
    expect(animateToRegion).not.toHaveBeenCalled();
  });

  it('never lets the read of a view the user left win over the newer one', async () => {
    device({ permission: BLOCKED });
    await openHome();
    await wait(ANSWER_MS);

    await moveMap(FAR_AWAY);
    await moveMap(CENTRE);
    await wait(3 * ANSWER_MS);
    expect(screen.getByRole('header', { name: 'Going the same way?' })).toBeOnTheScreen();

    await moveMap({ ...CENTRE, latitude: CENTRE.latitude - 0.03 });
    await moveMap(FAR_AWAY);
    await wait(3 * ANSWER_MS);
    expect(screen.getByRole('header', { name: 'No ride plans out here.' })).toBeOnTheScreen();
    expect(screen.queryByText(/ride plans in this view/)).not.toBeOnTheScreen();
  });

  it('asks to zoom in on a view wider than discovery reads', async () => {
    device({ permission: BLOCKED });
    await openHome();

    await moveMap({ ...DEMO_CITY_REGION, latitudeDelta: 1.2, longitudeDelta: 1.2 });

    expect(screen.getByRole('header', { name: 'Zoom in to see ride plans.' })).toBeOnTheScreen();
  });

  it('shows the last view as stale while offline, with no exposure, and refreshes on reconnect', async () => {
    const events = recordAnalytics();
    device({ permission: BLOCKED });
    await openHome();
    await wait(ANSWER_MS);

    await openDemoControlsAndReturn(() => userEvent.press(screen.getByRole('radio', { name: 'Offline' })));

    expect(screen.getByText(/^Offline · last updated /)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Showing the last view.' })).toBeOnTheScreen();
    expect(screen.getByText('Actions won’t be queued for later.')).toBeOnTheScreen();

    // Moving while offline keeps the last view: the new view's read waits for the connection.
    await moveMap(CENTRE);
    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'Showing the last view.' })).toBeOnTheScreen();
    const exposuresOffline = events().filter((event) => event.name === 'nearby_activity_exposed').length;

    await openDemoControlsAndReturn(() => userEvent.press(screen.getByRole('radio', { name: 'Online' })));
    await wait(3 * ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Going the same way?' })).toBeOnTheScreen();
    expect(exposuresOffline).toBe(1);
    expect(events().filter((event) => event.name === 'nearby_activity_exposed').length).toBeGreaterThan(1);
  });
});

describe('describeDiscovery', () => {
  const snapshot = (count: number, truncated = false): NearbySnapshotDto =>
    ({
      items: Array.from({ length: count }, (_, index) => ({
        kind: index % 2 === 0 ? 'ride' : 'group',
        id: `item-${index}`,
      })),
      truncated,
      previews: [],
    }) as unknown as NearbySnapshotDto;
  const failure = (code: 'UNSUPPORTED_AREA' | 'SERVICE_UNAVAILABLE') =>
    new DataError('source', 'Synthetic failure', { body: { code, message: 'Synthetic failure' } as never });
  const base = {
    viewportReadable: true,
    connection: 'connected' as const,
    placeholder: false,
    error: null,
    updatedAt: 1,
  };

  it('tells loading, offline and failure apart before any snapshot', () => {
    expect(describeDiscovery({ ...base, data: undefined }).kind).toBe('loading');
    expect(describeDiscovery({ ...base, data: undefined, connection: 'disconnected' }).kind).toBe('offline');
    expect(describeDiscovery({ ...base, data: undefined, error: failure('SERVICE_UNAVAILABLE') })).toEqual({
      kind: 'failed',
      unsupported: false,
    });
    expect(describeDiscovery({ ...base, viewportReadable: false, data: undefined }).kind).toBe('too-wide');
  });

  it('reports a failed moved view as failed, never with the previous view’s items', () => {
    expect(
      describeDiscovery({ ...base, data: snapshot(3), placeholder: true, error: failure('UNSUPPORTED_AREA') }),
    ).toEqual({ kind: 'failed', unsupported: true });
  });

  it('marks a snapshot it cannot refresh as stale', () => {
    expect(describeDiscovery({ ...base, data: snapshot(2), error: failure('SERVICE_UNAVAILABLE') })).toMatchObject({
      kind: 'stale',
      offline: false,
    });
    expect(describeDiscovery({ ...base, data: snapshot(0), connection: 'disconnected' })).toMatchObject({
      kind: 'stale',
      offline: true,
    });
  });

  it('tells activity from an empty area', () => {
    expect(describeDiscovery({ ...base, data: snapshot(2), placeholder: true })).toMatchObject({
      kind: 'active',
      updating: true,
    });
    expect(describeDiscovery({ ...base, data: snapshot(0) })).toEqual({ kind: 'empty', updating: false });
  });

  it('never presents a truncated list as a complete count', () => {
    expect(describeActivity(snapshot(100, true))).toBe(
      'At least 100 ride plans in this view. Zoom in to see a smaller area.',
    );
    expect(describeActivity(snapshot(3))).toBe('3 ride plans in this view: 2 riders and 1 group.');
    expect(describeActivity(snapshot(1))).toBe('1 ride plan in this view: 1 rider.');
  });
});

describe('DiscoveryPanel failure', () => {
  it('says nobody knows whether anyone is nearby, and retries on request', async () => {
    const onRetry = jest.fn();
    const state: DiscoveryState = { kind: 'failed', unsupported: false };
    await render(<DiscoveryPanel state={state} onRetry={onRetry} />);

    expect(screen.getByText('Couldn’t load ride plans')).toBeOnTheScreen();
    expect(screen.getByText('Nearby activity didn’t load. We don’t know whether anyone is nearby.')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Retry discovery' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('toViewport', () => {
  it('rounds the visible region outward to hundredths', () => {
    expect(toViewport({ latitude: 42.874, longitude: 74.6, latitudeDelta: 0.01, longitudeDelta: 0.01 })).toEqual({
      southWest: { latitude: 42.86, longitude: 74.59 },
      northEast: { latitude: 42.88, longitude: 74.61 },
    });
  });

  it('keeps small moves inside the same viewport', () => {
    const a = toViewport({ latitude: 42.8741, longitude: 74.6012, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    const b = toViewport({ latitude: 42.8743, longitude: 74.6014, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    expect(a).toEqual(b);
  });

  it('refuses a view wider than half a degree', () => {
    expect(toViewport({ latitude: 42.87, longitude: 74.6, latitudeDelta: 0.6, longitudeDelta: 0.1 })).toBeNull();
    expect(toViewport({ latitude: 42.87, longitude: 74.6, latitudeDelta: 0.12, longitudeDelta: 0.12 })).not.toBeNull();
  });
});
