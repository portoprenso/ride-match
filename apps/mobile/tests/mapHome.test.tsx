import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import * as Location from 'expo-location';

import * as mapProvider from '../src/config/isMapProviderConfigured';
import { DEMO_CITY_REGION, streetRegion } from '../src/features/map/mapCamera';
import { BLOCKED, GRANTED, device, openHome, permission, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** The stand-in map's camera commands (`tests/setup/reactNativeMaps.ts`). */
const { animateToRegion } = jest.requireMock<{ animateToRegion: jest.Mock }>('react-native-maps');

/** Where the stand-in device is unless a test moves it (`tests/setup/expoLocation.ts`). */
const DEVICE = { latitude: 42.874, longitude: 74.6 };

function position(coordinates: { latitude: number; longitude: number }, accuracy = 5): Location.LocationObject {
  return {
    coords: { ...coordinates, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  };
}

/** Lets a test deliver observed positions, as the device does while the map is on screen. */
function observePositions() {
  const watch = { emit: (_position: Location.LocationObject) => {}, remove: jest.fn() };
  jest.mocked(Location.watchPositionAsync).mockImplementationOnce(async (_options, callback) => {
    watch.emit = callback;
    return { remove: watch.remove };
  });
  return watch;
}

function map() {
  return screen.getByTestId('home-map');
}

describe('home map', () => {
  beforeEach(() => device({ permission: GRANTED }));

  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
  });

  it('opens on the demo city after a denial and stays usable, with no position on it', async () => {
    device({ permission: BLOCKED });
    await openHome();

    expect(map().props.initialRegion).toEqual(DEMO_CITY_REGION);
    expect(screen.getByRole('header', { name: 'along' })).toBeOnTheScreen();
    expect(screen.getByText('Demo')).toBeOnTheScreen();
    expect(screen.getByText('Location is off')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Your location/)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('map-circle')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Show my location' })).not.toBeOnTheScreen();
    expect(animateToRegion).not.toHaveBeenCalled();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('keeps the map flat, north-up and free of the provider’s own location button', async () => {
    await openHome();

    expect(map().props).toMatchObject({
      pitchEnabled: false,
      rotateEnabled: false,
      toolbarEnabled: false,
      showsUserLocation: false,
      showsMyLocationButton: false,
      userInterfaceStyle: 'light',
    });
  });

  it('shows the device position and moves to the first one once', async () => {
    await openHome();

    const dot = screen.getByLabelText('Your location');
    expect(dot.props.coordinate).toEqual(DEVICE);
    expect(screen.getByTestId('map-circle').props.radius).toBe(5);
    expect(animateToRegion).toHaveBeenCalledTimes(1);
    expect(animateToRegion).toHaveBeenLastCalledWith(streetRegion(DEVICE), expect.any(Number));
    // No location card with a usable position; the sheet starts with nearby activity, still loading.
    expect(screen.getByRole('header', { name: 'Finding nearby plans…' })).toBeOnTheScreen();
  });

  it('leaves the camera alone once the user moves the map, even when the first position arrives later', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(position(DEVICE)), 3_000)),
    );
    await openHome();
    expect(screen.queryByLabelText('Your location')).not.toBeOnTheScreen();

    await fireEvent(map(), 'touchStart');
    await wait(3_000);

    expect(screen.getByLabelText('Your location')).toBeOnTheScreen();
    expect(animateToRegion).not.toHaveBeenCalled();
  });

  it('moves the dot, not the camera, as the device moves', async () => {
    const watch = observePositions();
    await openHome();
    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
    animateToRegion.mockClear();

    const moved = { latitude: 42.879, longitude: 74.61 };
    await act(async () => watch.emit(position(moved)));

    expect(screen.getByLabelText('Your location').props.coordinate).toEqual(moved);
    expect(animateToRegion).not.toHaveBeenCalled();
  });

  it('recenters on request and follows the fresh fix that recentering asks for', async () => {
    await openHome();
    await fireEvent(map(), 'touchStart');
    animateToRegion.mockClear();
    const fresh = { latitude: 42.877, longitude: 74.605 };
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce(position(fresh));

    await press('Show my location');

    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
    expect(animateToRegion.mock.calls.map(([region]) => region)).toEqual([streetRegion(DEVICE), streetRegion(fresh)]);
  });

  it('greys the position once it is out of date', async () => {
    // No discovery markers, so every redraw counted here is the device position's.
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'empty-neighborhood';
    await openHome();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
    expect(screen.getByLabelText('Your location')).toBeOnTheScreen();
    const { redrawMarker } = jest.requireMock<{ redrawMarker: jest.Mock }>('react-native-maps');
    redrawMarker.mockClear();

    await wait(2 * 60 * 1000 + 15_000);

    expect(screen.getByLabelText('Your location, out of date')).toBeOnTheScreen();
    expect(screen.getByText('Location out of date')).toBeOnTheScreen();
    // Android keeps the old image of a custom marker unless it is asked to redraw, a frame later.
    await wait(50);
    expect(redrawMarker).toHaveBeenCalledTimes(1);
  });

  it('draws only the accuracy area for an approximate position', async () => {
    device({ permission: permission('granted', true, 'reduced') });
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce(position(DEVICE, 2_000));
    await openHome();

    expect(screen.queryByLabelText(/Your location/)).not.toBeOnTheScreen();
    expect(screen.getByTestId('map-circle').props.radius).toBe(2_000);
    expect(screen.getByText('Approximate location')).toBeOnTheScreen();
  });

  it('observes the device only while home is on screen', async () => {
    const watch = observePositions();
    await openHome();
    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);

    await press('Sign in');
    expect(watch.remove).toHaveBeenCalledTimes(1);

    await press('Close and keep browsing');
    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(2);
  });

  it('shows a confirmed pickup point on the map and moves there', async () => {
    device({ permission: BLOCKED });
    await openHome();

    await press('Choose pickup area');
    await press('Choose a named place');
    await wait(1_000);
    await userEvent.type(screen.getByLabelText('Search places'), 'asia');
    await wait(1_500);
    await press('Asia Mall, Shopping centre');
    await pressLast('Confirm this pickup');

    const pin = screen.getByLabelText('Pickup point: Near Asia Mall');
    expect(pin.props.title).toBe('Pickup point');
    expect(animateToRegion).toHaveBeenCalledTimes(1);
    expect(animateToRegion).toHaveBeenLastCalledWith(streetRegion(pin.props.coordinate), expect.any(Number));
    // A chosen place is never drawn as the device position.
    expect(screen.queryByLabelText(/Your location/)).not.toBeOnTheScreen();
  });

  it('explains a build without a map and keeps the pickup choice', async () => {
    jest.spyOn(mapProvider, 'isMapProviderConfigured').mockReturnValue(false);
    device({ permission: BLOCKED });
    await openHome();

    expect(screen.queryByTestId('home-map')).not.toBeOnTheScreen();
    expect(screen.getByText("The map can't be shown in this build. You can still choose a pickup point by name.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose pickup area' })).toBeOnTheScreen();
  });
});
