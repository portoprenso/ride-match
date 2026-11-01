import { act, cleanup, render, renderHook, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import {
  createLocationController,
  describeLocation,
  FIX_TIMEOUT_MS,
  type LocationController,
} from '../src/platform/location/createLocationController';
import { assessFix, type LocationFix } from '../src/platform/location/locationFix';
import {
  expoLocationServices,
  type DevicePosition,
  type LocationPermissionResult,
  type LocationServices,
} from '../src/platform/location/locationServices';
import { LocationProvider, useLocationController, useLocationState } from '../src/platform/location/LocationProvider';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

const START = Date.parse('2026-11-01T09:00:00.000Z');
const SECOND = 1000;

const GRANTED: LocationPermissionResult = { status: 'granted', canAskAgain: true, precise: true };
const UNDETERMINED: LocationPermissionResult = { status: 'undetermined', canAskAgain: true, precise: true };
const BLOCKED: LocationPermissionResult = { status: 'denied', canAskAgain: false, precise: true };

/** A synthetic position near the demo city, `ageMs` old. */
const position = (ageMs: number, accuracyMeters: number | null = 15, latitude = 42.87): DevicePosition => ({
  latitude,
  longitude: 74.59,
  accuracyMeters,
  capturedAt: Date.now() - ageMs,
});

type Deferred<Value> = { promise: Promise<Value>; resolve(value: Value): void; reject(error: unknown): void };
function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** A device whose permission, services, cached position, fresh fixes and watches the test controls. */
function fakeDevice(setup: { permission?: LocationPermissionResult; servicesEnabled?: boolean; lastKnown?: DevicePosition | null } = {}) {
  const device = {
    permission: setup.permission ?? UNDETERMINED,
    /** What the OS prompt answers. */
    answer: GRANTED,
    servicesEnabled: setup.servicesEnabled ?? true,
    lastKnown: setup.lastKnown ?? null,
    fixes: [] as Deferred<DevicePosition>[],
    watches: [] as { onPosition: (position: DevicePosition) => void; removed: boolean }[],
    activeWatches: () => device.watches.filter((watch) => !watch.removed),
  };
  const services: LocationServices = {
    getPermission: jest.fn(async () => device.permission),
    requestPermission: jest.fn(async () => {
      device.permission = device.answer;
      return device.permission;
    }),
    hasServicesEnabled: jest.fn(async () => device.servicesEnabled),
    getLastKnownPosition: jest.fn(async () => device.lastKnown),
    getCurrentPosition: jest.fn(() => {
      const fix = deferred<DevicePosition>();
      device.fixes.push(fix);
      return fix.promise;
    }),
    watchPosition: jest.fn(async (onPosition: (position: DevicePosition) => void) => {
      const watch = { onPosition, removed: false };
      device.watches.push(watch);
      return {
        remove: () => {
          watch.removed = true;
        },
      };
    }),
  };
  return { device, services };
}

function fakeAppState() {
  const listeners = new Set<(state: string) => void>();
  return {
    currentState: 'active',
    addEventListener: (_type: 'change', listener: (state: string) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    change(next: string) {
      this.currentState = next;
      for (const listener of [...listeners]) listener(next);
    },
    listenerCount: () => listeners.size,
  };
}

/** Lets the controller's chains of awaited OS calls settle. */
async function settle() {
  for (let step = 0; step < 20; step += 1) await Promise.resolve();
}

let controllers: LocationController[] = [];
function setup(device: Parameters<typeof fakeDevice>[0] = {}) {
  const fake = fakeDevice(device);
  const appState = fakeAppState();
  const controller = createLocationController({ services: fake.services, appState });
  controllers.push(controller);
  const status = () => describeLocation(controller.getState(), Date.now());
  return { ...fake, appState, controller, status };
}

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  for (const controller of controllers) controller.dispose();
  controllers = [];
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('permission', () => {
  it('reads the permission without prompting, and locates nothing until the user is asked', async () => {
    const { services, device, controller, status } = setup();

    expect(status()).toEqual({ kind: 'checking' });
    controller.start();
    controller.observe();
    await settle();

    expect(status()).toEqual({ kind: 'needs-permission' });
    expect(services.requestPermission).not.toHaveBeenCalled();
    expect(services.getCurrentPosition).not.toHaveBeenCalled();
    expect(device.watches).toEqual([]);
  });

  it('asks when requested, then shows a recent cached fix while a fresh one is taken', async () => {
    const { device, controller, status } = setup({ lastKnown: position(30 * SECOND) });
    controller.start();
    await settle();

    await expect(controller.requestPermission()).resolves.toEqual({ status: 'granted', precise: true });
    await settle();
    expect(status()).toMatchObject({
      kind: 'located',
      refreshing: true,
      assessment: { age: 'fresh', accurate: true, usableForPickup: true },
    });

    const fresh = position(0, 8, 42.871);
    device.fixes[0]?.resolve(fresh);
    await settle();
    expect(status()).toMatchObject({
      kind: 'located',
      refreshing: false,
      fix: { coordinates: { latitude: 42.871, longitude: 74.59 }, accuracyMeters: 8, capturedAt: fresh.capturedAt },
    });
  });

  it('ignores a cached fix older than two minutes', async () => {
    const { controller, status } = setup({ permission: GRANTED, lastKnown: position(3 * 60 * SECOND) });

    controller.start();
    await settle();
    expect(status()).toEqual({ kind: 'locating' });
  });

  it('shows a denied permission and whether the prompt can still appear, and never locates', async () => {
    const { services, device, controller, status } = setup({ permission: BLOCKED });

    controller.start();
    controller.observe();
    await controller.refresh();
    await settle();

    expect(status()).toEqual({ kind: 'denied', canAskAgain: false });
    expect(services.getCurrentPosition).not.toHaveBeenCalled();
    expect(device.watches).toEqual([]);
  });

  it('reports a permission it could not read, and tries again on return to the foreground', async () => {
    const { services, appState, device, controller, status } = setup({ permission: GRANTED });
    jest.mocked(services.getPermission).mockRejectedValueOnce(new Error('unavailable'));

    controller.start();
    await settle();
    expect(status()).toEqual({ kind: 'unavailable', reason: 'check-failed' });

    appState.change('background');
    appState.change('active');
    await settle();
    expect(status()).toEqual({ kind: 'locating' });
    expect(device.fixes).toHaveLength(1);
  });

  it('follows permission changes made in the settings while in the background', async () => {
    const { device, appState, controller, status } = setup({ permission: BLOCKED });
    controller.start();
    controller.observe();
    await settle();

    appState.change('background');
    device.permission = GRANTED;
    appState.change('active');
    await settle();
    device.fixes[0]?.resolve(position(0));
    await settle();
    expect(status()).toMatchObject({ kind: 'located' });
    expect(device.activeWatches()).toHaveLength(1);

    // Revoked later: the position is cleared, not kept, and observation stops.
    appState.change('background');
    device.permission = BLOCKED;
    appState.change('active');
    await settle();
    expect(status()).toEqual({ kind: 'denied', canAskAgain: false });
    expect(controller.getState().fix).toBeNull();
    expect(device.activeWatches()).toEqual([]);
  });
});

describe('fixes', () => {
  it('reports location services that are off, and locates once they are back on', async () => {
    const { services, device, controller, status } = setup({ permission: GRANTED, servicesEnabled: false });
    controller.start();
    await settle();

    expect(status()).toEqual({ kind: 'unavailable', reason: 'services-off' });
    expect(services.getCurrentPosition).not.toHaveBeenCalled();

    device.servicesEnabled = true;
    const refreshed = controller.refresh();
    await settle();
    device.fixes[0]?.resolve(position(0));
    await refreshed;
    expect(status()).toMatchObject({ kind: 'located' });
  });

  it('reports services that are off rather than a denial, since iOS denies every app while they are off', async () => {
    const { device, appState, controller, status } = setup({ permission: BLOCKED, servicesEnabled: false });
    controller.start();
    await settle();
    expect(status()).toEqual({ kind: 'unavailable', reason: 'services-off' });

    // Services back on while the app setting allowed it all along: located, not denied.
    appState.change('background');
    device.servicesEnabled = true;
    device.permission = GRANTED;
    appState.change('active');
    await settle();
    expect(status()).toEqual({ kind: 'locating' });

    // A real denial with services on stays a denial.
    appState.change('background');
    device.permission = BLOCKED;
    appState.change('active');
    await settle();
    expect(status()).toEqual({ kind: 'denied', canAskAgain: false });
  });

  it('reports a fix that does not come in time, and still accepts it when it arrives late', async () => {
    const { device, controller, status } = setup({ permission: GRANTED });
    controller.start();
    await settle();
    expect(status()).toEqual({ kind: 'locating' });

    await jest.advanceTimersByTimeAsync(FIX_TIMEOUT_MS);
    expect(status()).toEqual({ kind: 'unavailable', reason: 'no-fix' });

    device.fixes[0]?.resolve(position(0));
    await settle();
    expect(status()).toMatchObject({ kind: 'located', refreshing: false });
  });

  it('reports a failed fix and rechecks location services', async () => {
    const { device, controller, status } = setup({ permission: GRANTED });
    controller.start();
    await settle();

    device.servicesEnabled = false;
    device.fixes[0]?.reject(new Error('Location services are disabled'));
    await settle();
    expect(status()).toEqual({ kind: 'unavailable', reason: 'services-off' });
  });

  it('runs one fresh-fix attempt at a time', async () => {
    const { services, controller } = setup({ permission: GRANTED });
    controller.start();
    await settle();

    void controller.refresh();
    void controller.refresh();
    expect(services.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('labels fixes that are stale, inaccurate or approximate', () => {
    const fix = (ageMs: number, accuracyMeters: number | null, approximate = false): LocationFix => ({
      coordinates: { latitude: 42.87, longitude: 74.59 },
      accuracyMeters,
      capturedAt: START - ageMs,
      approximate,
    });

    expect(assessFix(fix(60 * SECOND, 100), START)).toEqual({ age: 'fresh', accurate: true, usableForPickup: true });
    expect(assessFix(fix(61 * SECOND, 10), START)).toEqual({ age: 'recent', accurate: true, usableForPickup: false });
    expect(assessFix(fix(121 * SECOND, 10), START)).toEqual({ age: 'stale', accurate: true, usableForPickup: false });
    expect(assessFix(fix(0, 101), START)).toMatchObject({ accurate: false, usableForPickup: false });
    expect(assessFix(fix(0, null), START)).toMatchObject({ accurate: false, usableForPickup: false });
    expect(assessFix(fix(0, 10, true), START)).toMatchObject({ accurate: false, usableForPickup: false });
  });

  it('marks fixes taken under approximate permission, and ages a fix as time passes', async () => {
    const { device, controller, status } = setup({ permission: { ...GRANTED, precise: false } });
    controller.start();
    await settle();
    device.fixes[0]?.resolve(position(0, 10));
    await settle();

    expect(status()).toMatchObject({ kind: 'located', fix: { approximate: true }, assessment: { accurate: false } });
    jest.setSystemTime(START + 3 * 60 * SECOND);
    expect(status()).toMatchObject({ kind: 'located', assessment: { age: 'stale' } });
  });

  it('keeps the newest position when an older one arrives later', async () => {
    const { device, controller } = setup({ permission: GRANTED });
    controller.start();
    controller.observe();
    await settle();

    const newer = position(0, 10, 42.872);
    device.activeWatches()[0]?.onPosition(newer);
    device.fixes[0]?.resolve(position(5 * SECOND, 10, 42.86));
    await settle();
    expect(controller.getState().fix?.coordinates.latitude).toBe(42.872);
  });

  it('never changes a fix after handing it out, so a captured pickup cannot move with the device', async () => {
    const { device, controller } = setup({ permission: GRANTED });
    controller.start();
    controller.observe();
    await settle();
    device.fixes[0]?.resolve(position(0, 10, 42.87));
    await settle();

    const captured = controller.getState().fix;
    device.activeWatches()[0]?.onPosition({ ...position(0, 10, 42.9), capturedAt: Date.now() + 1 });
    await settle();

    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured?.coordinates)).toBe(true);
    expect(captured?.coordinates.latitude).toBe(42.87);
    expect(controller.getState().fix?.coordinates.latitude).toBe(42.9);
  });
});

describe('observation', () => {
  it('runs only while someone needs it, and stops in the background', async () => {
    const { services, device, appState, controller } = setup({ permission: GRANTED });
    controller.start();
    await settle();
    device.fixes[0]?.resolve(position(0));
    await settle();
    expect(device.watches).toEqual([]);

    const releaseMap = controller.observe();
    const releaseOther = controller.observe();
    await settle();
    expect(device.activeWatches()).toHaveLength(1);
    expect(controller.getState().observing).toBe(true);

    // An OS dialog or the app switcher keeps the app in the foreground.
    appState.change('inactive');
    expect(device.activeWatches()).toHaveLength(1);

    appState.change('background');
    expect(device.activeWatches()).toEqual([]);
    expect(controller.getState()).toMatchObject({ observing: false, foreground: false });

    jest.mocked(services.getCurrentPosition).mockClear();
    appState.change('active');
    await settle();
    expect(device.activeWatches()).toHaveLength(1);
    // Returning to the foreground also requests a fresh fix.
    expect(services.getCurrentPosition).toHaveBeenCalledTimes(1);

    releaseMap();
    releaseMap();
    expect(device.activeWatches()).toHaveLength(1);
    releaseOther();
    expect(device.activeWatches()).toEqual([]);
  });

  it('removes a watch that finishes starting after observation was released', async () => {
    const { services, controller } = setup({ permission: GRANTED });
    const pending = deferred<{ remove(): void }>();
    const remove = jest.fn();
    jest.mocked(services.watchPosition).mockReturnValueOnce(pending.promise);
    controller.start();
    await settle();

    controller.observe()();
    pending.resolve({ remove });
    await settle();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(controller.getState().observing).toBe(false);
  });
});

describe('disposal', () => {
  it('stops observation, timers and listeners, and ignores later results', async () => {
    const { device, appState, controller } = setup({ permission: GRANTED });
    const listener = jest.fn();
    controller.start();
    controller.observe();
    await settle();
    controller.subscribe(listener);

    controller.dispose();
    controller.dispose();
    listener.mockClear();
    device.fixes[0]?.resolve(position(0));
    appState.change('background');
    await settle();

    expect(device.activeWatches()).toEqual([]);
    expect(appState.listenerCount()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getState().fix).toBeNull();
  });
});

describe('React binding', () => {
  // Unmount first, then run the timers React's scheduler left, as the route tests do.
  afterEach(async () => {
    await cleanup();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.runAllTicks();
  });

  function LocationLabel() {
    const state = useLocationState();
    return <Text>{describeLocation(state, Date.now()).kind}</Text>;
  }

  it('re-renders on every change', async () => {
    const { device, controller } = setup({ permission: GRANTED });
    await render(
      <LocationProvider controller={controller}>
        <LocationLabel />
      </LocationProvider>,
    );
    expect(screen.getByText('checking')).toBeOnTheScreen();

    await act(async () => {
      controller.start();
      await settle();
    });
    expect(screen.getByText('locating')).toBeOnTheScreen();

    await act(async () => {
      device.fixes[0]?.resolve(position(0));
      await settle();
    });
    expect(screen.getByText('located')).toBeOnTheScreen();
  });

  it('fails outside a provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useLocationController())).rejects.toThrow(
      'useLocationController() must be called inside a LocationProvider.',
    );
    jest.restoreAllMocks();
  });

  it('returns the provided controller', async () => {
    const { controller } = setup();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LocationProvider controller={controller}>{children}</LocationProvider>
    );

    const { result } = await renderHook(() => useLocationController(), { wrapper });
    expect(result.current).toBe(controller);
  });
});

describe('expoLocationServices', () => {
  const response = (extra: object) => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never', ...extra });

  it.each([
    ['iOS full accuracy', true, { ios: { scope: 'whenInUse', accuracy: 'full' } }],
    ['iOS reduced accuracy', false, { ios: { scope: 'whenInUse', accuracy: 'reduced' } }],
    ['Android fine location', true, { android: { accuracy: 'fine' } }],
    ['Android approximate location', false, { android: { accuracy: 'coarse' } }],
  ])('reads %s as precise: %s', async (_case, precise, details) => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValueOnce(response(details) as never);

    await expect(expoLocationServices.getPermission()).resolves.toEqual({ status: 'granted', canAskAgain: true, precise });
  });

  it('keeps only the position, accuracy and time of a location, never altitude, speed or heading', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
      coords: { latitude: 42.87, longitude: 74.59, accuracy: 12, altitude: 800, altitudeAccuracy: 3, heading: 90, speed: 1 },
      timestamp: START,
    });

    await expect(expoLocationServices.getCurrentPosition()).resolves.toEqual({
      latitude: 42.87,
      longitude: 74.59,
      accuracyMeters: 12,
      capturedAt: START,
    });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 4, mayShowUserSettingsDialog: false });
  });
});
