import { act, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { ANSWER_MS, captureSimulator, signInWithDemoCode } from './helpers/groupFlow';
import { BLOCKED, device, openHome, press, wait } from './helpers/locationDevice';
import { flushTimersAndRestore } from './helpers/renderApp';

/*
 * Notification taps in the real app (NOTIFICATION-001-C): warm taps through the listener, the
 * launch tap, deduplication, and the unavailable screen (46). Scenario J's rider is a member of
 * one group. Payloads are synthetic: IDs and times only.
 */

const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';
const UNKNOWN_GROUP = 'grp_00000000-0000-4000-8000-000000000046';

let tapListener: ((response: Notifications.NotificationResponse) => void) | null = null;

const response = (data: unknown, identifier: string) =>
  ({
    actionIdentifier: DEFAULT_ACTION,
    notification: { request: { identifier, content: { data } } },
  }) as unknown as Notifications.NotificationResponse;

function payload(id: string, fields: Record<string, unknown>) {
  const now = Date.now();
  return {
    id,
    schemaVersion: 1,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
    ...fields,
  };
}

async function tap(data: unknown, identifier: string) {
  await act(async () => {
    tapListener?.(response(data, identifier));
  });
  await wait(ANSWER_MS);
}

/** Scenario J, signed in on home; returns the app and the rider's group. */
async function signedInMember() {
  const captured = captureSimulator();
  process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'safety';
  device({ permission: BLOCKED });
  const app = await openHome();
  await press('Sign in');
  await signInWithDemoCode();
  await wait(ANSWER_MS);
  const group = [...captured.simulator!.state.groups.values()][0]!;
  return { app, groupId: group.id };
}

describe('notification entry', () => {
  beforeEach(() => {
    tapListener = null;
    jest.mocked(Notifications.addNotificationResponseReceivedListener).mockImplementation((listener) => {
      tapListener = listener;
      return { remove: jest.fn(() => (tapListener = null)) } as unknown as Notifications.EventSubscription;
    });
  });
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'active-neighborhood';
  });

  it('opens the chat above its group once read, and never stacks a duplicate tap', async () => {
    const { app, groupId } = await signedInMember();
    const chat = payload('ntf_chat_1', { kind: 'chat.message_created', groupId, messageId: 'msg_1' });

    await tap(chat, 'ntf_chat_1');
    expect(app.getRootStack()).toEqual(['index', 'groups/[groupId]/index', 'groups/[groupId]/chat']);

    await tap(chat, 'ntf_chat_1');
    expect(app.getRootStack()).toEqual(['index', 'groups/[groupId]/index', 'groups/[groupId]/chat']);

    // Another notification opens over the map, not over the chat.
    await tap(payload('ntf_ready_1', { kind: 'group.ready', groupId }), 'ntf_ready_1');
    expect(app.getRootStack()).toEqual(['index', 'groups/[groupId]/index']);
  });

  it('shows the unavailable screen (46) for a group the rider cannot read, naming nothing', async () => {
    const { app } = await signedInMember();
    await tap(payload('ntf_joined_1', { kind: 'group.member_joined', groupId: UNKNOWN_GROUP }), 'ntf_joined_1');

    expect(app.getRootStack()).toEqual(['index', 'notification-unavailable']);
    expect(screen.getByText('Plans have changed.')).toBeOnTheScreen();
    expect(screen.getByText('That match or group is no longer available.')).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(UNKNOWN_GROUP))).not.toBeOnTheScreen();

    await press('See current nearby plans');
    expect(app.getRootStack()).toEqual(['index']);
  });

  it('shows the unavailable screen for an invalid payload and for a rider who is not signed in', async () => {
    captureSimulator();
    device({ permission: BLOCKED });
    const app = await openHome();

    await tap(
      { ...payload('ntf_bad_1', { kind: 'group.ready', groupId: UNKNOWN_GROUP }), schemaVersion: 2 },
      'ntf_bad_1',
    );
    expect(app.getRootStack()).toEqual(['index', 'notification-unavailable']);

    await press('Back to map');
    await tap(payload('ntf_ready_2', { kind: 'group.ready', groupId: UNKNOWN_GROUP }), 'ntf_ready_2');
    expect(app.getRootStack()).toEqual(['index', 'notification-unavailable']);
  });

  it('handles the tap that launched the app once, after the session is restored', async () => {
    const launch = response(
      payload('ntf_launch_1', { kind: 'chat.message_created', groupId: UNKNOWN_GROUP, messageId: 'msg_1' }),
      'ntf_launch_1',
    );
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValueOnce(launch);
    captureSimulator();
    device({ permission: BLOCKED });
    const app = await openHome();
    await wait(ANSWER_MS);
    // A cold start of the mock build begins without a session, so the old notification shows 46.
    expect(app.getRootStack()).toEqual(['index', 'notification-unavailable']);
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();

    // The OS reports the same launch tap to the listener too: nothing more opens.
    await act(async () => {
      tapListener?.(launch);
    });
    await wait(ANSWER_MS);
    expect(app.getRootStack()).toEqual(['index', 'notification-unavailable']);
  });
});
