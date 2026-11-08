import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import type { NearbyItemDto, RideRequestDto } from '@ride-match/contracts';

import { DataError } from '../src/data/errors';
import { describeGroupAvailability } from '../src/features/discovery/PreviewPanel';
import { describePreview } from '../src/features/discovery/useTargetPreview';
import { BLOCKED, device, openHome, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;

async function openScenario(scenario = 'active-neighborhood') {
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = scenario;
  device({ permission: BLOCKED });
  const app = await openHome();
  await wait(ANSWER_MS);
  return app;
}

/** Taps the discovery marker whose label matches, as a rider taps a pill on the map. */
async function tapMarker(name: RegExp) {
  const marker = screen.getAllByLabelText(name).find((node) => node.props.testID === 'map-marker')!;
  await act(async () => {
    fireEvent.press(marker);
  });
}

async function signInWithDemoCode() {
  await press('Continue with demo identity');
  await wait(ANSWER_MS);
  await userEvent.type(screen.getByLabelText('Demo code'), '123456');
  await press('Verify demo code');
  await wait(ANSWER_MS);
}

describe('ride and group previews', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('checks a ride again before offering to join, and shows only public fields (05)', async () => {
    await openScenario();
    await tapMarker(/^Aida → Asia Mall, /);

    // The map's copy fills the sheet while the source confirms the ride; no join yet.
    expect(screen.getByRole('header', { name: 'Ride preview' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Heading to Asia Mall' })).toBeOnTheScreen();
    expect(screen.getByText('Checking it’s still available…')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Plan to join this rider' })).not.toBeOnTheScreen();

    await wait(ANSWER_MS);
    expect(screen.queryByText('Checking it’s still available…')).not.toBeOnTheScreen();
    expect(screen.getByText('Aida')).toBeOnTheScreen();
    expect(screen.getByText(/^One seat · Public (demo )?profile$/)).toBeOnTheScreen();
    expect(
      screen.getByText('This pin is approximate. A shared meeting point appears after you join a group.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Plan to join this rider' })).toBeOnTheScreen();
    // The discovery panel gives way to the preview, and the marker stays highlighted.
    expect(screen.getByLabelText(/^Aida → Asia Mall, .*, selected$/)).toBeOnTheScreen();
  });

  it('shows a forming group’s free seats and its join action, never its members (19)', async () => {
    await openScenario();
    await tapMarker(/^Group → TSUM, /);
    await wait(ANSWER_MS);

    expect(screen.getByRole('header', { name: 'Group preview' })).toBeOnTheScreen();
    expect(screen.getByText('Forming · one seat open')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Room for one more.' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create a request to join' })).toBeOnTheScreen();
    // Members of the seeded group are not named anywhere.
    for (const member of ['Gulnara', 'Ilyas', 'Jyldyz']) expect(screen.queryByText(new RegExp(member))).toBeNull();
  });

  it('offers no join for a ready group', async () => {
    await openScenario();
    await tapMarker(/^Group → (?!TSUM)/);
    await wait(ANSWER_MS);

    expect(screen.getByText('Ready · not taking riders')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Create a request to join' })).not.toBeOnTheScreen();
  });

  it('turns an expiring ride’s open preview into “no longer available” and refreshes (55)', async () => {
    await openScenario();
    // Bakyt's request reaches its deadline 20 seconds after the scenario starts.
    await tapMarker(/^Bakyt → /);
    await wait(ANSWER_MS);
    expect(screen.getByRole('button', { name: 'Plan to join this rider' })).toBeOnTheScreen();

    await wait(20_000);

    expect(screen.getByRole('header', { name: 'Ride no longer available' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'That plan has changed.' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Plan to join this rider' })).not.toBeOnTheScreen();

    await press('Refresh nearby plans');
    await wait(ANSWER_MS);
    expect(screen.queryByRole('header', { name: 'That plan has changed.' })).not.toBeOnTheScreen();
    expect(screen.queryAllByLabelText(/^Bakyt → /)).toHaveLength(0);
  });

  it('a join asks an anonymous rider to sign in, then drafts the request it needs and reserves nothing', async () => {
    const app = await openScenario();
    await tapMarker(/^Aida → Asia Mall, /);
    await wait(ANSWER_MS);

    await press('Plan to join this rider');
    expect(app.getPathname()).toBe('/auth/phone');

    await signInWithDemoCode();

    expect(app.getPathname()).toBe('/');
    // Signed in, the target is read again before anything is offered.
    expect(screen.getByText('Checking it’s still available…')).toBeOnTheScreen();
    await wait(ANSWER_MS);
    // Joining needs the rider's own request: a draft to the ride's destination opens, unpublished.
    expect(screen.getByRole('header', { name: 'When are you leaving?' })).toBeOnTheScreen();
    expect(screen.getAllByText('Asia Mall').length).toBeGreaterThan(0);

    await press('Keep browsing');
    expect(screen.getByRole('header', { name: 'Heading to Asia Mall' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Plan to join this rider' })).toBeOnTheScreen();
    expect(screen.queryByText(/^Searching · /)).not.toBeOnTheScreen();

    await pressLast('Back to map');
    expect(screen.queryByRole('header', { name: 'Ride preview' })).not.toBeOnTheScreen();
  });
});

describe('preview pieces', () => {
  const ride = {
    id: 'ride_a',
    user: { id: 'u_a', displayName: 'Aida', avatarUrl: null },
    publicOrigin: { center: { latitude: 42.87, longitude: 74.6 }, radiusMeters: 500, label: null },
    destination: {
      id: 'place_asia_mall',
      label: 'Asia Mall',
      detail: null,
      coordinates: { latitude: 42.85, longitude: 74.58 },
    },
    departureAt: '2026-11-07T10:05:00.000Z',
    expiresAt: '2026-11-07T10:15:00.000Z',
    version: 1,
  } as RideRequestDto;
  const seed = { ...ride, kind: 'ride' } as NearbyItemDto;
  const target = { kind: 'ride', id: 'ride_a' } as const;
  const unavailable = new DataError('source', 'gone', {
    body: { code: 'TARGET_UNAVAILABLE', message: 'Target unavailable', requestId: 'req_1' },
  });
  const network = new DataError('network', 'offline');

  it('lets “gone” win over an older copy, and keeps the last copy when a check fails', () => {
    expect(describePreview({ target, data: ride, error: unavailable, seed })).toEqual({ kind: 'gone' });
    expect(describePreview({ target, data: undefined, error: network, seed })).toEqual({ kind: 'failed', item: seed });
    expect(describePreview({ target, data: undefined, error: null, seed })).toEqual({ kind: 'checking', item: seed });
    expect(describePreview({ target, data: ride, error: null, seed: null })).toEqual({ kind: 'available', item: seed });
  });

  it('says how many seats a group has, and only a forming group with one takes riders', () => {
    expect(describeGroupAvailability({ status: 'forming', memberCount: 2, capacity: 4 })).toEqual({
      joinable: true,
      badge: 'Forming · two seats open',
      headline: 'Room for two more.',
    });
    expect(describeGroupAvailability({ status: 'forming', memberCount: 4, capacity: 4 }).joinable).toBe(false);
    expect(describeGroupAvailability({ status: 'ready', memberCount: 2, capacity: 4 }).joinable).toBe(false);
  });
});
