import type { DeviceOperations } from '../src/data/AppDataSource';
import { syncPushRegistration } from '../src/bootstrap/syncPushRegistration';
import type { SessionController, SessionState } from '../src/features/auth/createSessionController';
import {
  createNotificationPermissionController,
  type NotificationPermissionController,
} from '../src/platform/notifications/createNotificationPermissionController';
import type { NotificationPermissionState } from '../src/platform/notifications/localNotifications';

const INSTALLATION = 'c1b2c3d4-0000-4000-8000-000000000001';

function fakeSession(initial: SessionState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    session: {
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as SessionController,
    set(next: SessionState) {
      state = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function fakeAppState() {
  let listener: ((state: string) => void) | null = null;
  return {
    source: {
      currentState: 'active',
      addEventListener: (_type: 'change', next: (state: string) => void) => {
        listener = next;
        return { remove: () => (listener = null) };
      },
    },
    foreground: () => listener?.('active'),
  };
}

const signedIn = (id: string): SessionState => ({
  status: 'signed-in',
  user: { id, displayName: 'Demo rider 123', avatarUrl: null },
  persisted: true,
});
const allowed = (permission: NotificationPermissionState['permission'], canAskAgain = true) => ({
  permission,
  canAskAgain,
});
const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

function setup(initialPermission: NotificationPermissionState) {
  let permission = initialPermission;
  const notifications = {
    getPermission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => (permission = allowed('granted'))),
  };
  const appState = fakeAppState();
  const controller: NotificationPermissionController = createNotificationPermissionController(
    notifications,
    appState.source,
  );
  const fake = fakeSession({ status: 'restoring' });
  const devices = {
    register: jest.fn(async (installationId: string) => ({ installationId, registeredAt: '2026-11-08T09:00:00.000Z' })),
    remove: jest.fn(async () => undefined),
  };
  const registration = syncPushRegistration({
    session: fake.session,
    permission: controller,
    devices: devices as unknown as DeviceOperations,
    installationId: async () => INSTALLATION,
    pushToken: (id) => `ExponentPushToken[demo-${id}]`,
    platform: 'ios',
  });
  controller.start();
  return {
    controller,
    fake,
    devices,
    registration,
    notifications,
    setPermission: (next: NotificationPermissionState) => (permission = next),
    foreground: appState.foreground,
  };
}

describe('push-device registration', () => {
  it('registers nothing for anonymous browsing or before notifications are allowed', async () => {
    const { fake, devices, controller } = setup(allowed('undetermined'));
    await flush();
    fake.set(signedIn('usr_1'));
    await flush();
    expect(devices.register).not.toHaveBeenCalled();
    // The controller never prompts on its own.
    expect(controller.getState()).toEqual({ status: 'known', permission: 'undetermined', canAskAgain: true });
  });

  it('registers once allowed, again when turned off in the system settings, and removes before sign-out', async () => {
    const { fake, devices, controller, registration, setPermission, foreground } = setup(allowed('undetermined'));
    fake.set(signedIn('usr_1'));
    await controller.request();
    await flush();
    expect(devices.register).toHaveBeenCalledTimes(1);
    expect(devices.register).toHaveBeenLastCalledWith(INSTALLATION, {
      pushToken: `ExponentPushToken[demo-${INSTALLATION}]`,
      platform: 'ios',
      permission: 'granted',
    });

    // Turned off outside the app: the foreground read finds it, and the source is told.
    setPermission(allowed('denied', false));
    foreground();
    await flush();
    expect(devices.register).toHaveBeenCalledTimes(2);
    expect(devices.register).toHaveBeenLastCalledWith(INSTALLATION, expect.objectContaining({ permission: 'denied' }));

    await registration.removeBeforeSignOut();
    expect(devices.remove).toHaveBeenCalledWith(INSTALLATION);
    fake.set({ status: 'signed-out', reason: 'signed-out' } as SessionState);
    await flush();
    expect(devices.register).toHaveBeenCalledTimes(2);
  });

  it('registers again for the next rider, and retries after a failure at the next change', async () => {
    const { fake, devices, registration } = setup(allowed('granted'));
    await flush();
    devices.register.mockRejectedValueOnce(new Error('No answer'));
    fake.set(signedIn('usr_1'));
    await flush();
    expect(devices.register).toHaveBeenCalledTimes(1);

    // Nothing was registered, so signing out removes nothing; the next rider registers.
    await registration.removeBeforeSignOut();
    expect(devices.remove).not.toHaveBeenCalled();
    fake.set({ status: 'signed-out', reason: 'signed-out' } as SessionState);
    fake.set(signedIn('usr_2'));
    await flush();
    expect(devices.register).toHaveBeenCalledTimes(2);
  });

  it('stops following the session and permission when disposed', async () => {
    const { fake, devices, registration, controller } = setup(allowed('granted'));
    registration.dispose();
    controller.dispose();
    fake.set(signedIn('usr_1'));
    await flush();
    expect(devices.register).not.toHaveBeenCalled();
  });
});
