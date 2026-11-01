import { Linking, Platform } from 'react-native';

/**
 * Which settings page helps: the app's own page, where its location permission and precise
 * location are, or the device-wide location switch.
 */
export type LocationSettingsTarget = 'app' | 'services';

/**
 * Opens the system settings where the user can turn location back on.
 *
 * Android opens the device-wide switch directly for `services`. iOS has no public link to it,
 * so both targets open the app's own page there, and the explanation names the path to the
 * switch. Nothing changes until the user returns; the location controller rechecks then.
 *
 * @throws When the OS refuses to open the page; the caller says so and keeps manual choices open.
 */
export async function openLocationSettings(target: LocationSettingsTarget): Promise<void> {
  if (target === 'services' && Platform.OS === 'android') {
    await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
    return;
  }
  await Linking.openSettings();
}
