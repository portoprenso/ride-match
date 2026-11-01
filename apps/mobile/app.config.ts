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
    // Foreground location only (docs/PRODUCT.md): the iOS "always" and motion descriptions are
    // removed, and Android gets no background-location or foreground-service permission.
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Ride Match uses your location while you use the app to show rides near you and suggest a pickup point. You can pick a point on the map instead.',
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    // Manrope is embedded in the native builds, so text never starts in a fallback font. Each
    // file is named after its PostScript name, which iOS matches; Android uses the file name.
    // `MANROPE` in src/ui/tokens.ts uses the same names.
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/Manrope-Regular.ttf',
          './assets/fonts/Manrope-Medium.ttf',
          './assets/fonts/Manrope-SemiBold.ttf',
          './assets/fonts/Manrope-Bold.ttf',
          './assets/fonts/Manrope-ExtraBold.ttf',
        ],
      },
    ],
  ],
};

export default config;
