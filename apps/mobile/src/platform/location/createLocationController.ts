import { AppState } from 'react-native';

import { assessFix, BROWSING_FIX_MAX_AGE_MS, type FixAssessment, type LocationFix } from './locationFix';
import {
  expoLocationServices,
  type DevicePosition,
  type LocationPermissionResult,
  type LocationServices,
} from './locationServices';

/** How long a fresh fix may take before the attempt counts as failed; a fix that arrives later still applies. */
export const FIX_TIMEOUT_MS = 15_000;

/** The foreground permission: `unknown` until the first check. */
export type LocationPermission =
  | { status: 'unknown' }
  | { status: 'undetermined'; canAskAgain: boolean }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'granted'; precise: boolean };

/** Everything the controller knows, replaced as a whole on every change. */
export type LocationState = Readonly<{
  permission: LocationPermission;
  /** The device's location services: `null` until checked with permission, or when the check failed. */
  servicesEnabled: boolean | null;
  /** The latest position, cached or fresh. `null` until the device reports one, and cleared when permission ends. */
  fix: LocationFix | null;
  /** A fresh fix is being requested. */
  locating: boolean;
  /** The last fresh-fix attempt failed or timed out; the next fix clears it. */
  fixFailed: boolean;
  /** Reading the permission failed; the next foreground return tries again. */
  checkFailed: boolean;
  /** Foreground observation is running. */
  observing: boolean;
  /** The app is in the foreground. Observation runs only then. */
  foreground: boolean;
}>;

/**
 * What the app can honestly show about location, from {@link describeLocation}:
 *
 * - `checking`: the permission has not been read yet.
 * - `needs-permission`: never asked. Explain why location helps, then call `requestPermission`.
 * - `denied`: browse manually. When `canAskAgain` is false only the system settings can change it.
 * - `unavailable`: location services are off, no fix could be taken, or the permission could not be read.
 * - `locating`: permitted, with no position yet.
 * - `located`: the latest position with its assessment, while `refreshing` may bring a newer one.
 *
 * No state invents a position: without a fix there is no user dot.
 */
export type LocationStatus =
  | { kind: 'checking' }
  | { kind: 'needs-permission' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'unavailable'; reason: 'services-off' | 'no-fix' | 'check-failed' }
  | { kind: 'locating' }
  | { kind: 'located'; fix: LocationFix; assessment: FixAssessment; refreshing: boolean };

/** @param now Device time in milliseconds, which decides whether the fix is fresh, recent or stale. */
export function describeLocation(state: LocationState, now: number): LocationStatus {
  const { permission } = state;
  switch (permission.status) {
    case 'unknown':
      return state.checkFailed ? { kind: 'unavailable', reason: 'check-failed' } : { kind: 'checking' };
    case 'undetermined':
      return { kind: 'needs-permission' };
    case 'denied':
      return { kind: 'denied', canAskAgain: permission.canAskAgain };
    case 'granted':
      break;
  }
  if (state.servicesEnabled === false) return { kind: 'unavailable', reason: 'services-off' };
  if (state.fix !== null) {
    return { kind: 'located', fix: state.fix, assessment: assessFix(state.fix, now), refreshing: state.locating };
  }
  return state.fixFailed ? { kind: 'unavailable', reason: 'no-fix' } : { kind: 'locating' };
}

/** The part of React Native's `AppState` the controller uses, so tests can supply their own. */
export type AppStateSource = {
  currentState: string;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
};

export type LocationControllerOptions = {
  services?: LocationServices;
  appState?: AppStateSource;
  /** Device time in milliseconds; `Date.now` unless a test passes its own. */
  now?: () => number;
  fixTimeoutMs?: number;
};

/**
 * The foreground location lifecycle: permission, the device's cached and fresh fixes, and
 * throttled observation. It is a platform boundary: it never reads or changes app data, so a
 * new fix can never move a published request's origin.
 */
export type LocationController = {
  getState(): LocationState;
  /** Calls `listener` after every change, until the returned function is called. */
  subscribe(listener: () => void): () => void;
  /**
   * Reads the permission without prompting and starts following foreground and background.
   * With permission it shows a cached fix up to two minutes old, then requests a fresh one.
   * Calling it again does nothing.
   */
  start(): void;
  /**
   * Shows the OS permission prompt. Call it only after the app explained why location helps
   * (LOCATION-001-B). Resolves with the resulting permission once services are checked, without
   * waiting for a fix; rejects if the OS call fails, leaving the state unchanged.
   */
  requestPermission(): Promise<LocationPermission>;
  /**
   * Requests a fresh fix now, for example to recenter or before confirming a pickup point, and
   * rechecks location services first if they were off. Resolves when the attempt ends, whether
   * or not it produced a fix; does nothing without permission. One attempt runs at a time.
   */
  refresh(): Promise<void>;
  /**
   * Keeps throttled observation running for as long as anyone needs it, such as the visible map,
   * until the returned function is called. Observation also needs permission, location services
   * and the foreground: it stops in the background and resumes on return.
   */
  observe(): () => void;
  /** Stops observation, timers and listeners. Later results are ignored. */
  dispose(): void;
};

function toPermission(result: LocationPermissionResult): LocationPermission {
  switch (result.status) {
    case 'granted':
      return { status: 'granted', precise: result.precise };
    case 'denied':
      return { status: 'denied', canAskAgain: result.canAskAgain };
    case 'undetermined':
      return { status: 'undetermined', canAskAgain: result.canAskAgain };
  }
}

export function createLocationController(options: LocationControllerOptions = {}): LocationController {
  const services = options.services ?? expoLocationServices;
  const appState = options.appState ?? AppState;
  const now = options.now ?? Date.now;
  const fixTimeoutMs = options.fixTimeoutMs ?? FIX_TIMEOUT_MS;

  let state: LocationState = Object.freeze<LocationState>({
    permission: { status: 'unknown' },
    servicesEnabled: null,
    fix: null,
    locating: false,
    fixFailed: false,
    checkFailed: false,
    observing: false,
    foreground: appState.currentState !== 'background',
  });
  const listeners = new Set<() => void>();
  let appStateSubscription: { remove(): void } | null = null;
  let disposed = false;
  let observers = 0;
  // Each counter invalidates late results of an older attempt: a permission read, a watch that
  // was still starting, or fixes from before permission ended.
  let permissionRead = 0;
  let watchAttempt = 0;
  let fixGeneration = 0;
  let watch: { remove(): void } | null = null;
  let watchStarting = false;
  let pendingFix: { promise: Promise<void>; cancel(): void } | null = null;

  function update(patch: Partial<LocationState>) {
    if (disposed) return;
    const changed = (Object.keys(patch) as (keyof LocationState)[]).some((key) => patch[key] !== state[key]);
    if (!changed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of [...listeners]) listener();
  }

  const isGranted = () => state.permission.status === 'granted';

  function applyPosition(position: DevicePosition, generation: number) {
    if (disposed || generation !== fixGeneration || state.permission.status !== 'granted') return;
    // Positions can arrive out of order (a slow fresh request after a watch update); keep the newest.
    if (state.fix !== null && position.capturedAt < state.fix.capturedAt) return;
    const fix: LocationFix = Object.freeze({
      coordinates: Object.freeze({ latitude: position.latitude, longitude: position.longitude }),
      accuracyMeters: position.accuracyMeters,
      capturedAt: position.capturedAt,
      approximate: !state.permission.precise,
    });
    update({ fix, fixFailed: false });
  }

  const shouldWatch = () =>
    !disposed && observers > 0 && state.foreground && isGranted() && state.servicesEnabled !== false;

  function stopWatch() {
    watchAttempt += 1;
    watchStarting = false;
    watch?.remove();
    watch = null;
    update({ observing: false });
  }

  async function startWatch() {
    const attempt = ++watchAttempt;
    const generation = fixGeneration;
    watchStarting = true;
    try {
      const subscription = await services.watchPosition(
        (position) => applyPosition(position, generation),
        () => update({ fixFailed: true }),
      );
      if (attempt !== watchAttempt || !shouldWatch()) {
        subscription.remove();
        return;
      }
      watch = subscription;
      update({ observing: true });
    } catch {
      // The OS refused to observe, for example because services went off; say so.
      if (attempt === watchAttempt) update({ fixFailed: true });
    } finally {
      if (attempt === watchAttempt) watchStarting = false;
    }
  }

  function syncWatch() {
    if (!shouldWatch()) stopWatch();
    else if (watch === null && !watchStarting) void startWatch();
  }

  function requestFix(): Promise<void> {
    if (pendingFix !== null) return pendingFix.promise;
    const generation = fixGeneration;
    update({ locating: true });

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resolveAttempt = () => {};
    const promise = new Promise<void>((resolve) => {
      resolveAttempt = resolve;
    });
    const finish = (succeeded: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      pendingFix = null;
      update({ locating: false, ...(succeeded ? {} : { fixFailed: true }) });
      // A failed attempt may mean location services went off.
      if (!succeeded && !disposed && generation === fixGeneration) void recheckServices();
      resolveAttempt();
    };
    pendingFix = { promise, cancel: () => finish(true) };
    timer = setTimeout(() => finish(false), fixTimeoutMs);
    services.getCurrentPosition().then(
      (position) => {
        // Applied even after a timeout: a late fix is still the device's real position.
        applyPosition(position, generation);
        finish(true);
      },
      () => finish(false),
    );
    return promise;
  }

  /** The services state, or `null` when the OS call fails: then a fix attempt tells whether one is possible. */
  const readServices = () => services.hasServicesEnabled().catch(() => null);

  async function recheckServices() {
    const generation = fixGeneration;
    const enabled = await readServices();
    if (disposed || generation !== fixGeneration || !isGranted()) return;
    update({ servicesEnabled: enabled });
    syncWatch();
  }

  /** Shows a cached fix if one is recent enough, then requests a fresh one. */
  async function locate() {
    const generation = fixGeneration;
    try {
      const cached = await services.getLastKnownPosition(BROWSING_FIX_MAX_AGE_MS);
      if (cached !== null && now() - cached.capturedAt <= BROWSING_FIX_MAX_AGE_MS) applyPosition(cached, generation);
    } catch {
      // No cached position is fine: the fresh request below reports its own failure.
    }
    if (!disposed && generation === fixGeneration) await requestFix();
  }

  /** Applies a permission result: losing permission clears the fix and stops everything; having it checks services and locates. */
  async function applyPermission(permission: LocationPermission, read: number) {
    if (permission.status !== 'granted') {
      fixGeneration += 1;
      pendingFix?.cancel();
      update({ permission, servicesEnabled: null, fix: null, locating: false, fixFailed: false, checkFailed: false });
      syncWatch();
      return;
    }
    const enabled = await readServices();
    if (disposed || read !== permissionRead) return;
    // Precision may have changed in the settings; the current fix keeps the label it was taken with.
    update({ permission, servicesEnabled: enabled, checkFailed: false });
    syncWatch();
    // Not awaited: the permission result should not wait for a fix.
    if (enabled !== false) void locate();
  }

  async function checkPermission() {
    const read = ++permissionRead;
    let result: LocationPermissionResult;
    try {
      result = await services.getPermission();
    } catch {
      if (!disposed && read === permissionRead) update({ checkFailed: true });
      return;
    }
    if (disposed || read !== permissionRead) return;
    await applyPermission(toPermission(result), read);
  }

  function onAppStateChange(next: string) {
    // `inactive` (an OS dialog or the app switcher on iOS) keeps the app in the foreground.
    if (next === 'background') {
      update({ foreground: false });
      syncWatch();
    } else if (next === 'active' && !state.foreground) {
      update({ foreground: true });
      // The user may have changed the permission or services in the settings meanwhile.
      void checkPermission();
    }
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start() {
      if (disposed || appStateSubscription !== null) return;
      appStateSubscription = appState.addEventListener('change', onAppStateChange);
      void checkPermission();
    },

    async requestPermission() {
      const read = ++permissionRead;
      const permission = toPermission(await services.requestPermission());
      if (!disposed && read === permissionRead) await applyPermission(permission, read);
      return permission;
    },

    async refresh() {
      if (disposed || !isGranted()) return;
      if (state.servicesEnabled === false) {
        await recheckServices();
        if (state.servicesEnabled === false) return;
      }
      await requestFix();
    },

    observe() {
      observers += 1;
      syncWatch();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        observers -= 1;
        syncWatch();
      };
    },

    dispose() {
      if (disposed) return;
      pendingFix?.cancel();
      stopWatch();
      appStateSubscription?.remove();
      appStateSubscription = null;
      disposed = true;
      listeners.clear();
    },
  };
}
