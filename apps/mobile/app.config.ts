import type { ExpoConfig } from 'expo/config';

// Provisional local development identity. These are not registered release identifiers.
const config: ExpoConfig = {
  name: 'Ride Match',
  slug: 'ride-match',
  scheme: 'ride-match',
  ios: {
    bundleIdentifier: 'com.ridematch.dev',
  },
  android: {
    package: 'com.ridematch.dev',
  },
};

export default config;
