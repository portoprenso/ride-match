import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';
import type { PlaceDto } from '@ride-match/contracts';

import * as mapProvider from '../src/config/isMapProviderConfigured';
import * as queries from '../src/data/queries';
import { describePickup, toMapPointPickup } from '../src/features/location/LocationChoicesProvider';
import {
  distanceMeters,
  nearestPlace,
  NEAREST_PLACE_MAX_METERS,
  toCoarse,
} from '../src/features/location/nearestPlace';
import { DEMO_CITY_REGION } from '../src/features/map/mapCamera';
import { pinPoint } from '../src/features/map/MapPointPicker';
import { TILE_CONFIRM_TIMEOUT_MS, useMapTileStatus } from '../src/platform/map/useMapTileStatus';
import { BLOCKED, device, openHome, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/** The stand-in map's point reads (`tests/setup/reactNativeMaps.ts`). */
const { coordinateForPoint } = jest.requireMock<{ coordinateForPoint: jest.Mock }>('react-native-maps');

/** Just off Ala-Too Square, so the exact point and the place's own point differ. */
const NEAR_SQUARE = { latitude: 42.8768, longitude: 74.6041 };
/** Inside the demo coverage, more than a kilometre from every curated place. */
const OPEN_FIELD = { latitude: 42.83, longitude: 74.68 };
/** Outside the demo coverage. */
const FAR_AWAY = { latitude: 43.6, longitude: 75.6 };

// Longer than the mock source's largest simulated latency.
const ANSWER_MS = 1000;

/** Opens home with location blocked and switches it to the map picker, laid out as on a phone. */
async function openPicker(point = NEAR_SQUARE) {
  coordinateForPoint.mockResolvedValue(point);
  device({ permission: BLOCKED });
  await openHome();
  await press('Choose pickup area');
  const area = screen.getByTestId('home-map-area');
  await act(async () => {
    fireEvent(area, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } });
  });
  await wait(ANSWER_MS);
}

/** A camera event from the stand-in map, with the point read it starts settled inside `act`. */
async function mapEvent(name: 'regionChange' | 'regionChangeComplete') {
  const map = screen.getByTestId('home-map');
  await act(async () => {
    fireEvent(map, name, DEMO_CITY_REGION);
  });
}

/** The camera comes to rest after the user dragged the map. */
async function settle(point: { latitude: number; longitude: number }) {
  coordinateForPoint.mockResolvedValue(point);
  await mapEvent('regionChange');
  await mapEvent('regionChangeComplete');
  await wait(ANSWER_MS);
}

describe('map picker', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
  });

  it('opens from the location card with a centre pin and names the nearest place', async () => {
    await openPicker();

    expect(screen.getByRole('header', { name: 'Confirm pickup' })).toBeOnTheScreen();
    expect(screen.getByTestId('centre-pin', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Is this your pickup point?' })).toBeOnTheScreen();
    expect(screen.getByText('Near Ala-Too Square (City square)')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Drag the map to choose a point, then confirm. Public discovery will show only an approximate area.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('This point stays fixed after you publish your request.')).toBeOnTheScreen();
    // The point is read at the pin's tip: the centre of the map area, as nothing was laid out over it here.
    expect(coordinateForPoint).toHaveBeenLastCalledWith({ x: 200, y: 400 });
  });

  it('keeps the exact point under the pin as the pickup, named after the nearest place', async () => {
    await openPicker();

    await press('Confirm this pickup');

    expect(screen.queryByTestId('centre-pin', { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(screen.getByText('Near Ala-Too Square')).toBeOnTheScreen();
    expect(screen.getByText('Location is off')).toBeOnTheScreen();
    const pin = screen.getByLabelText('Pickup point: Near Ala-Too Square');
    expect(pin.props.coordinate).toEqual(NEAR_SQUARE);
    expect(screen.queryByLabelText(/Your location/)).not.toBeOnTheScreen();
  });

  it('sends only the rounded point to name it', async () => {
    const search = jest.spyOn(queries, 'placeSearchQuery');
    await openPicker();

    const centres = search.mock.calls.map(([, input]) => input.area.center);
    expect(centres).toContainEqual({ latitude: 42.88, longitude: 74.6 });
    expect(centres).not.toContainEqual(NEAR_SQUARE);
  });

  it('waits while the map moves, then reads the new point', async () => {
    await openPicker();

    await mapEvent('regionChange');
    expect(screen.getByText('Release the map to choose this point.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Confirm this pickup' })).toBeDisabled();

    coordinateForPoint.mockResolvedValue(OPEN_FIELD);
    await mapEvent('regionChangeComplete');
    await wait(ANSWER_MS);

    expect(screen.getByText('No named place nearby. You can still confirm this point.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Confirm this pickup' })).toBeEnabled();
    await press('Confirm this pickup');
    expect(screen.getByText('A point you chose on the map')).toBeOnTheScreen();
  });

  it('still lets a point outside the named area be confirmed', async () => {
    await openPicker();
    await settle(FAR_AWAY);

    expect(
      screen.getByText('The nearest place couldn’t be found. You can still confirm this point.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Confirm this pickup' })).toBeEnabled();
  });

  it('offers the named list, and a place confirmed there closes the picker too', async () => {
    await openPicker();

    await press('Choose a named place');
    expect(screen.getByRole('header', { name: 'Choose a pickup point' })).toBeOnTheScreen();
    await wait(ANSWER_MS);
    await press('Asia Mall, Shopping centre');
    await pressLast('Confirm this pickup');

    expect(screen.queryByTestId('centre-pin', { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(screen.getByText('Near Asia Mall')).toBeOnTheScreen();
  });

  it('leaves the picker from the header without changing the pickup', async () => {
    await openPicker();

    await press('Stop choosing on the map');

    expect(screen.queryByTestId('centre-pin', { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(screen.queryByText('Pickup point')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Choose pickup area' })).toBeOnTheScreen();
  });

  it('changes a confirmed pickup on the map', async () => {
    await openPicker();
    await press('Confirm this pickup');

    await press('Change pickup point');
    await settle(OPEN_FIELD);
    await press('Confirm this pickup');

    expect(screen.getByText('A point you chose on the map')).toBeOnTheScreen();
  });

  it('goes straight to the named list in a build without a map', async () => {
    jest.spyOn(mapProvider, 'isMapProviderConfigured').mockReturnValue(false);
    device({ permission: BLOCKED });
    await openHome();

    await press('Choose pickup area');

    expect(screen.getByRole('header', { name: 'Choose a pickup point' })).toBeOnTheScreen();
    expect(screen.queryByTestId('centre-pin', { includeHiddenElements: true })).not.toBeOnTheScreen();
  });
});

describe('nearest place', () => {
  const place = (id: string, latitude: number, longitude: number): PlaceDto => ({
    id,
    label: id,
    detail: null,
    coordinates: { latitude, longitude },
  });

  it('rounds to the coarse precision', () => {
    expect(toCoarse({ latitude: 42.8768, longitude: 74.6041 })).toEqual({ latitude: 42.88, longitude: 74.6 });
    expect(toCoarse({ latitude: -12.345, longitude: 0.004 })).toEqual({ latitude: -12.34, longitude: 0 });
  });

  it('measures about 111 km per degree of latitude', () => {
    expect(Math.round(distanceMeters({ latitude: 42, longitude: 74 }, { latitude: 43, longitude: 74 }) / 1000)).toBe(
      111,
    );
  });

  it('picks the closest place within the limit, or none', () => {
    const origin = { latitude: 42.87, longitude: 74.6 };
    const close = place('close', 42.871, 74.6);
    const closer = place('closer', 42.8705, 74.6);
    const far = place('far', 42.9, 74.6);

    expect(nearestPlace(origin, [close, closer, far])?.id).toBe('closer');
    expect(nearestPlace(origin, [far])).toBeNull();
    expect(distanceMeters(origin, far.coordinates)).toBeGreaterThan(NEAREST_PLACE_MAX_METERS);
    expect(nearestPlace(origin, [])).toBeNull();
  });

  it('names a map point after its nearest place, or not at all', () => {
    const point = { latitude: 42.8768, longitude: 74.6041 };
    const pickup = toMapPointPickup(point, place('Ala-Too Square', 42.8765, 74.6037));

    expect(pickup).toEqual({
      kind: 'map-point',
      placeId: null,
      label: 'Ala-Too Square',
      detail: null,
      location: { source: 'manual', coordinates: point },
    });
    expect(Object.isFrozen(pickup.location.coordinates)).toBe(true);
    expect(describePickup(pickup)).toBe('Near Ala-Too Square');
    expect(describePickup(toMapPointPickup(point, null))).toBe('A point you chose on the map');
  });

  it('puts the pin at the centre of the uncovered map', () => {
    expect(pinPoint({ width: 400, height: 800 }, { top: 100, right: 0, bottom: 300, left: 0 })).toEqual({
      x: 200,
      y: 300,
    });
  });
});

describe('useMapTileStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits for Google Maps to report its tiles, and calls a long wait slow until it does', async () => {
    const { result } = await renderHook(() => useMapTileStatus({ configured: true, reportsLoading: true }));
    expect(result.current.status).toBe('loading');

    await act(async () => {
      jest.advanceTimersByTime(TILE_CONFIRM_TIMEOUT_MS);
    });
    expect(result.current.status).toBe('slow');

    await act(async () => result.current.onMapLoaded());
    expect(result.current.status).toBe('loaded');
  });

  it('claims nothing where the provider reports nothing, and knows a build without a map', async () => {
    const apple = await renderHook(() => useMapTileStatus({ configured: true, reportsLoading: false }));
    await act(async () => {
      jest.advanceTimersByTime(TILE_CONFIRM_TIMEOUT_MS * 2);
    });
    expect(apple.result.current.status).toBe('unknown');

    const none = await renderHook(() => useMapTileStatus({ configured: false, reportsLoading: true }));
    expect(none.result.current.status).toBe('not-configured');
  });
});
