import { screen, userEvent } from '@testing-library/react-native';
import type { MatchPreviewDto, NearbyItemDto, NearbySnapshotDto } from '@ride-match/contracts';

import * as sinks from '../src/analytics/sinks';
import { createMemorySink } from '../src/analytics/sinks';
import { summarizeDestination } from '../src/features/destinations/DestinationPanel';
import { bestMatch, indexMatches, matchLabel } from '../src/features/destinations/matches';
import { BLOCKED, device, openHome, press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** The stand-in map's camera commands (`tests/setup/reactNativeMaps.ts`). */
const { animateToRegion } = jest.requireMock<{ animateToRegion: jest.Mock }>('react-native-maps');

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;
// The place search's debounce plus an answer.
const SEARCH_MS = 300 + ANSWER_MS;

const markerNamed = (name: RegExp) =>
  screen.getAllByLabelText(name).find((node) => node.props.testID === 'map-marker')!;
const matchedMarkers = () =>
  screen.queryAllByLabelText(/ match(, selected)?$/).filter((node) => node.props.testID === 'map-marker');

async function openScenario() {
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  device({ permission: BLOCKED });
  const app = await openHome();
  await wait(ANSWER_MS);
  return app;
}

/** Opens the destination sheet, searches, and picks the row named `row`, without waiting for discovery. */
async function chooseDestination(text: string, row: RegExp) {
  await press(/^(Choose|Change) destination$|^Choose a destination$/);
  await userEvent.type(screen.getByLabelText('Destination'), text);
  await wait(SEARCH_MS);
  await press(row);
}

function recordAnalytics() {
  const sink = createMemorySink();
  jest.spyOn(sinks, 'selectAnalyticsSink').mockReturnValue(sink);
  return () => sink.events().map((event) => event.name);
}

describe('destination selection', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
  });

  it('chooses a curated destination and emphasizes its matches without hiding other plans (03, 04)', async () => {
    const events = recordAnalytics();
    await openScenario();
    expect(screen.getByRole('header', { name: 'Where are you heading?' })).toBeOnTheScreen();
    const camera = animateToRegion.mock.calls.length;
    const markersBefore = screen.getAllByTestId('map-marker').length;

    await press('Choose a destination');
    expect(screen.getByRole('header', { name: 'Where to?' })).toBeOnTheScreen();
    expect(screen.getByText('Curated demo destinations. Search does not use a live places service.')).toBeOnTheScreen();
    await userEvent.type(screen.getByLabelText('Destination'), 'Asia');
    await wait(SEARCH_MS);
    await press('Asia Mall, Shopping centre');

    // The sheet closed on the choice; the destination's read is on its way.
    expect(screen.queryByRole('header', { name: 'Where to?' })).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Asia Mall' })).toBeOnTheScreen();
    expect(screen.getByText('Looking for plans going your way…')).toBeOnTheScreen();
    expect(matchedMarkers()).toHaveLength(0);

    await wait(ANSWER_MS);
    expect(screen.getByText('Excellent match nearby')).toBeOnTheScreen();
    expect(screen.getByText('2 plans share your direction.')).toBeOnTheScreen();
    expect(markerNamed(/^Aida → Asia Mall, /).props.accessibilityLabel).toMatch(/, excellent match$/);
    expect(markerNamed(/^Elnura → /).props.accessibilityLabel).toMatch(/, good match$/);
    // Unrelated plans stay on the map, and the camera never moved for the destination.
    expect(markerNamed(/^Farkhat → /).props.accessibilityLabel).not.toMatch(/match/);
    expect(screen.getAllByTestId('map-marker')).toHaveLength(markersBefore);
    expect(animateToRegion.mock.calls.length).toBe(camera);
    expect(events().filter((name) => name === 'destination_selected')).toHaveLength(1);
  });

  it('inspects the highlighted ride, with its match in the preview and the list', async () => {
    await openScenario();
    await chooseDestination('Asia', /^Asia Mall, /);
    await wait(ANSWER_MS);

    await press('View nearby items');
    expect(screen.getByRole('button', { name: /^Aida → Asia Mall, Excellent match · / })).toBeOnTheScreen();
    await press('Return to map');

    await press('Inspect highlighted ride');
    expect(screen.getByRole('header', { name: 'Heading to Asia Mall' })).toBeOnTheScreen();
    expect(screen.getByText('Excellent match')).toBeOnTheScreen();
    expect(markerNamed(/^Aida → /).props.accessibilityLabel).toMatch(/, excellent match, selected$/);
    expect(animateToRegion).toHaveBeenLastCalledWith(
      expect.objectContaining({ latitude: 42.815, longitude: 74.626 }),
      expect.any(Number),
    );
  });

  it('clearing the destination restores general browsing', async () => {
    await openScenario();
    await chooseDestination('Asia', /^Asia Mall, /);
    await wait(ANSWER_MS);
    expect(matchedMarkers().length).toBeGreaterThan(0);

    await press('Clear destination');
    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Where are you heading?' })).toBeOnTheScreen();
    expect(matchedMarkers()).toHaveLength(0);
  });

  it('never lets an earlier destination’s result answer for a newer one', async () => {
    await openScenario();
    await chooseDestination('Asia', /^Asia Mall, /);
    // Changed before the Asia Mall read could answer.
    await chooseDestination('Western', /^Western Bus Station, /);
    expect(matchedMarkers()).toHaveLength(0);

    await wait(ANSWER_MS);
    expect(screen.getByRole('header', { name: 'Western Bus Station' })).toBeOnTheScreen();
    expect(
      screen.getByText('No plans going your way in this view yet. Other plans stay on the map.'),
    ).toBeOnTheScreen();
    expect(matchedMarkers()).toHaveLength(0);
  });

  it('shows the newest search’s results when typing moves on', async () => {
    await openScenario();
    await press('Choose a destination');
    const field = screen.getByLabelText('Destination');
    await userEvent.type(field, 'Asia');
    await wait(6000);
    await userEvent.clear(field);
    await userEvent.type(field, 'TSUM');
    // The debounce first (React renders its new text once this act ends), then long enough for the
    // earlier "Asia" read to finish too: it must not replace the newer results.
    await wait(350);
    await wait(2 * ANSWER_MS);

    expect(screen.getByRole('button', { name: 'TSUM, Department store' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Asia Mall, Shopping centre' })).not.toBeOnTheScreen();
  });
});

describe('destination pieces', () => {
  const item = (id: string, kind: 'ride' | 'group' = 'ride') => ({ kind, id }) as NearbyItemDto;
  const match = (id: string, level: MatchPreviewDto['level']): MatchPreviewDto => ({
    target: { kind: 'ride', id },
    level,
    additionalMinutes: 0,
  });
  const snapshot = (items: NearbyItemDto[], previews: MatchPreviewDto[] = []) =>
    ({ items, truncated: false, previews }) as NearbySnapshotDto;

  it('picks the best level first, then the source’s order', () => {
    const items = [item('a'), item('b'), item('c')];
    const matches = indexMatches([match('a', 'possible'), match('b', 'excellent'), match('c', 'excellent')]);
    expect(bestMatch(items, matches)?.item.id).toBe('b');
    expect(bestMatch(items, indexMatches([]))).toBeNull();
    expect(matchLabel('good')).toBe('Good match');
  });

  it('sums up only a snapshot read for the current destination', () => {
    const items = [item('a'), item('b')];
    const matches = indexMatches([match('b', 'good')]);
    const active = (m: typeof matches | null) =>
      ({ kind: 'active', snapshot: snapshot(items), updating: false, matches: m }) as const;

    expect(summarizeDestination(active(null))).toEqual({ kind: 'checking' });
    expect(summarizeDestination(active(matches))).toEqual({ kind: 'best', item: items[1], level: 'good', count: 1 });
    expect(summarizeDestination(active(indexMatches([])))).toEqual({ kind: 'none' });
    expect(summarizeDestination({ kind: 'loading', matches: null })).toEqual({ kind: 'checking' });
    expect(summarizeDestination({ kind: 'empty', updating: false, matches: indexMatches([]) })).toEqual({
      kind: 'none',
    });
    expect(
      summarizeDestination({
        kind: 'stale',
        snapshot: snapshot(items),
        updatedAt: 0,
        offline: true,
        matches: null,
      }),
    ).toEqual({ kind: 'unknown' });
    expect(summarizeDestination({ kind: 'failed', unsupported: false, matches: null })).toEqual({
      kind: 'unknown',
    });
  });
});
