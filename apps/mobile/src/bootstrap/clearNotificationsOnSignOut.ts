import type { SessionController } from '../features/auth/createSessionController';
import type { LocalNotifications } from '../platform/notifications/localNotifications';

/**
 * Clears local notifications whenever the signed-in rider stops being signed in: a sign-out, an
 * ended session, a scenario reset, or another rider signing in. Notifications are only ever for
 * the rider who was signed in when they were made, so none may show or be opened after them.
 *
 * Restoring at launch is not a sign-out, so nothing is cleared until a rider was signed in. A
 * clear the OS refuses is not retried; the tap handling (NOTIFICATION-001-C) still rereads the
 * resource with the current session before showing anything. Returns the unsubscribe.
 */
export function clearNotificationsOnSignOut(session: SessionController, notifications: LocalNotifications): () => void {
  let signedInUserId: string | null = null;
  const check = () => {
    const state = session.getState();
    const current = state.status === 'signed-in' ? state.user.id : null;
    if (signedInUserId !== null && current !== signedInUserId) void notifications.clearAll();
    signedInUserId = current;
  };
  check();
  return session.subscribe(check);
}
