import {
  NotificationPayloadSchema,
  type NotificationKind,
  type NotificationPayloadDto,
  type NotificationPermission,
} from '@ride-match/contracts';
import * as Notifications from 'expo-notifications';

/*
 * The app's one local-notification boundary (NOTIFICATION-001-A), over Expo Notifications.
 *
 * - Only validated payloads (`NotificationPayloadSchema`) are scheduled or read back: resource
 *   IDs and times, never names, message text, places, coordinates, phone numbers or tokens.
 * - The shown title and body are fixed generic copy for each kind (`NOTIFICATION_COPY`), never
 *   built from resource data, so nothing private reaches the lock screen.
 * - It schedules local notifications only. It never asks for a push token or registers for
 *   remote push; the mock's device registration stores inert receipts.
 * - It shows no prompt by itself and keeps no state; when to ask, what to schedule and where a
 *   tap leads are the callers' (NOTIFICATION-001-B and C).
 * - Nothing here logs: payload IDs are private enough to keep out of logs, and OS errors are
 *   reduced to an outcome.
 */

/** The part of Expo Notifications this boundary uses, so tests can supply their own. */
export type NotificationsModule = Pick<
  typeof Notifications,
  | 'getPermissionsAsync'
  | 'requestPermissionsAsync'
  | 'scheduleNotificationAsync'
  | 'cancelAllScheduledNotificationsAsync'
  | 'dismissAllNotificationsAsync'
  | 'addNotificationResponseReceivedListener'
  | 'getLastNotificationResponseAsync'
  | 'clearLastNotificationResponseAsync'
>;

/** The generic words shown for each kind, the same on every device and for every resource. */
export const NOTIFICATION_COPY: Readonly<Record<NotificationKind, { title: string; body: string }>> = {
  'matches.available': { title: 'Ride Match', body: 'A person nearby is travelling in your direction.' },
  'group.member_joined': { title: 'Ride Match', body: 'Someone joined your group.' },
  'group.ready': { title: 'Ride Match', body: 'Your group is ready.' },
  'chat.message_created': { title: 'Ride Match', body: 'New message in your group chat.' },
};

/**
 * What a notification's data turned out to be:
 *
 * - `valid`: a payload of a known kind and version that has not expired.
 * - `expired`: valid, but past its `expiresAt`, so it points nowhere useful; its ID is kept so a
 *   tap can still be handled once.
 * - `invalid`: anything else (another version, an unknown kind, extra fields). Nothing of it is
 *   kept, so a malformed payload can't carry private data further.
 */
export type NotificationRead =
  { kind: 'valid'; payload: NotificationPayloadDto } | { kind: 'expired'; id: string } | { kind: 'invalid' };

/** Reads a notification's data against the contract and the clock. */
export function readNotificationPayload(data: unknown, now: number): NotificationRead {
  const parsed = NotificationPayloadSchema.safeParse(data);
  if (!parsed.success) return { kind: 'invalid' };
  if (now >= Date.parse(parsed.data.expiresAt)) return { kind: 'expired', id: parsed.data.id };
  return { kind: 'valid', payload: parsed.data };
}

/**
 * The OS permission in the contract's words. iOS provisional and ephemeral authorization deliver
 * notifications, so they count as `granted`.
 */
export function toNotificationPermission(status: Notifications.NotificationPermissionsStatus): NotificationPermission {
  const ios = status.ios?.status;
  if (
    status.status === 'granted' ||
    ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    ios === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  return status.status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * What presenting a notification came to:
 *
 * - `scheduled`: handed to the OS, under the payload's own ID, so presenting the same
 *   notification again replaces it rather than showing it twice.
 * - `invalid`: the payload failed the contract; nothing was scheduled.
 * - `expired`: it would expire before it shows; nothing was scheduled.
 * - `not-permitted`: notifications aren't allowed; nothing was scheduled and nobody was asked.
 * - `failed`: the OS refused or threw; nothing about the payload was kept.
 */
export type PresentOutcome =
  { kind: 'scheduled'; id: string } | { kind: 'invalid' | 'expired' | 'not-permitted' | 'failed' };

/** A tap on a notification's body (not one of its action buttons), read with `readNotificationPayload`. */
export type NotificationTap = NotificationRead;

export type LocalNotifications = {
  /** The current permission, without asking. */
  getPermission(): Promise<NotificationPermission>;
  /** Shows the OS prompt (or answers at once when the OS no longer asks) and returns the outcome. */
  requestPermission(): Promise<NotificationPermission>;
  /** Schedules a local notification for `payload`, now or after `delaySeconds`. */
  present(payload: unknown, options?: { delaySeconds?: number }): Promise<PresentOutcome>;
  /**
   * Cancels scheduled notifications, removes shown ones and forgets the last tap, so nothing
   * meant for a rider who signed out can show or be opened later. Resolves `false` when the
   * OS refused part of it.
   */
  clearAll(): Promise<boolean>;
  /** Calls `listener` for each tap while the app runs; returns the unsubscribe. */
  onTap(listener: (tap: NotificationTap) => void): () => void;
  /**
   * The tap that opened the app, if any, read once: it is forgotten as it is returned, so a
   * later call (a remount, a second launch check) never handles it again.
   */
  takeInitialTap(): Promise<NotificationTap | null>;
};

/**
 * The local-notification boundary over `module` (Expo Notifications unless a test passes its
 * own), with `now` as the clock for expiry.
 */
export function createLocalNotifications(
  module: NotificationsModule = Notifications,
  now: () => number = Date.now,
): LocalNotifications {
  const readTap = (response: Notifications.NotificationResponse): NotificationTap | null =>
    response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ? readNotificationPayload(response.notification.request.content.data, now())
      : null;

  return {
    async getPermission() {
      return toNotificationPermission(await module.getPermissionsAsync());
    },
    async requestPermission() {
      return toNotificationPermission(await module.requestPermissionsAsync());
    },
    async present(payload, options = {}) {
      const read = readNotificationPayload(payload, now());
      if (read.kind !== 'valid') return { kind: read.kind };
      const delaySeconds = Math.max(0, Math.ceil(options.delaySeconds ?? 0));
      if (now() + delaySeconds * 1000 >= Date.parse(read.payload.expiresAt)) return { kind: 'expired' };
      try {
        if (toNotificationPermission(await module.getPermissionsAsync()) !== 'granted')
          return { kind: 'not-permitted' };
        const { title, body } = NOTIFICATION_COPY[read.payload.kind];
        const id = await module.scheduleNotificationAsync({
          identifier: read.payload.id,
          content: { title, body, data: read.payload },
          trigger:
            delaySeconds === 0
              ? null
              : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds },
        });
        return { kind: 'scheduled', id };
      } catch {
        // The OS error may repeat the payload's IDs; the outcome says all the caller needs.
        return { kind: 'failed' };
      }
    },
    async clearAll() {
      const results = await Promise.allSettled([
        module.cancelAllScheduledNotificationsAsync(),
        module.dismissAllNotificationsAsync(),
        module.clearLastNotificationResponseAsync(),
      ]);
      return results.every((result) => result.status === 'fulfilled');
    },
    onTap(listener) {
      const subscription = module.addNotificationResponseReceivedListener((response) => {
        const tap = readTap(response);
        if (tap !== null) listener(tap);
      });
      return () => subscription.remove();
    },
    async takeInitialTap() {
      const response = await module.getLastNotificationResponseAsync();
      if (response === null) return null;
      await module.clearLastNotificationResponseAsync();
      return readTap(response);
    },
  };
}
