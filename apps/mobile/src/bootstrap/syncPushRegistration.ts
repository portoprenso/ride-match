import type { ExpoPushToken, InstallationId, PushPlatform } from '@ride-match/contracts';

import type { DeviceOperations } from '../data/AppDataSource';
import type { SessionController } from '../features/auth/createSessionController';
import type { NotificationPermissionController } from '../platform/notifications/createNotificationPermissionController';

type PushRegistrationOptions = {
  session: SessionController;
  permission: NotificationPermissionController;
  devices: DeviceOperations;
  installationId: () => Promise<InstallationId>;
  /** The installation's push token. The mock build passes a synthetic one; no real token is requested. */
  pushToken: (installationId: InstallationId) => ExpoPushToken;
  platform: PushPlatform;
};

export type PushRegistration = {
  /**
   * Removes this installation's registration while the session still works, so nothing reaches
   * it after the rider signs out. A failure doesn't stop the sign-out: the source also drops the
   * registration when the session that made it ends.
   */
  removeBeforeSignOut(): Promise<void>;
  dispose(): void;
};

/**
 * Keeps this installation's push-device registration in line with the session and the
 * notification permission (NOTIFICATION-001-B): it registers when a rider is signed in with
 * notifications allowed, and again when the permission changes after that, so a rider who turns
 * notifications off in the system settings stops getting them. Anonymous browsing, and a rider
 * who never allowed notifications, register nothing.
 *
 * Registrations run one at a time, the newest state winning. A failed registration is tried
 * again at the next change of session or permission (including a foreground read that finds a
 * change); nothing is logged, since the request holds the push token.
 */
export function syncPushRegistration({
  session,
  permission,
  devices,
  installationId,
  pushToken,
  platform,
}: PushRegistrationOptions): PushRegistration {
  let disposed = false;
  // What the source has: `${userId}:${permission}` of the last successful registration.
  let registered: { userId: string; key: string } | null = null;
  let running: Promise<void> = Promise.resolve();

  const desired = () => {
    const state = session.getState();
    const allowed = permission.getState();
    if (state.status !== 'signed-in' || allowed.status !== 'known') return null;
    return { userId: state.user.id, permission: allowed.permission, key: `${state.user.id}:${allowed.permission}` };
  };

  const sync = () => {
    running = running.then(async () => {
      const target = desired();
      if (disposed || target === null || registered?.key === target.key) return;
      // Nothing to tell the source until notifications are allowed; once registered, any change
      // is sent, so turning them off stops deliveries.
      if (target.permission !== 'granted' && registered?.userId !== target.userId) return;
      try {
        const id = await installationId();
        await devices.register(id, { pushToken: pushToken(id), platform, permission: target.permission });
        registered = { userId: target.userId, key: target.key };
      } catch {
        // Not registered; the next change tries again (see above).
        registered = null;
      }
    });
  };

  const stopSession = session.subscribe(() => {
    if (session.getState().status !== 'signed-in') registered = null;
    sync();
  });
  const stopPermission = permission.subscribe(sync);
  sync();

  return {
    async removeBeforeSignOut() {
      await running;
      if (registered === null) return;
      registered = null;
      try {
        await devices.remove(await installationId());
      } catch {
        // See removeBeforeSignOut's note: the source drops it with the session.
      }
    },
    dispose() {
      disposed = true;
      stopSession();
      stopPermission();
    },
  };
}
