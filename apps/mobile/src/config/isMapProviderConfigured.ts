import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Reports whether this build can draw the native map.
 *
 * iOS uses Apple Maps, which needs no key. Android uses Google Maps, which stops the app when a
 * map appears without a key, so `app.config.ts` records only whether `GOOGLE_MAPS_ANDROID_API_KEY`
 * was set (`extra.googleMapsAndroidConfigured`); the key itself never reaches JavaScript. The flag
 * comes from the configuration Metro serves, so after setting a key, rebuild the Android app as
 * well as restarting Metro (docs/DEVELOPMENT.md).
 *
 * Read it only through this function, at render time, so tests can override it.
 */
export function isMapProviderConfigured(): boolean {
  if (Platform.OS !== 'android') return true;
  return Constants.expoConfig?.extra?.googleMapsAndroidConfigured === true;
}
