import { z } from 'zod';

import { IdSchema, TimestampSchema } from './common.js';
import { JoinTargetSchema } from './groups.js';

/**
 * Notification limits chosen for the mock MVP (CONTRACT-004-B). The schemas enforce them;
 * revisit them before a backend exists.
 */
export const NOTIFICATION_POLICY = {
  /** Longest time from `issuedAt` to `expiresAt` (one hour, as long as a closed group's chat stays readable). */
  maxLifetimeSeconds: 3600,
} as const;

/**
 * Version of the notification payload shapes in this module. A payload with any other
 * `schemaVersion` fails validation, and the app treats its tap like a stale notification: a
 * generic unavailable notice, then the map.
 */
export const NOTIFICATION_SCHEMA_VERSION = 1;

/**
 * Fields every notification payload shares, besides its `kind` and resource IDs.
 *
 * - `id` identifies the notification, so the app handles a tap once even when the operating
 *   system reports it twice, for example after a cold start.
 * - `schemaVersion` is `NOTIFICATION_SCHEMA_VERSION`.
 * - `issuedAt` is when the source issued it, and `expiresAt` when it stops pointing anywhere
 *   useful: after `issuedAt`, at most `NOTIFICATION_POLICY.maxLifetimeSeconds` later, and no
 *   later than the resource it names stops being readable.
 */
const notificationFields = {
  id: IdSchema,
  schemaVersion: z.literal(NOTIFICATION_SCHEMA_VERSION),
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
};

/** Whether a notification expires after it was issued, within the longest lifetime. */
function hasAllowedLifetime({ issuedAt, expiresAt }: { issuedAt: string; expiresAt: string }): boolean {
  const lifetimeMs = Date.parse(expiresAt) - Date.parse(issuedAt);
  return lifetimeMs > 0 && lifetimeMs <= NOTIFICATION_POLICY.maxLifetimeSeconds * 1000;
}

const lifetimeRule = {
  message: `Expected expiry after issue, within ${NOTIFICATION_POLICY.maxLifetimeSeconds} seconds`,
  path: ['expiresAt'],
};

/**
 * New matches for the recipient's own active request (`matches.available`), sent only to its
 * owner.
 *
 * `rideRequestId` is the request. `target` is the ride or group that matched when there is one
 * new match, or `null` when there are several. `expiresAt` is no later than the request's.
 * A tap rereads the request and its matches, and shows them on the map.
 */
export const MatchesAvailableNotificationSchema = z
  .strictObject({
    ...notificationFields,
    kind: z.literal('matches.available'),
    rideRequestId: IdSchema,
    target: JoinTargetSchema.nullable(),
  })
  .refine(hasAllowedLifetime, lifetimeRule);
export type MatchesAvailableNotificationDto = z.infer<typeof MatchesAvailableNotificationSchema>;

/**
 * Someone joined the recipient's group (`group.member_joined`), sent to the members who were
 * already in it, never to the rider who joined. It names the group only, not who joined; a tap
 * rereads the group and opens its detail.
 */
export const GroupMemberJoinedNotificationSchema = z
  .strictObject({
    ...notificationFields,
    kind: z.literal('group.member_joined'),
    groupId: IdSchema,
  })
  .refine(hasAllowedLifetime, lifetimeRule);
export type GroupMemberJoinedNotificationDto = z.infer<typeof GroupMemberJoinedNotificationSchema>;

/**
 * The coordinator confirmed the meeting point (`group.ready`), sent to the other members. It
 * names the group only, never the meeting point; a tap rereads the group, whose member-only
 * view holds it.
 */
export const GroupReadyNotificationSchema = z
  .strictObject({
    ...notificationFields,
    kind: z.literal('group.ready'),
    groupId: IdSchema,
  })
  .refine(hasAllowedLifetime, lifetimeRule);
export type GroupReadyNotificationDto = z.infer<typeof GroupReadyNotificationSchema>;

/**
 * A new chat message in the recipient's group (`chat.message_created`), sent to the members
 * other than its sender. It names the group and the message, never the text or the sender; a
 * tap opens the chat after its history is synchronized, and the app reads the message there.
 */
export const ChatMessageCreatedNotificationSchema = z
  .strictObject({
    ...notificationFields,
    kind: z.literal('chat.message_created'),
    groupId: IdSchema,
    messageId: IdSchema,
  })
  .refine(hasAllowedLifetime, lifetimeRule);
export type ChatMessageCreatedNotificationDto = z.infer<typeof ChatMessageCreatedNotificationSchema>;

/**
 * The data of a push or local notification, told apart by `kind`.
 *
 * A payload carries resource IDs and times only. The strict schemas reject anything else,
 * such as message text, names, coordinates, meeting points, phone numbers and tokens, so a
 * payload never holds private content. It also carries no display text: the shown title and
 * body are fixed generic copy for each kind (for example "A person nearby is travelling in
 * your direction."), never built from resource data. Mock local notifications use the same
 * payloads.
 *
 * A notification is a hint, not a grant of access or authoritative state. On a tap the app
 * waits for the session to be restored, validates the payload, skips a notification ID it
 * already handled, and shows a generic unavailable notice for a payload that fails validation
 * or has expired. Otherwise it reads the current resource with the signed-in session and
 * navigates only if that read succeeds; a removed, closed or forbidden resource gets the same
 * unavailable notice, which reveals nothing about it.
 */
export const NotificationPayloadSchema = z.discriminatedUnion('kind', [
  MatchesAvailableNotificationSchema,
  GroupMemberJoinedNotificationSchema,
  GroupReadyNotificationSchema,
  ChatMessageCreatedNotificationSchema,
]);
export type NotificationPayloadDto = z.infer<typeof NotificationPayloadSchema>;
export type NotificationKind = NotificationPayloadDto['kind'];

/**
 * Identity of one installation of the app, the `installationId` path segment of the push-device
 * operations. The app creates a UUID once per installation, keeps it in local storage, and
 * sends the same one for every user who signs in there; a reinstall creates a new one. It is
 * never derived from hardware or advertising identifiers.
 */
export const InstallationIdSchema = z.uuid();
export type InstallationId = z.infer<typeof InstallationIdSchema>;

/**
 * Expo push token of an installation, in the bracketed form Expo returns:
 * `ExponentPushToken[…]` or `ExpoPushToken[…]`, with 1 or more URL-safe characters inside and
 * at most 256 characters in all. Raw device tokens and the legacy UUID form fail.
 *
 * Secret: anyone holding it can send notifications to the device. It is never logged, shown,
 * put in analytics, URLs, events or notifications, and no response echoes it.
 */
export const ExpoPushTokenSchema = z
  .string()
  .max(256)
  .regex(/^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]+\]$/, 'Expected an Expo push token');
export type ExpoPushToken = z.infer<typeof ExpoPushTokenSchema>;

/** Platform of an installation: `ios` or `android`. */
export const PushPlatformSchema = z.enum(['ios', 'android']);
export type PushPlatform = z.infer<typeof PushPlatformSchema>;

/**
 * The installation's notification permission, as the operating system reports it through
 * Expo: `granted`, `denied`, or `undetermined` before the user has been asked. The source
 * sends nothing to an installation whose permission is not `granted`.
 */
export const NotificationPermissionSchema = z.enum(['granted', 'denied', 'undetermined']);
export type NotificationPermission = z.infer<typeof NotificationPermissionSchema>;

/**
 * Registers or updates the push device of this installation for the signed-in user
 * (`PUT /me/push-devices/{installationId}`); the result is a `PushDeviceReceiptDto`.
 *
 * - `pushToken` is the installation's current token. The app registers only once it has one,
 *   and registers again when the token rotates.
 * - `platform` is the installation's platform.
 * - `permission` is the current permission. The app registers again when it changes, so a
 *   user who turns notifications off in the system settings stops receiving them.
 *
 * The request is an upsert by installation, so a retry needs no operation ID: it replaces the
 * token, platform and permission, and associates the installation with the caller, who comes
 * from the session. Another user signing in on the same installation takes it over, and a
 * token registered for another installation moves to this one, so a token never reaches two
 * users. An invalid body fails with `VALIDATION_FAILED`, and a missing or expired session with
 * `UNAUTHENTICATED` or `SESSION_EXPIRED`.
 *
 * Removing the registration (`DELETE /me/push-devices/{installationId}`) has no body and no
 * result (`204`), and succeeds whether or not it exists. The app removes it before signing out;
 * the source also drops an installation's association when the session that registered it
 * ends.
 */
export const RegisterPushDeviceInputSchema = z.strictObject({
  pushToken: ExpoPushTokenSchema,
  platform: PushPlatformSchema,
  permission: NotificationPermissionSchema,
});
export type RegisterPushDeviceInput = z.infer<typeof RegisterPushDeviceInputSchema>;

/**
 * Proof that the source stored a push-device registration: the `installationId` registered
 * and `registeredAt`, when this registration or update was stored. It echoes neither the token
 * nor the user.
 *
 * During the mock MVP the receipt is inert: the mock stores it but never delivers remote push,
 * and local notifications stand in for delivery.
 */
export const PushDeviceReceiptSchema = z.strictObject({
  installationId: InstallationIdSchema,
  registeredAt: TimestampSchema,
});
export type PushDeviceReceiptDto = z.infer<typeof PushDeviceReceiptSchema>;
