import { screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

import { sendChatMessage } from '../src/data/mock/chat';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { actAs, ANSWER_MS, captureSimulator, signInWithDemoCode } from './helpers/groupFlow';
import { BLOCKED, device, openHome, press, pressLast, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

type OsPermission = { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean };

/** The device's notification permission in these tests, and what its prompt answers. */
let os: OsPermission;
let promptAnswer: OsPermission;

function permissionResponse(value: OsPermission) {
  return {
    ...value,
    granted: value.status === 'granted',
    expires: 'never',
  } as unknown as Notifications.NotificationPermissionsStatus;
}

/** Scenario J signed in, on settings. */
async function signedInSettings() {
  const captured = captureSimulator();
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'safety';
  device({ permission: BLOCKED });
  await openHome();
  await press('Sign in');
  await signInWithDemoCode();
  await wait(ANSWER_MS);
  await press('Settings');
  await wait(ANSWER_MS);
  const simulator: Simulator<MockWorld> = captured.simulator!;
  return simulator;
}

describe('notification settings and delivery', () => {
  beforeEach(() => {
    os = { status: 'undetermined', canAskAgain: true };
    promptAnswer = { status: 'granted', canAskAgain: true };
    jest.mocked(Notifications.getPermissionsAsync).mockImplementation(async () => permissionResponse(os));
    jest.mocked(Notifications.requestPermissionsAsync).mockImplementation(async () => {
      os = promptAnswer;
      return permissionResponse(os);
    });
  });
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('never asks at startup, and offers nothing to anonymous browsing', async () => {
    captureSimulator();
    device({ permission: BLOCKED });
    await openHome();
    await press('Settings');
    expect(screen.queryByRole('button', { name: /^Notifications/ })).not.toBeOnTheScreen();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('explains first (39), asks only when chosen, then registers and delivers generic notifications', async () => {
    const simulator = await signedInSettings();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();

    await press('Notifications: Off · Tap to enable');
    expect(screen.getByRole('header', { name: 'Know when plans change.' })).toBeOnTheScreen();
    expect(screen.getByText(/^Demo notifications are local to this device\./)).toBeOnTheScreen();
    await press('Not now');
    expect(screen.queryByRole('header', { name: 'Know when plans change.' })).not.toBeOnTheScreen();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();

    await press('Notifications: Off · Tap to enable');
    await press('Enable notifications');
    await wait(ANSWER_MS);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Notifications are on.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Notifications: On' })).toBeOnTheScreen();
    const [registration] = [...simulator.state.pushDevices.values()];
    expect(registration).toMatchObject({
      permission: 'granted',
      pushToken: expect.stringMatching(/^ExponentPushToken\[demo-/),
    });

    // Aida writes in the group chat: this installation gets a local notification with generic words.
    const group = [...simulator.state.groups.values()][0]!;
    const aida = await actAs(simulator, group.coordinatorId, '+447700900601');
    aida.act((context, token) =>
      sendChatMessage(context, token, group.id, {
        clientMessageId: '22222222-2222-4222-8222-000000000001',
        text: 'Meet by the fountain',
      }),
    );
    await wait(ANSWER_MS);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const [[request]] = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls;
    expect(request.content).toMatchObject({
      title: 'Ride Match',
      body: 'New message in your group chat.',
      data: { kind: 'chat.message_created', groupId: group.id },
    });
    expect(JSON.stringify(request)).not.toContain('fountain');
  });

  it('says notifications are off after a denial and offers the system settings', async () => {
    promptAnswer = { status: 'denied', canAskAgain: false };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const simulator = await signedInSettings();

    await press('Notifications: Off · Tap to enable');
    await press('Enable notifications');
    await wait();
    expect(screen.getByRole('header', { name: 'Notifications are off.' })).toBeOnTheScreen();
    await press('Open settings');
    expect(openSettings).toHaveBeenCalledTimes(1);
    await press('Not now');
    expect(screen.getByRole('button', { name: 'Notifications: Off · Turn on in system settings' })).toBeOnTheScreen();
    expect(simulator.state.pushDevices.size).toBe(0);

    // From now on the row goes straight to the way back.
    await press('Notifications: Off · Turn on in system settings');
    expect(screen.getByRole('header', { name: 'Notifications are off.' })).toBeOnTheScreen();
  });

  it('removes the registration when the rider signs out', async () => {
    os = { status: 'granted', canAskAgain: true };
    const simulator = await signedInSettings();
    expect(screen.getByRole('button', { name: 'Notifications: On' })).toBeOnTheScreen();
    expect(simulator.state.pushDevices.size).toBe(1);

    await press('Sign out');
    // The sheet's confirmation, rendered after the screen's own "Sign out".
    await pressLast('Sign out');
    await wait(2 * ANSWER_MS);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    expect(simulator.state.pushDevices.size).toBe(0);
  });
});
