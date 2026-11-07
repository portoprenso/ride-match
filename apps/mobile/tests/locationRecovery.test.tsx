import type { PlaceDto } from '@ride-match/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, userEvent } from '@testing-library/react-native';
import * as Location from 'expo-location';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createUnavailableDataSource } from '../src/data/createUnavailableDataSource';
import { DataSourceProvider } from '../src/data/DataSourceProvider';
import { LocationChoicesProvider, toConfirmedPickup } from '../src/features/location/LocationChoicesProvider';
import { describeLocationCard } from '../src/features/location/locationCard';
import { PickupPlaceSheet } from '../src/features/location/PickupPlaceSheet';
import type { LocationStatus } from '../src/platform/location/createLocationController';
import { assessFix, type LocationFix } from '../src/platform/location/locationFix';
import { BLOCKED, DENIED_CAN_ASK, GRANTED, UNDETERMINED, device, openHome, permission, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** The device position is never read: nothing could stand in for the user's location. */
function expectNoDevicePosition() {
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
}

describe('home location', () => {
  beforeEach(() => device({ permission: GRANTED }));

  afterEach(async () => {
    await flushTimersAndRestore();
  });

  it('introduces location on first use and shows the prompt only when asked', async () => {
    device({ permission: UNDETERMINED, answer: GRANTED });
    await openHome();

    expect(screen.getByRole('header', { name: 'Find a ride, together.' })).toBeOnTheScreen();
    expect(screen.getByText('Demo · synthetic riders')).toBeOnTheScreen();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expectNoDevicePosition();

    await press('Use my location');

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('header', { name: 'Find a ride, together.' })).not.toBeOnTheScreen();
    expect(screen.getByTestId('home-map')).toBeOnTheScreen();
    // Precise, fresh and accurate: nothing to explain.
    expect(screen.queryByText('Location is only used while the app is open.')).not.toBeOnTheScreen();
  });

  it('sets the introduction aside without prompting, and keeps location on offer', async () => {
    device({ permission: UNDETERMINED, answer: BLOCKED });
    await openHome();

    await press('Choose an area instead');

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Location not in use')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose pickup area' })).toBeOnTheScreen();

    await press('Use my location');

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Location is off')).toBeOnTheScreen();
    expect(screen.getByText('Location stays off. You can still choose a place for your pickup.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open device settings' })).toBeOnTheScreen();
  });

  it('explains why the introduction could not ask', async () => {
    device({ permission: UNDETERMINED });
    jest.mocked(Location.requestForegroundPermissionsAsync).mockRejectedValueOnce(new Error('unavailable'));
    await openHome();

    await press('Use my location');

    expect(screen.getByText("Your device didn't show the location prompt. Try again, or choose an area instead.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeEnabled();
  });

  it('keeps browsing after a denial, with no position and a way to the settings', async () => {
    device({ permission: BLOCKED });
    const app = await openHome();

    expect(screen.getByText('Location is off')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Browse from an area.' })).toBeOnTheScreen();
    expect(screen.getByText("Choose a place for your pickup. We won't assume it's your current location.")).toBeOnTheScreen();
    expectNoDevicePosition();

    await press('Open device settings');
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);

    await press('Sign in');
    expect(app.getPathname()).toBe('/auth/phone');
  });

  it('says when the settings did not open', async () => {
    device({ permission: BLOCKED });
    jest.mocked(Linking.openSettings).mockRejectedValueOnce(new Error('refused'));
    await openHome();

    await press('Open device settings');

    expect(screen.getByText("The settings didn't open. Open them from your device's home screen.")).toBeOnTheScreen();
  });

  it('asks again while the prompt can still appear, then points to the settings', async () => {
    // Android: the second denial can still report that the prompt may appear.
    device({ permission: DENIED_CAN_ASK, answer: BLOCKED });
    await openHome();

    await press('Allow location');

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Location stays off. You can still choose a place for your pickup.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Allow location' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open device settings' })).toBeOnTheScreen();
  });

  it('points to location services when iOS reports them as a denial', async () => {
    device({ permission: BLOCKED, servicesEnabled: false });
    await openHome();

    expect(screen.getByText('Location services are off')).toBeOnTheScreen();
    expect(screen.getByText(/Settings, Privacy & Security, Location Services/)).toBeOnTheScreen();

    await press('Open device settings');
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it('says an approximate location cannot be a pickup point', async () => {
    device({ permission: permission('granted', true, 'reduced') });
    await openHome();

    expect(screen.getByText('Approximate location')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose pickup area' })).toBeOnTheScreen();
  });

  it('confirms a named pickup point without the device position', async () => {
    device({ permission: BLOCKED });
    await openHome();

    await press('Choose pickup area');
    await press('Choose a named place');
    expect(screen.getByRole('header', { name: 'Choose a pickup point' })).toBeOnTheScreen();
    await wait(1_000);
    // Without search text, the area's places nearest its center come first.
    expect(screen.getAllByRole('button', { name: /Square|Mall|Park|Bazaar|Station|Airport|Center/ }).length).toBeGreaterThan(5);

    await userEvent.type(screen.getByLabelText('Search places'), 'asia');
    await wait(1_500);
    await press('Asia Mall, Shopping centre');

    // The named list's confirmation, over the map picker's own.
    expect(screen.getAllByRole('header', { name: 'Is this your pickup point?' })).toHaveLength(2);
    expect(screen.getByText('Near Asia Mall (Shopping centre).')).toBeOnTheScreen();
    expect(screen.getAllByText('This point stays fixed after you publish your request.')).toHaveLength(2);

    await press('Choose another place');
    expect(screen.getByRole('header', { name: 'Choose a pickup point' })).toBeOnTheScreen();
    await press('Asia Mall, Shopping centre');
    await pressLast('Confirm this pickup');

    expect(screen.queryByRole('header', { name: 'Is this your pickup point?' })).not.toBeOnTheScreen();
    expect(screen.getByText('Near Asia Mall')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Change pickup point' })).toBeOnTheScreen();
    // The chosen place is not presented as the device location.
    expect(screen.getByText('Location is off')).toBeOnTheScreen();
    expectNoDevicePosition();
  });

  it('closes the place list without choosing anything', async () => {
    device({ permission: BLOCKED });
    await openHome();

    await press('Choose pickup area');
    await press('Choose a named place');
    await press('Cancel');
    expect(screen.queryByRole('header', { name: 'Choose a pickup point' })).not.toBeOnTheScreen();
    // Back on the map picker, which the header's back button leaves.
    await press('Stop choosing on the map');

    expect(screen.queryByText('Pickup point')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose pickup area' })).toBeOnTheScreen();
  });
});

describe('place list failures', () => {
  const PLACES: PlaceDto[] = [
    { id: 'place_test_square', label: 'Test Square', detail: 'Synthetic place', coordinates: { latitude: 42.87, longitude: 74.6 } },
  ];

  afterEach(async () => {
    await cleanup();
  });

  function renderSheet(search: jest.Mock) {
    const dataSource = createUnavailableDataSource('Only place search is stubbed.');
    dataSource.places.search = search;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const wrap = (children: ReactNode) => (
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, right: 0, bottom: 34, left: 0 } }}>
        <DataSourceProvider dataSource={dataSource}>
          <QueryClientProvider client={client}>
            <LocationChoicesProvider>{children}</LocationChoicesProvider>
          </QueryClientProvider>
        </DataSourceProvider>
      </SafeAreaProvider>
    );
    return render(wrap(<PickupPlaceSheet open onClose={() => {}} />));
  }

  it('says the places did not load and loads them again on request', async () => {
    const search = jest.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValue(PLACES);
    await renderSheet(search);

    expect(await screen.findByText("Places didn't load. Check the connection and try again.")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Test Square, Synthetic place' })).toBeOnTheScreen();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('says when no place matches', async () => {
    await renderSheet(jest.fn().mockResolvedValue([]));

    expect(await screen.findByText('There are no places to choose in this area.')).toBeOnTheScreen();
  });
});

describe('describeLocationCard', () => {
  const NOW = Date.parse('2026-11-01T09:00:00.000Z');

  function located(fix: Partial<LocationFix>): LocationStatus {
    const full: LocationFix = {
      coordinates: { latitude: 42.87, longitude: 74.6 },
      accuracyMeters: 5,
      capturedAt: NOW,
      approximate: false,
      ...fix,
    };
    return { kind: 'located', fix: full, assessment: assessFix(full, NOW), refreshing: false };
  }

  it.each<[string, LocationStatus, string | null, string | null]>([
    ['while the permission is read', { kind: 'checking' }, null, null],
    ['with a fresh, accurate fix', located({}), null, null],
    ['with a recent fix', located({ capturedAt: NOW - 90_000 }), null, null],
    ['with a stale fix', located({ capturedAt: NOW - 150_000 }), 'Location out of date', 'Refresh location'],
    ['with an inaccurate fix', located({ accuracyMeters: 250 }), 'Location not precise', 'Try again'],
    ['with no fix in time', { kind: 'unavailable', reason: 'no-fix' }, 'No location yet', 'Try again'],
    ['when the permission could not be read', { kind: 'unavailable', reason: 'check-failed' }, 'Location unavailable', null],
    ['while locating', { kind: 'locating' }, 'Finding your location', null],
  ])('%s', (_case, status, badge, action) => {
    const card = describeLocationCard(status, 'ios');
    expect(card?.badge.label ?? null).toBe(badge);
    expect(card?.action?.label ?? null).toBe(action);
  });

  it('opens the services switch itself on Android and names its path on iOS', () => {
    const off: LocationStatus = { kind: 'unavailable', reason: 'services-off' };
    expect(describeLocationCard(off, 'android')?.message).toMatch(/Turn it on in the device settings/);
    expect(describeLocationCard(off, 'ios')?.message).toMatch(/Privacy & Security/);
    expect(describeLocationCard(off, 'android')?.action?.kind).toBe('services-settings');
  });
});

describe('toConfirmedPickup', () => {
  it('turns a place into a frozen manual pickup at the place itself', () => {
    const place: PlaceDto = { id: 'place_test', label: 'Test Square', detail: null, coordinates: { latitude: 42.87, longitude: 74.6 } };
    const pickup = toConfirmedPickup(place);

    expect(pickup).toEqual({
      kind: 'place',
      placeId: 'place_test',
      label: 'Test Square',
      detail: null,
      location: { source: 'manual', coordinates: { latitude: 42.87, longitude: 74.6 } },
    });
    expect(Object.isFrozen(pickup.location.coordinates)).toBe(true);
    expect(pickup.location.coordinates).not.toBe(place.coordinates);
  });
});
