import type { NotificationPayloadDto } from '@ride-match/contracts';
import type { NotificationPermissionsStatus, NotificationResponse } from 'expo-notifications';

import { clearNotificationsOnSignOut } from '../src/bootstrap/clearNotificationsOnSignOut';
import type { SessionController, SessionState } from '../src/features/auth/createSessionController';
import {
  createLocalNotifications,
  NOTIFICATION_COPY,
  readNotificationPayload,
  toNotificationPermission,
  type LocalNotifications,
  type NotificationsModule,
} from '../src/platform/notifications/localNotifications';

const NOW = Date.parse('2026-11-08T09:00:00.000Z');
const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

/** A synthetic chat notification: IDs and times only. */
const payload = (overrides: Partial<NotificationPayloadDto> = {}) =>
  ({
    id: 'ntf_1',
    schemaVersion: 1,
    kind: 'chat.message_created',
    groupId: 'grp_1',
    messageId: 'msg_1',
    issuedAt: '2026-11-08T08:59:00.000Z',
    expiresAt: '2026-11-08T09:30:00.000Z',
    ...overrides,
  }) as NotificationPayloadDto;

const permission = (status: 'granted' | 'denied' | 'undetermined', ios?: number) =>
  ({
    status,
    granted: status === 'granted',
    canAskAgain: true,
    expires: 'never',
    ...(ios === undefined ? {} : { ios: { status: ios } }),
  }) as unknown as NotificationPermissionsStatus;

const response = (data: unknown, actionIdentifier = DEFAULT_ACTION) =>
  ({ actionIdentifier, notification: { request: { content: { data } } } }) as unknown as NotificationResponse;

function fakeModule(allowed: NotificationPermissionsStatus = permission('granted')) {
  let tapListener: ((value: NotificationResponse) => void) | null = null;
  let last: NotificationResponse | null = null;
  const module = {
    getPermissionsAsync: jest.fn(async () => allowed),
    requestPermissionsAsync: jest.fn(async () => allowed),
    scheduleNotificationAsync: jest.fn(async (request: { identifier?: string }) => request.identifier ?? 'scheduled'),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
    dismissAllNotificationsAsync: jest.fn(async () => undefined),
    addNotificationResponseReceivedListener: jest.fn((listener: (value: NotificationResponse) => void) => {
      tapListener = listener;
      return { remove: jest.fn(() => (tapListener = null)) };
    }),
    getLastNotificationResponseAsync: jest.fn(async () => last),
    clearLastNotificationResponseAsync: jest.fn(async () => {
      last = null;
    }),
  };
  return {
    module: module as unknown as NotificationsModule & typeof module,
    tap: (value: NotificationResponse) => tapListener?.(value),
    listening: () => tapListener !== null,
    openedWith: (value: NotificationResponse) => {
      last = value;
    },
  };
}

describe('local notifications', () => {
  it('schedules a valid payload with generic copy, under its own ID', async () => {
    const { module } = fakeModule();
    const notifications = createLocalNotifications(module, () => NOW);

    await expect(notifications.present(payload())).resolves.toEqual({ kind: 'scheduled', id: 'ntf_1' });
    const { messageId: _unused, ...ready } = payload({ kind: 'group.ready', id: 'ntf_2' } as never) as {
      messageId: string;
    };
    await expect(notifications.present(ready, { delaySeconds: 5 })).resolves.toEqual({
      kind: 'scheduled',
      id: 'ntf_2',
    });

    const [now, later] = module.scheduleNotificationAsync.mock.calls.map(([request]) => request);
    expect(now).toEqual({
      identifier: 'ntf_1',
      content: { title: 'Ride Match', body: 'New message in your group chat.', data: payload() },
      trigger: null,
    });
    expect(later).toMatchObject({
      content: { body: NOTIFICATION_COPY['group.ready'].body },
      trigger: { type: 'timeInterval', seconds: 5 },
    });
  });

  it('schedules nothing invalid, expired, unpermitted, or carrying private fields', async () => {
    const { module } = fakeModule();
    const notifications = createLocalNotifications(module, () => NOW);

    await expect(notifications.present({ ...payload(), text: 'Meet me at my flat' })).resolves.toEqual({
      kind: 'invalid',
    });
    await expect(notifications.present({ ...payload(), schemaVersion: 2 })).resolves.toEqual({ kind: 'invalid' });
    await expect(notifications.present(payload({ expiresAt: '2026-11-08T09:00:00.000Z' }))).resolves.toEqual({
      kind: 'expired',
    });
    // It would expire before it shows.
    await expect(
      notifications.present(payload({ expiresAt: '2026-11-08T09:00:30.000Z' }), { delaySeconds: 60 }),
    ).resolves.toEqual({ kind: 'expired' });
    expect(module.scheduleNotificationAsync).not.toHaveBeenCalled();

    const denied = fakeModule(permission('denied'));
    await expect(createLocalNotifications(denied.module, () => NOW).present(payload())).resolves.toEqual({
      kind: 'not-permitted',
    });
    expect(denied.module.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(denied.module.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reports an OS refusal as failed', async () => {
    const { module } = fakeModule();
    module.scheduleNotificationAsync.mockRejectedValueOnce(new Error('Refused ntf_1'));
    await expect(createLocalNotifications(module, () => NOW).present(payload())).resolves.toEqual({ kind: 'failed' });
  });

  it('reads taps on the body only, validated, and the opening tap once', async () => {
    const fake = fakeModule();
    const notifications = createLocalNotifications(fake.module, () => NOW);
    const taps: unknown[] = [];
    const stop = notifications.onTap((tap) => taps.push(tap));

    fake.tap(response(payload()));
    fake.tap(response(payload(), 'reply'));
    fake.tap(response({ kind: 'chat.message_created', text: 'hi' }));
    fake.tap(response(payload({ expiresAt: '2026-11-08T08:59:30.000Z' })));
    expect(taps).toEqual([
      { kind: 'valid', payload: payload() },
      { kind: 'invalid' },
      { kind: 'expired', id: 'ntf_1' },
    ]);
    stop();
    expect(fake.listening()).toBe(false);

    fake.openedWith(response(payload()));
    await expect(notifications.takeInitialTap()).resolves.toEqual({ kind: 'valid', payload: payload() });
    await expect(notifications.takeInitialTap()).resolves.toBeNull();
  });

  it('clears scheduled and shown notifications and the last tap, and says when the OS refused', async () => {
    const { module } = fakeModule();
    const notifications = createLocalNotifications(module, () => NOW);
    await expect(notifications.clearAll()).resolves.toBe(true);
    expect(module.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(module.dismissAllNotificationsAsync).toHaveBeenCalled();
    expect(module.clearLastNotificationResponseAsync).toHaveBeenCalled();

    module.dismissAllNotificationsAsync.mockRejectedValueOnce(new Error('No'));
    await expect(notifications.clearAll()).resolves.toBe(false);
  });

  it('maps the OS permission to the contract’s words', () => {
    expect(toNotificationPermission(permission('granted'))).toBe('granted');
    expect(toNotificationPermission(permission('undetermined', 3))).toBe('granted');
    expect(toNotificationPermission(permission('denied'))).toBe('denied');
    expect(toNotificationPermission(permission('undetermined', 0))).toBe('undetermined');
  });

  it('reads payloads against the contract and the clock', () => {
    expect(readNotificationPayload(payload(), NOW)).toEqual({ kind: 'valid', payload: payload() });
    expect(readNotificationPayload(null, NOW)).toEqual({ kind: 'invalid' });
    expect(readNotificationPayload(payload(), Date.parse('2026-11-08T09:30:00.000Z'))).toEqual({
      kind: 'expired',
      id: 'ntf_1',
    });
  });
});

describe('clearing notifications on sign-out', () => {
  function fakeSession(initial: SessionState) {
    let state = initial;
    const listeners = new Set<() => void>();
    const session = {
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as SessionController;
    return {
      session,
      set: (next: SessionState) => {
        state = next;
        listeners.forEach((listener) => listener());
      },
      listeners,
    };
  }
  const signedIn = (id: string): SessionState => ({
    status: 'signed-in',
    user: { id, displayName: 'Demo rider 123', avatarUrl: null },
    persisted: true,
  });

  it('clears when the signed-in rider signs out or another signs in, never at launch', () => {
    const clearAll = jest.fn(async () => true);
    const notifications = { clearAll } as unknown as LocalNotifications;
    const fake = fakeSession({ status: 'restoring' });
    const stop = clearNotificationsOnSignOut(fake.session, notifications);

    fake.set({ status: 'signed-out', reason: 'restore-failed' } as unknown as SessionState);
    fake.set(signedIn('usr_1'));
    expect(clearAll).not.toHaveBeenCalled();

    fake.set(signedIn('usr_1'));
    expect(clearAll).not.toHaveBeenCalled();
    fake.set(signedIn('usr_2'));
    expect(clearAll).toHaveBeenCalledTimes(1);
    fake.set({ status: 'signed-out', reason: 'signed-out' } as SessionState);
    expect(clearAll).toHaveBeenCalledTimes(2);

    stop();
    expect(fake.listeners.size).toBe(0);
  });
});
