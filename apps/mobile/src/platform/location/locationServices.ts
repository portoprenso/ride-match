import * as Location from 'expo-location';

/** The foreground location permission as the OS reports it. */
export type LocationPermissionResult = {
  status: 'granted' | 'denied' | 'undetermined';
  /** Whether asking again can show the OS prompt; otherwise only the system settings can change it. */
  canAskAgain: boolean;
  /** Precise location granted: not iOS "reduced accuracy" or Android "approximate" (coarse). */
  precise: boolean;
};

/** One position reported by the device. Exact and private: never logged or sent anywhere but the user's own request. */
export type DevicePosition = {
  latitude: number;
  longitude: number;
  /** Accuracy radius in meters, or `null` when the OS gives none. */
  accuracyMeters: number | null;
  /** When the OS took it, in device milliseconds since the epoch. */
  capturedAt: number;
};

/**
 * The native location calls the controller needs, so tests can supply their own. Only
 * foreground permission exists here: the app never asks for or uses background location.
 */
export type LocationServices = {
  /** Reads the permission without prompting. */
  getPermission(): Promise<LocationPermissionResult>;
  /** Shows the OS prompt when it still can; otherwise resolves with the current permission. */
  requestPermission(): Promise<LocationPermissionResult>;
  /** Whether the device's location services are on. */
  hasServicesEnabled(): Promise<boolean>;
  /** The OS's cached position, or `null` when it has none newer than `maxAgeMs`. */
  getLastKnownPosition(maxAgeMs: number): Promise<DevicePosition | null>;
  /** A new accurate position. Rejects when none can be taken, such as with location services off. */
  getCurrentPosition(): Promise<DevicePosition>;
  /** Reports positions as the device moves, throttled, until the subscription is removed. */
  watchPosition(
    onPosition: (position: DevicePosition) => void,
    onError: (reason: string) => void,
  ): Promise<{ remove(): void }>;
};

/** Throttled observation for the user's dot: a new position after about 20 m, at most every 5 s on Android. */
const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  distanceInterval: 20,
  timeInterval: 5_000,
  mayShowUserSettingsDialog: false,
};

/** A fix good enough to become a pickup point (100 m or better), without prompting for device settings. */
const CURRENT_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  mayShowUserSettingsDialog: false,
};

function toPermission(response: Location.LocationPermissionResponse): LocationPermissionResult {
  const precise = response.android
    ? response.android.accuracy === 'fine'
    : response.ios
      ? response.ios.accuracy !== 'reduced'
      : true;
  return { status: response.status, canAskAgain: response.canAskAgain, precise };
}

function toPosition(location: Location.LocationObject): DevicePosition {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyMeters: location.coords.accuracy,
    capturedAt: location.timestamp,
  };
}

/** {@link LocationServices} on Expo Location (foreground permission only). */
export const expoLocationServices: LocationServices = {
  getPermission: async () => toPermission(await Location.getForegroundPermissionsAsync()),
  requestPermission: async () => toPermission(await Location.requestForegroundPermissionsAsync()),
  hasServicesEnabled: () => Location.hasServicesEnabledAsync(),
  async getLastKnownPosition(maxAgeMs) {
    const location = await Location.getLastKnownPositionAsync({ maxAge: maxAgeMs });
    return location === null ? null : toPosition(location);
  },
  getCurrentPosition: async () => toPosition(await Location.getCurrentPositionAsync(CURRENT_OPTIONS)),
  watchPosition: (onPosition, onError) =>
    Location.watchPositionAsync(WATCH_OPTIONS, (location) => onPosition(toPosition(location)), onError),
};
