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
  plugins: [
    // Screens have light backgrounds, so the status bar needs dark icons. Without a style,
    // Android's edge-to-edge status bar keeps white icons and they disappear.
    ['expo-status-bar', { style: 'dark' }],
  ],
};

export default config;
