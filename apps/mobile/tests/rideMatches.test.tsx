import { screen, userEvent } from '@testing-library/react-native';

import * as sinks from '../src/analytics/sinks';
import { createMemorySink } from '../src/analytics/sinks';
import * as mockSource from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { BLOCKED, device, openHome, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;
const SEARCH_MS = 300 + ANSWER_MS;

const aidaMarker = () =>
  screen.getAllByLabelText(/^Aida → Asia Mall, /).find((node) => node.props.testID === 'map-marker')!;

function recordAnalytics() {
  const sink = createMemorySink();
  jest.spyOn(sinks, 'selectAnalyticsSink').mockReturnValue(sink);
  return () => sink.events();
}

/** Keeps the simulator the app composes, to queue a failure as the demo controls would. */
function captureSimulator() {
  const original = mockSource.createMockSimulator;
  const captured: { simulator: Simulator<MockWorld> | null } = { simulator: null };
  jest.spyOn(mockSource, 'createMockSimulator').mockImplementation((...args) => {
    captured.simulator = original(...args);
    return captured.simulator;
  });
  return captured;
}

/** Up to the review: Asia Mall, a named pickup, sign-in. */
async function reviewRequest(scenario: string) {
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = scenario;
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
  return app;
}

describe('a match for the rider’s request (scenario C)', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('shows the supplied match on the card and the map, and opens it for review (11)', async () => {
    const events = recordAnalytics();
    await reviewRequest('match-appears');
    await press('Publish my request');
    await wait(ANSWER_MS);
    expect(screen.getByText(/^Let’s find your people/)).toBeOnTheScreen();
    expect(aidaMarker().props.accessibilityLabel).not.toMatch(/match/);

    await wait(5_000);
    await wait(ANSWER_MS);

    expect(screen.getByText('Someone’s going your way.')).toBeOnTheScreen();
    expect(screen.getByText(/^Aida → Asia Mall · Leaving in \d+ min$/)).toBeOnTheScreen();
    expect(aidaMarker().props.accessibilityLabel).toMatch(/, excellent match$/);
    expect(events().filter((event) => event.name === 'match_found')).toEqual([
      expect.objectContaining({ properties: { level: 'excellent', kind: 'ride' } }),
    ]);

    await press('Review and join');
    expect(screen.getByRole('header', { name: 'Heading to Asia Mall' })).toBeOnTheScreen();
    expect(screen.getByText('Excellent match')).toBeOnTheScreen();
    await pressLast('Back to map');

    await press('Keep looking');
    expect(screen.queryByText('Someone’s going your way.')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeOnTheScreen();
  });

  it('removes the match when it expires, while the request keeps searching', async () => {
    await reviewRequest('match-appears');
    await press('Publish my request');
    await wait(ANSWER_MS);
    await wait(5_000);
    await wait(ANSWER_MS);
    expect(screen.getByText('Someone’s going your way.')).toBeOnTheScreen();

    for (let minute = 0; minute < 3; minute += 1) await wait(60_000);
    await wait(2 * ANSWER_MS);

    expect(screen.queryByText('Someone’s going your way.')).not.toBeOnTheScreen();
    expect(aidaMarker().props.accessibilityLabel).not.toMatch(/match/);
    expect(screen.getByText(/^Searching · /)).toBeOnTheScreen();
  });
});

describe('an unknown create outcome (30)', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('checks the current request and finds the one created, without publishing again', async () => {
    const captured = captureSimulator();
    const events = recordAnalytics();
    await reviewRequest('empty-neighborhood');
    const simulator = captured.simulator!;
    simulator.failNext({ kind: 'network', afterCommit: true }, 'rides.create');

    await press('Publish my request');
    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'We’re checking what happened.' })).toBeOnTheScreen();

    await press('Check current request');
    await wait(ANSWER_MS);

    expect(screen.queryByRole('header', { name: 'We’re checking what happened.' })).not.toBeOnTheScreen();
    expect(screen.getByText(/^Searching · /)).toBeOnTheScreen();
    expect([...simulator.state.rides.values()]).toHaveLength(1);
    expect(events().filter((event) => event.name === 'ride_request_created')).toHaveLength(1);
  });

  it('retrying sends the same operation, so the source returns the one request', async () => {
    const captured = captureSimulator();
    await reviewRequest('empty-neighborhood');
    const simulator = captured.simulator!;
    simulator.failNext({ kind: 'network', afterCommit: true }, 'rides.create');
    await press('Publish my request');
    await wait(ANSWER_MS);

    await press('Retry this request');
    await wait(ANSWER_MS);

    expect(screen.getByText(/^Searching · /)).toBeOnTheScreen();
    expect([...simulator.state.rides.values()]).toHaveLength(1);
  });

  it('says nothing was created when the answer was lost before the source acted', async () => {
    const captured = captureSimulator();
    await reviewRequest('empty-neighborhood');
    captured.simulator!.failNext({ kind: 'network' }, 'rides.create');
    await press('Publish my request');
    await wait(ANSWER_MS);

    await press('Check current request');
    await wait(ANSWER_MS);

    expect(
      screen.getByText('No live request was found, so it wasn’t created. You can retry it now.'),
    ).toBeOnTheScreen();
    expect([...captured.simulator!.state.rides.values()]).toHaveLength(0);
  });
});
