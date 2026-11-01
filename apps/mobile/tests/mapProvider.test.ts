import { Platform } from 'react-native';

import { isMapProviderConfigured } from '../src/config/isMapProviderConfigured';

// `Constants.expoConfig` cannot be replaced in place, so this file serves its own configuration.
// The mock is created before this variable is set, so it reads the variable when asked.
const mockExpoConfig = { extra: { googleMapsAndroidConfigured: false } };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));

afterEach(() => jest.restoreAllMocks());

describe('isMapProviderConfigured', () => {
  it('draws Apple Maps on iOS without a key', () => {
    expect(isMapProviderConfigured()).toBe(true);
  });

  it('draws Google Maps on Android only when the build recorded a key', () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    mockExpoConfig.extra.googleMapsAndroidConfigured = false;
    expect(isMapProviderConfigured()).toBe(false);

    mockExpoConfig.extra.googleMapsAndroidConfigured = true;
    expect(isMapProviderConfigured()).toBe(true);
  });
});
