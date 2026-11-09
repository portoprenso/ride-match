import type { NotificationPayloadDto } from '@ride-match/contracts';

import type { SignedInViewer } from '../../data/queryKeys';
import type { LocalNotifications, NotificationTap } from '../../platform/notifications/localNotifications';
import type { SessionController, SessionState } from '../auth/createSessionController';
import { UNAVAILABLE, type NotificationDestination } from './notificationEntry';

/** How many handled taps are remembered for deduplication; older ones can't come back by then. */
const REMEMBERED_TAPS = 50;

type NotificationTapCoordinatorOptions = {
  notifications: Pick<LocalNotifications, 'onTap' | 'takeInitialTap'>;
  session: SessionController;
  /** Reads the current state for a valid payload (`resolveNotification`). */
  resolve: (payload: NotificationPayloadDto, viewer: SignedInViewer) => Promise<NotificationDestination>;
  /** Navigates; called at most once per tap, and only for the latest one. */
  open: (destination: NotificationDestination) => void;
  now?: () => number;
};

export type NotificationTapCoordinator = {
  /** Listens for taps and handles the one that launched the app, if any. Call once navigation is ready. */
  start(): void;
  /** Stops listening; a tap still being resolved opens nothing. */
  dispose(): void;
};

/**
 * Turns notification taps into navigation (NOTIFICATION-001-C), in the order the contract asks
 * (docs/api/realtime.md, "Notification payloads"): validate, deduplicate, resolve the session,
 * read the current resource, then navigate.
 *
 * - **Validation:** an invalid or expired payload opens the unavailable screen (46) without any
 *   read. A payload that expires while the session is restored is treated the same.
 * - **Deduplication:** each OS notification is handled once, whether the listener, the launch
 *   tap, or both report it, so a duplicate callback never stacks screens.
 * - **Session:** a tap waits until the stored session is restored (a cold start). Without a
 *   signed-in rider, or when the rider changed while it was read, it is unavailable: a
 *   notification belongs to the rider it was made for.
 * - **Latest wins:** a newer tap supersedes one still being read, which then opens nothing.
 * - Nothing is logged; the payload's IDs stay out of logs.
 */
export function createNotificationTapCoordinator({
  notifications,
  session,
  resolve,
  open,
  now = Date.now,
}: NotificationTapCoordinatorOptions): NotificationTapCoordinator {
  const handled: string[] = [];
  let latest = 0;
  let disposed = false;
  let stopListening: (() => void) | null = null;

  const settled = () =>
    new Promise<SessionState>((resolveState) => {
      if (session.getState().status !== 'restoring') {
        resolveState(session.getState());
        return;
      }
      const stop = session.subscribe(() => {
        if (session.getState().status === 'restoring') return;
        stop();
        resolveState(session.getState());
      });
    });

  const handle = async (tap: NotificationTap) => {
    if (disposed || handled.includes(tap.requestId)) return;
    handled.push(tap.requestId);
    if (handled.length > REMEMBERED_TAPS) handled.shift();
    const turn = ++latest;
    const current = () => !disposed && turn === latest;

    if (tap.kind !== 'valid') {
      open(UNAVAILABLE);
      return;
    }
    const state = await settled();
    if (!current()) return;
    if (state.status !== 'signed-in' || now() >= Date.parse(tap.payload.expiresAt)) {
      open(UNAVAILABLE);
      return;
    }
    const viewer: SignedInViewer = { kind: 'user', userId: state.user.id };
    let destination: NotificationDestination;
    try {
      destination = await resolve(tap.payload, viewer);
    } catch {
      destination = UNAVAILABLE;
    }
    if (!current()) return;
    const after = session.getState();
    open(after.status === 'signed-in' && after.user.id === viewer.userId ? destination : UNAVAILABLE);
  };

  return {
    start() {
      if (disposed || stopListening !== null) return;
      stopListening = notifications.onTap((tap) => void handle(tap));
      void notifications.takeInitialTap().then(
        (tap) => (tap === null ? undefined : handle(tap)),
        // The OS couldn't say how the app was opened; there is nothing to route.
        () => undefined,
      );
    },
    dispose() {
      disposed = true;
      stopListening?.();
      stopListening = null;
    },
  };
}
