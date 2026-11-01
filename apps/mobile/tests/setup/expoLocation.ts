/*
 * Expo Location has no native module under Jest. Route tests render the real root layout, which
 * starts the app's location controller, so every test gets this stand-in: a device that has
 * already allowed precise location, with location services on and a fresh fix near the demo city.
 * Home then shows no location card. Tests change it with `jest.mocked(Location.…)`; a test file
 * that mocks `expo-location` itself replaces it.
 */
jest.mock('expo-location', () => {
  const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', ios: { accuracy: 'full' } };
  const fix = () => ({
    coords: { latitude: 42.874, longitude: 74.6, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  });
  return {
    Accuracy: { Balanced: 3, High: 4 },
    getForegroundPermissionsAsync: jest.fn(async () => granted),
    requestForegroundPermissionsAsync: jest.fn(async () => granted),
    hasServicesEnabledAsync: jest.fn(async () => true),
    getLastKnownPositionAsync: jest.fn(async () => null),
    getCurrentPositionAsync: jest.fn(async () => fix()),
    watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  };
});
