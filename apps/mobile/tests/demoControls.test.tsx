import type { MapViewport } from '@ride-match/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AppDataSource } from '../src/data/AppDataSource';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import { createMockDevControls } from '../src/data/mock/createMockDevControls';
import { MOCK_SCENARIO_KEYS, type MockScenarioKey } from '../src/data/mock/scenarios';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { DemoScenariosScreen } from '../src/features/demo/DemoScenariosScreen';
import { openHome, press, wait } from './helpers/locationDevice';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';
import { flushTimersAndRestore, renderApp } from './helpers/renderApp';

const START = Date.parse('2026-11-01T09:00:00.000Z');
const LATENCY_MS = MOCK_LATENCY_MS;
const CITY: MapViewport = { southWest: { latitude: 42.75, longitude: 74.4 }, northEast: { latitude: 43.1, longitude: 74.8 } };
const AREA = { center: { latitude: 42.87, longitude: 74.6 }, radiusMeters: 10_000 };

let simulators: Simulator<MockWorld>[] = [];

function setup(scenario: MockScenarioKey = 'active-neighborhood') {
  const simulator = createMockSimulator(scenario, { latencyMs: { min: LATENCY_MS, max: LATENCY_MS } });
  simulators.push(simulator);
  return { simulator, dataSource: createMockDataSource(simulator), controls: createMockDevControls(simulator, scenario) };
}


const nearbyIds = async (dataSource: AppDataSource) =>
  (await settle(dataSource.rides.getNearby({ viewport: CITY, limit: 100 }))).items.map((item) => item.id);

describe('createMockDevControls', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
  });

  afterEach(() => {
    simulators.forEach((simulator) => simulator.dispose());
    simulators = [];
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('lists every documented scenario once, with exactly the implemented ones available', () => {
    const { controls } = setup();

    expect(controls.scenarios).toHaveLength(14);
    expect(new Set(controls.scenarios.map((scenario) => scenario.key)).size).toBe(14);
    expect(controls.scenarios.filter((scenario) => scenario.available).map((scenario) => scenario.key)).toEqual(
      MOCK_SCENARIO_KEYS,
    );
  });

  it('starts another scenario in the same data source, from that scenario’s own seed', async () => {
    const { simulator, dataSource, controls } = setup();
    const listener = jest.fn();
    controls.subscribe(listener);
    const watchers = simulator.stats().connectionWatchers;
    const active = await nearbyIds(dataSource);
    expect(active.length).toBeGreaterThan(0);
    const pending = dataSource.places.search({ area: AREA, limit: 5 });

    controls.selectScenario('empty-neighborhood');

    await expect(pending).rejects.toMatchObject({ kind: 'network' });
    expect(controls.getSnapshot()).toEqual({ scenario: 'empty-neighborhood', connection: 'connected', timeAheadMs: 0 });
    expect(listener).toHaveBeenCalled();
    expect(await nearbyIds(dataSource)).toEqual([]);
    expect(simulator.stats().connectionWatchers).toBe(watchers);

    controls.selectScenario('active-neighborhood');
    expect(await nearbyIds(dataSource)).toEqual(active);
    // Switching leaves nothing behind: the same timers and listeners as a fresh simulator.
    expect(simulator.stats()).toEqual(setup('active-neighborhood').simulator.stats());
  });

  it('refuses a scenario that is not built', () => {
    const { controls } = setup();

    expect(() => controls.selectScenario('group-formation')).toThrow(RangeError);
    expect(controls.getSnapshot().scenario).toBe('active-neighborhood');
  });

  it('moves the source’s clock, drops the connection, and restarts both', async () => {
    const { simulator, dataSource, controls } = setup();

    controls.advanceTime(5 * 60_000);
    expect(controls.getSnapshot().timeAheadMs).toBe(5 * 60_000);
    expect(simulator.clock.now()).toBe(START + 5 * 60_000);

    controls.setConnection('disconnected');
    expect(controls.getSnapshot().connection).toBe('disconnected');
    await expect(settle(dataSource.places.search({ area: AREA, limit: 5 }))).rejects.toMatchObject({ kind: 'network' });

    controls.reset();
    expect(controls.getSnapshot()).toEqual({ scenario: 'active-neighborhood', connection: 'connected', timeAheadMs: 0 });
    expect(simulator.clock.now()).toBe(Date.now());
    await expect(settle(dataSource.places.search({ area: AREA, limit: 5 }))).resolves.not.toHaveLength(0);
  });

  it('queues failures for the next requests, in order', async () => {
    const { dataSource, controls } = setup();
    const search = () => settle(dataSource.places.search({ area: AREA, limit: 5 }));

    controls.failNext('refused');
    controls.failNext('no-answer');

    await expect(search()).rejects.toMatchObject({ kind: 'source', body: expect.objectContaining({ code: 'SERVICE_UNAVAILABLE' }) });
    await expect(search()).rejects.toMatchObject({ kind: 'network' });
    await expect(search()).resolves.not.toHaveLength(0);
  });

  it('stops telling a listener once it unsubscribes', () => {
    const { controls } = setup();
    const listener = jest.fn();
    const unsubscribe = controls.subscribe(listener);

    unsubscribe();
    controls.advanceTime(1_000);

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('DemoScenariosScreen', () => {
  afterEach(() => {
    simulators.forEach((simulator) => simulator.dispose());
    simulators = [];
  });

  it('clears reads cached from the old world when a scenario starts', async () => {
    const { controls } = setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
    queryClient.setQueryData(['nearby'], { items: ['from the old world'] });
    await render(
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <DemoScenariosScreen controls={controls} onBack={jest.fn()} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );

    await userEvent.press(screen.getByRole('radio', { name: /^Quiet neighbourhood/ }));

    expect(queryClient.getQueryData(['nearby'])).toBeUndefined();
    expect(controls.getSnapshot().scenario).toBe('empty-neighborhood');
    queryClient.clear();
  });
});

describe('demo scenarios route', () => {
  afterEach(async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    await flushTimersAndRestore();
  });

  it('opens from the Demo badge and lists the scenarios, with only built ones selectable', async () => {
    const app = await openHome();

    await press('Demo scenarios');

    expect(app.getPathname()).toBe('/dev/scenarios');
    expect(screen.getByRole('header', { name: 'Demo scenarios' })).toBeOnTheScreen();
    expect(screen.getByText('Development / preview only')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Active neighbourhood/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Quiet neighbourhood/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /^Quiet neighbourhood/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Last seat taken, Capacity conflict, not built yet' })).toBeDisabled();
    expect(screen.getByText('Not available in production builds. Mock state resets on cold reload.')).toBeOnTheScreen();

    await press('Back');
    expect(app.getPathname()).toBe('/');
  });

  it('starts scenarios over and drives the source, announcing each action', async () => {
    await renderApp('/dev/scenarios');
    await wait();

    await userEvent.press(screen.getByRole('radio', { name: /^Quiet neighbourhood/ }));
    expect(screen.getByRole('radio', { name: /^Quiet neighbourhood/ })).toBeChecked();
    expect(screen.getByText('Quiet neighbourhood started from the beginning.')).toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('Quiet neighbourhood started from the beginning.');

    await press('Move time 5 minutes ahead');
    await press('Move time 30 seconds ahead');
    expect(screen.getByText('Quiet neighbourhood · 5 min 30 s ahead')).toBeOnTheScreen();

    await press('Restart this scenario');
    expect(screen.getByText('Quiet neighbourhood · real time')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('radio', { name: 'Offline' }));
    expect(screen.getByRole('radio', { name: 'Offline' })).toBeChecked();
    expect(screen.getByText('Offline: requests fail and live updates stop.')).toBeOnTheScreen();

    await press('Next request is refused');
    expect(screen.getByText('Queued: the next request is refused.')).toBeOnTheScreen();
  });

  it('offers no entry on home in a production build', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    await openHome();

    expect(screen.getByText('Demo')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Demo scenarios' })).not.toBeOnTheScreen();
  });

  it('shows an unavailable state, not a redirect, in a production build', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    const app = await renderApp('/dev/scenarios');

    expect(app.getPathname()).toBe('/dev/scenarios');
    expect(
      screen.getByText('Demo scenarios are only available in development and preview builds that use mock data.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('radio')).not.toBeOnTheScreen();

    await press('Go to map');
    expect(app.getPathname()).toBe('/');
  });
});
