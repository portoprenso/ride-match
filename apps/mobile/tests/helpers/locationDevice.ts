import { act, screen, userEvent } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { renderApp } from './renderApp';

/*
 * Shared steps for route tests that drive the stand-in location device
 * (`tests/setup/expoLocation.ts`) and the home screen.
 */

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export function permission(status: PermissionStatus, canAskAgain: boolean, accuracy: 'full' | 'reduced' = 'full') {
  return {
    status,
    granted: status === 'granted',
    canAskAgain,
    expires: 'never',
    ios: { accuracy },
  } as unknown as Location.LocationPermissionResponse;
}

export const GRANTED = permission('granted', true);
export const UNDETERMINED = permission('undetermined', true);
export const DENIED_CAN_ASK = permission('denied', true);
export const BLOCKED = permission('denied', false);

/** What the device answers when the app reads or requests the permission. */
export function device(setup: {
  permission: Location.LocationPermissionResponse;
  answer?: Location.LocationPermissionResponse;
  servicesEnabled?: boolean;
}) {
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(setup.permission);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(setup.answer ?? setup.permission);
  jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(setup.servicesEnabled ?? true);
}

/** Runs timers and the promises they release, such as the mock source's latency. */
export async function wait(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

export async function press(name: string | RegExp) {
  await userEvent.press(screen.getByRole('button', { name }));
  await wait();
}

/** Opens home and lets the location controller read the permission. */
export async function openHome() {
  const app = await renderApp('/');
  await wait();
  return app;
}
