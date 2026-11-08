import type { AppStateSource } from '../appState';
import type { LocalNotifications, NotificationPermissionState } from './localNotifications';

/** The notification permission as the app knows it: `unknown` until the first read answers. */
export type NotificationPermissionStatus = { status: 'unknown' } | ({ status: 'known' } & NotificationPermissionState);

export type NotificationPermissionController = {
  getState(): NotificationPermissionStatus;
  subscribe(listener: () => void): () => void;
  /** Reads the permission without asking, and again whenever the app returns to the foreground. */
  start(): void;
  /**
   * Shows the OS prompt, or answers at once when the OS no longer asks, and returns the new
   * state. Only the explanation sheet (design 39) calls it, after the rider chose to.
   */
  request(): Promise<NotificationPermissionState>;
  /** Reads the permission again, as after the rider returns from the system settings. */
  refresh(): Promise<void>;
  dispose(): void;
};

/**
 * Follows the device's notification permission (NOTIFICATION-001-B). It never prompts on its own,
 * so the app asks for nothing at startup. A read the OS refuses leaves the last known state, and
 * the next foreground reads again.
 */
export function createNotificationPermissionController(
  notifications: Pick<LocalNotifications, 'getPermission' | 'requestPermission'>,
  appState: AppStateSource,
): NotificationPermissionController {
  let state: NotificationPermissionStatus = { status: 'unknown' };
  let disposed = false;
  let stopForeground: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const set = (next: NotificationPermissionState) => {
    if (disposed) return;
    if (state.status === 'known' && state.permission === next.permission && state.canAskAgain === next.canAskAgain) {
      return;
    }
    state = { status: 'known', ...next };
    listeners.forEach((listener) => listener());
  };
  const refresh = async () => {
    try {
      set(await notifications.getPermission());
    } catch {
      // Unreadable now: keep what is known; the next foreground reads again.
    }
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (stopForeground !== null || disposed) return;
      void refresh();
      const subscription = appState.addEventListener('change', (next) => {
        if (next === 'active') void refresh();
      });
      stopForeground = () => subscription.remove();
    },
    async request() {
      const next = await notifications.requestPermission();
      set(next);
      return next;
    },
    refresh,
    dispose() {
      disposed = true;
      stopForeground?.();
      stopForeground = null;
      listeners.clear();
    },
  };
}
