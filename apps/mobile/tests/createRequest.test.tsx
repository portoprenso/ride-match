import { screen, userEvent } from '@testing-library/react-native';

import * as sinks from '../src/analytics/sinks';
import { createMemorySink } from '../src/analytics/sinks';
import { DataError } from '../src/data/errors';
import { createOperationId } from '../src/data/operationId';
import type { LocationStatus } from '../src/platform/location/createLocationController';
import { toConfirmedPickup } from '../src/features/location/LocationChoicesProvider';
import { describeCreateError, describeDeparture, resolveOrigin } from '../src/features/rides/rideDraft';
import { BLOCKED, device, openHome, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;
const SEARCH_MS = 300 + ANSWER_MS;

/** The draft's pickup line in the sheet (home's location card names the pickup too). */
const draftPickup = () => screen.getByText('Pickup area · Check the exact point before posting');
const reviewPickup = () => screen.getByText('Pickup · Exact point stays private');

function recordAnalytics() {
  const sink = createMemorySink();
  jest.spyOn(sinks, 'selectAnalyticsSink').mockReturnValue(sink);
  return () => sink.events();
}

async function openWithDestination() {
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'empty-neighborhood';
  device({ permission: BLOCKED });
  const app = await openHome();
  await wait(ANSWER_MS);
  await press('Choose a destination');
  await userEvent.type(screen.getByLabelText('Destination'), 'Asia');
  await wait(SEARCH_MS);
  await press('Asia Mall, Shopping centre');
  await wait(ANSWER_MS);
  return app;
}

async function signInWithDemoCode() {
  await press('Continue with demo identity');
  await wait(ANSWER_MS);
  await userEvent.type(screen.getByLabelText('Demo code'), '123456');
  await press('Verify demo code');
  await wait(ANSWER_MS);
}

describe('creating a ride request', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('keeps the draft through pickup and sign-in, reviews it, and publishes it once (06, 09)', async () => {
    const events = recordAnalytics();
    const app = await openWithDestination();

    await press('Create my ride request');
    expect(screen.getByRole('header', { name: 'When are you leaving?' })).toBeOnTheScreen();
    // No location: a pickup comes first, chosen by name inside the same sheet.
    expect(screen.queryByRole('button', { name: 'Continue to sign in' })).not.toBeOnTheScreen();
    await press('Choose a named place');
    await wait(SEARCH_MS);
    await press('Ala-Too Square, City square');
    await press('Confirm this pickup');
    expect(draftPickup()).toBeOnTheScreen();
    expect(screen.getAllByText('Near Ala-Too Square').length).toBeGreaterThan(1);
    await userEvent.press(screen.getByRole('radio', { name: 'In 10 min' }));
    await wait();

    await press('Continue to sign in');
    expect(app.getPathname()).toBe('/auth/phone');
    await signInWithDemoCode();

    // Back on home with the review of the same plan; nothing was published by signing in.
    expect(app.getPathname()).toBe('/');
    expect(screen.getByRole('header', { name: 'Ready to find company?' })).toBeOnTheScreen();
    expect(screen.getByText('Leaving in 10 minutes')).toBeOnTheScreen();
    expect(reviewPickup()).toBeOnTheScreen();
    // The destination shows in the review as well as on home's sheet.
    expect(screen.getAllByText('Asia Mall').length).toBeGreaterThan(1);
    expect(events().some((event) => event.name === 'ride_request_create_clicked')).toBe(false);

    // Two quick presses: the second meets a busy button.
    const publish = screen.getByRole('button', { name: 'Publish my request' });
    await userEvent.press(publish);
    await userEvent.press(publish);
    await wait(ANSWER_MS);

    expect(screen.queryByRole('header', { name: 'Ready to find company?' })).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Your request is published.' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Create my ride request' })).not.toBeOnTheScreen();
    const names = events().map((event) => [event.name, event.properties]);
    expect(names.filter(([name]) => name === 'ride_request_create_clicked')).toEqual([
      ['ride_request_create_clicked', { departureOffsetMinutes: 10, pickup: 'manual' }],
    ]);
    expect(names.filter(([name]) => name === 'ride_request_created')).toEqual([
      ['ride_request_created', { departureOffsetMinutes: 10, pickup: 'manual' }],
    ]);
  });

  it('returns from the review to edit the plan, and closes without publishing', async () => {
    const events = recordAnalytics();
    await openWithDestination();
    await press('Create my ride request');
    await press('Choose a named place');
    await wait(SEARCH_MS);
    await press('Ala-Too Square, City square');
    await press('Confirm this pickup');
    await press('Continue to sign in');
    await signInWithDemoCode();

    await press('Edit plan');
    expect(screen.getByRole('header', { name: 'When are you leaving?' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'In 5 min', checked: true })).toBeOnTheScreen();
    await pressLast('Keep browsing');

    expect(screen.queryByRole('header', { name: 'When are you leaving?' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Your request is published.' })).not.toBeOnTheScreen();
    expect(events().some((event) => event.name === 'ride_request_created')).toBe(false);
  });

  it('leaving sign-in keeps browsing, with the draft but nothing to resume', async () => {
    const app = await openWithDestination();
    await press('Create my ride request');
    await press('Choose a named place');
    await wait(SEARCH_MS);
    await press('Ala-Too Square, City square');
    await press('Confirm this pickup');
    await press('Continue to sign in');

    await press('Close and keep browsing');
    expect(app.getPathname()).toBe('/');
    expect(screen.queryByRole('header', { name: 'Ready to find company?' })).not.toBeOnTheScreen();

    await press('Create my ride request');
    expect(draftPickup()).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue to sign in' })).toBeOnTheScreen();
  });
});

describe('request draft pieces', () => {
  const located = (accuracyMeters: number | null, usableForPickup: boolean): LocationStatus => ({
    kind: 'located',
    fix: {
      coordinates: { latitude: 42.8712, longitude: 74.5934 },
      accuracyMeters,
      capturedAt: Date.parse('2026-11-07T10:00:00.000Z'),
      approximate: false,
    },
    assessment: { age: usableForPickup ? 'fresh' : 'stale', accurate: true, usableForPickup },
    refreshing: false,
  });

  it('prefers a confirmed pickup, then a usable fix, and never guesses one', () => {
    const pickup = toConfirmedPickup({
      id: 'place_ala_too',
      label: 'Ala-Too Square',
      detail: 'City square',
      coordinates: { latitude: 42.8765, longitude: 74.6037 },
    });
    expect(resolveOrigin(pickup, located(20, true))).toEqual({
      input: { source: 'manual', coordinates: { latitude: 42.8765, longitude: 74.6037 } },
      description: 'Near Ala-Too Square',
    });
    expect(resolveOrigin(null, located(20, true))).toEqual({
      input: {
        source: 'device',
        coordinates: { latitude: 42.8712, longitude: 74.5934 },
        accuracyMeters: 20,
        capturedAt: '2026-11-07T10:00:00.000Z',
      },
      description: 'Your current location (±20 m)',
    });
    expect(resolveOrigin(null, located(20, false))).toBeNull();
    expect(resolveOrigin(null, { kind: 'denied', canAskAgain: false })).toBeNull();
  });

  it('tells what a failed create means: existing, edit, retry or sign in', () => {
    const refused = (code: string) =>
      new DataError('source', 'refused', { body: { code, message: 'Refused', requestId: 'req_1' } as never });
    expect(describeCreateError(refused('ACTIVE_REQUEST_EXISTS')).action).toBe('existing');
    expect(describeCreateError(refused('LOCATION_STALE')).action).toBe('edit');
    expect(describeCreateError(refused('UNSUPPORTED_AREA')).action).toBe('edit');
    expect(describeCreateError(refused('SESSION_EXPIRED')).action).toBe('sign-in');
    expect(describeCreateError(new DataError('network', 'no answer'))).toEqual({
      action: 'retry',
      message: 'We couldn’t confirm it was published. Try again: it won’t be posted twice.',
    });
    expect(describeDeparture(0)).toBe('Leaving now');
  });

  it('makes version 4 UUIDs, a new one each time', () => {
    const first = createOperationId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(createOperationId()).not.toBe(first);
  });
});
