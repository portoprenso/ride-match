import { z } from 'zod';

import { ChatMessageSchema } from './chat.js';
import { IdSchema, ResourceVersionSchema, TimestampSchema } from './common.js';
import { JoinTargetSchema } from './groups.js';
import { MapViewportSchema, NearbyItemSchema } from './nearby.js';
import { RideRequestStatusSchema } from './rides.js';

/**
 * Version of the event shapes in this module. An event with any other `schemaVersion` fails
 * validation; the app treats it like a missed event and resynchronizes, as after a reconnect.
 */
export const EVENT_SCHEMA_VERSION = 1;

/** Audience of a public event: every nearby subscription whose area holds the item. */
export const PublicAudienceSchema = z.strictObject({ kind: z.literal('public') });

/** Audience of an event for one signed-in user, `userId`, and nobody else. */
export const UserAudienceSchema = z.strictObject({ kind: z.literal('user'), userId: IdSchema });

/** Audience of an event for the members of group `groupId`. */
export const GroupAudienceSchema = z.strictObject({ kind: z.literal('group'), groupId: IdSchema });

/**
 * Who receives an event, told apart by `kind`.
 *
 * - `public`: nearby subscribers, including anonymous ones. For a signed-in subscriber the
 *   source applies the same filtering as discovery reads: no own request or group, and nobody
 *   either side has blocked.
 * - `user`: only that signed-in user.
 * - `group`: only the group's current members. When the group closes, the members at closure
 *   receive that change too.
 *
 * Each event type has one audience kind, which its schema fixes. The app drops a private event
 * whose `userId` is not the signed-in user, or whose `groupId` is not a group it may still
 * read, so after a sign-out, a user switch or a leave a late event cannot restore private data.
 */
export const EventAudienceSchema = z.discriminatedUnion('kind', [
  PublicAudienceSchema,
  UserAudienceSchema,
  GroupAudienceSchema,
]);
export type EventAudienceDto = z.infer<typeof EventAudienceSchema>;

/**
 * Fields every event shares, before its `type`, `audience` and `payload`.
 *
 * - `id` identifies the event, so a repeated delivery is applied once.
 * - `schemaVersion` is `EVENT_SCHEMA_VERSION`.
 * - `occurredAt` is when the change happened on the source clock. It is for display and
 *   diagnostics only: the app orders changes by the resource version in the payload (or the
 *   message sequence), never by time or arrival.
 */
const eventFields = {
  id: IdSchema,
  schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
  occurredAt: TimestampSchema,
};

/**
 * A nearby item appeared or changed (`nearby.upserted`), for nearby subscribers.
 *
 * `payload.item` is the same public projection as a discovery read, with its own `version`.
 * The app replaces its copy only with a newer version, and ignores an upsert that is not newer
 * than a removal it already applied. The event carries no match preview, since previews depend
 * on the viewer's destination; with a destination selected, the app rereads the snapshot for
 * new items' previews.
 */
export const NearbyUpsertedEventSchema = z.strictObject({
  ...eventFields,
  type: z.literal('nearby.upserted'),
  audience: PublicAudienceSchema,
  payload: z.strictObject({ item: NearbyItemSchema }),
});
export type NearbyUpsertedEventDto = z.infer<typeof NearbyUpsertedEventSchema>;

/**
 * Why a nearby item left discovery.
 *
 * - `expired`: it reached its public `expiresAt`.
 * - `unavailable`: anything else. A ride was cancelled, completed or joined a group, a group
 *   closed, or the item is no longer shown to this subscriber. One reason covers them all, so
 *   the event never reveals that a ride joined a group or that someone blocked someone.
 */
export const NearbyRemovalReasonSchema = z.enum(['expired', 'unavailable']);
export type NearbyRemovalReason = z.infer<typeof NearbyRemovalReasonSchema>;

/**
 * A nearby item left discovery (`nearby.removed`), for nearby subscribers.
 *
 * The payload is a tombstone: `target` (the item's `kind` and `id`), the item's `version`
 * when it was removed, and the `reason`. The app removes the item and keeps the tombstone, so
 * a delayed upsert with a version not newer than it cannot bring the item back. A snapshot
 * read after the removal is authoritative and replaces the tombstone.
 */
export const NearbyRemovedEventSchema = z.strictObject({
  ...eventFields,
  type: z.literal('nearby.removed'),
  audience: PublicAudienceSchema,
  payload: z.strictObject({
    target: JoinTargetSchema,
    version: ResourceVersionSchema,
    reason: NearbyRemovalReasonSchema,
  }),
});
export type NearbyRemovedEventDto = z.infer<typeof NearbyRemovedEventSchema>;

/**
 * The owner's ride request changed (`ride.changed`), for its owner only.
 *
 * The payload names the request, its new `version` and `status`. If the version is newer than
 * the one it holds, the app rereads the own request, which carries the exact origin that an
 * event never does. A request that becomes `grouped` tells the app to read the group and
 * subscribe to it.
 */
export const RideChangedEventSchema = z.strictObject({
  ...eventFields,
  type: z.literal('ride.changed'),
  audience: UserAudienceSchema,
  payload: z.strictObject({
    rideRequestId: IdSchema,
    version: ResourceVersionSchema,
    status: RideRequestStatusSchema,
  }),
});
export type RideChangedEventDto = z.infer<typeof RideChangedEventSchema>;

/**
 * The owner's match set changed (`matches.changed`), for its owner only.
 *
 * The payload names the request and the match set's new `version`. If the version is newer,
 * the app rereads the matches. A block that drops a target from the set raises this event like
 * any other change.
 */
export const MatchesChangedEventSchema = z.strictObject({
  ...eventFields,
  type: z.literal('matches.changed'),
  audience: UserAudienceSchema,
  payload: z.strictObject({
    rideRequestId: IdSchema,
    version: ResourceVersionSchema,
  }),
});
export type MatchesChangedEventDto = z.infer<typeof MatchesChangedEventSchema>;

/**
 * What changed in a group, for `group.changed`.
 *
 * - `member_joined`, `member_left`: membership changed. A coordinator handover comes with
 *   `member_left`; a leave by blocking is an ordinary `member_left`.
 * - `ready`, `reopened`: the coordinator marked the group ready, or reopened it.
 * - `meeting_point_changed`: the source suggested, replaced or withdrew the point, which also
 *   returns a ready group to forming.
 * - `completed`, `cancelled`: the group closed. The group's `closure` gives the reason.
 */
export const GroupChangeReasonSchema = z.enum([
  'member_joined',
  'member_left',
  'ready',
  'reopened',
  'meeting_point_changed',
  'completed',
  'cancelled',
]);
export type GroupChangeReason = z.infer<typeof GroupChangeReasonSchema>;

/**
 * A group changed (`group.changed`), for its members.
 *
 * The payload names the group, its new `version` and the `reason`; the audience is the same
 * group. If the version is newer, the app rereads the group, so member data never travels in
 * events. Several changes in a row may arrive as one event for the latest version.
 */
export const GroupChangedEventSchema = z
  .strictObject({
    ...eventFields,
    type: z.literal('group.changed'),
    audience: GroupAudienceSchema,
    payload: z.strictObject({
      groupId: IdSchema,
      version: ResourceVersionSchema,
      reason: GroupChangeReasonSchema,
    }),
  })
  .refine((event) => event.audience.groupId === event.payload.groupId, {
    message: 'Expected the event for the members of the changed group',
    path: ['audience', 'groupId'],
  });
export type GroupChangedEventDto = z.infer<typeof GroupChangedEventSchema>;

/**
 * A message was stored in a group's chat (`chat.message.created`), for its members, including
 * the sender.
 *
 * The payload is the stored message itself; the audience is the message's group. The app
 * merges it by message ID, and the sender's app replaces its pending message with the one that
 * carries its `clientMessageId`. A sequence more than one past the newest message the app
 * holds means it missed messages, which it reads with `afterSequence`.
 */
export const ChatMessageCreatedEventSchema = z
  .strictObject({
    ...eventFields,
    type: z.literal('chat.message.created'),
    audience: GroupAudienceSchema,
    payload: z.strictObject({ message: ChatMessageSchema }),
  })
  .refine((event) => event.audience.groupId === event.payload.message.groupId, {
    message: 'Expected the event for the members of the message’s group',
    path: ['audience', 'groupId'],
  });
export type ChatMessageCreatedEventDto = z.infer<typeof ChatMessageCreatedEventSchema>;

/**
 * Why a user lost access to a group.
 *
 * - `left`: the user left it, including by blocking a member.
 * - `history_expired`: the group closed and its `historyExpiresAt` passed.
 */
export const AccessRevocationReasonSchema = z.enum(['left', 'history_expired']);
export type AccessRevocationReason = z.infer<typeof AccessRevocationReasonSchema>;

/**
 * The user lost access to a group (`access.revoked`), for that user only, on their user
 * subscription: they are no longer among the group's audience.
 *
 * The payload names the group, its `version` when access ended and the `reason`. The app
 * clears the group's private data and chat and ends its group subscription; the source ends it
 * too. A user who rejoined the group later holds a newer version and ignores a delayed
 * revocation. Only group access is revoked by event; the end of a session shows through
 * authentication errors, and the app clears its private data itself.
 */
export const AccessRevokedEventSchema = z.strictObject({
  ...eventFields,
  type: z.literal('access.revoked'),
  audience: UserAudienceSchema,
  payload: z.strictObject({
    groupId: IdSchema,
    version: ResourceVersionSchema,
    reason: AccessRevocationReasonSchema,
  }),
});
export type AccessRevokedEventDto = z.infer<typeof AccessRevokedEventSchema>;

/**
 * Any domain event, told apart by `type`. Events synchronize caches; REST snapshots and
 * mutation results stay authoritative, and missed events are recovered by rereading, not by
 * redelivery. One operation may raise several events, each for its own audience.
 */
export const DomainEventSchema = z.discriminatedUnion('type', [
  NearbyUpsertedEventSchema,
  NearbyRemovedEventSchema,
  RideChangedEventSchema,
  MatchesChangedEventSchema,
  GroupChangedEventSchema,
  ChatMessageCreatedEventSchema,
  AccessRevokedEventSchema,
]);
export type DomainEventDto = z.infer<typeof DomainEventSchema>;

/** The events a nearby subscription receives: public projections only. */
export const PublicEventSchema = z.discriminatedUnion('type', [NearbyUpsertedEventSchema, NearbyRemovedEventSchema]);
export type PublicEventDto = z.infer<typeof PublicEventSchema>;

/** The events a user subscription receives: changes to the user's own request, matches and access. */
export const UserEventSchema = z.discriminatedUnion('type', [
  RideChangedEventSchema,
  MatchesChangedEventSchema,
  AccessRevokedEventSchema,
]);
export type UserEventDto = z.infer<typeof UserEventSchema>;

/** The events a group subscription receives: group changes and chat messages. */
export const GroupEventSchema = z.discriminatedUnion('type', [GroupChangedEventSchema, ChatMessageCreatedEventSchema]);
export type GroupEventDto = z.infer<typeof GroupEventSchema>;

/**
 * A logical subscription the app asks for, told apart by `kind`. The app never names server
 * rooms; the source derives them.
 *
 * - `nearby`: public events for a coarse map `viewport`, open to anonymous connections. The
 *   app subscribes to the area it shows and unsubscribes an area it no longer shows.
 * - `user`: the signed-in user's own events. It names no user: the source takes the user from
 *   the connection's session.
 * - `group`: events of group `groupId`, for a user who may read the group.
 *
 * A request outside the caller's scope fails with an `ApiErrorDto`: `UNAUTHENTICATED` or
 * `SESSION_EXPIRED` for `user` or `group` without a valid session, `MEMBERSHIP_REQUIRED` for a
 * group the caller may not read (also for an unknown group), `HISTORY_EXPIRED` after a closed
 * group's history expired, `UNSUPPORTED_AREA` for a viewport outside the covered area, and
 * `VALIDATION_FAILED` for a malformed request.
 */
export const SubscriptionRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('nearby'), viewport: MapViewportSchema }),
  z.strictObject({ kind: z.literal('user') }),
  z.strictObject({ kind: z.literal('group'), groupId: IdSchema }),
]);
export type SubscriptionRequest = z.infer<typeof SubscriptionRequestSchema>;

/**
 * Acknowledges an accepted subscription: `subscriptionId` names it for unsubscribing, and
 * `subscription` is the accepted scope, exactly as requested. The source never narrows or
 * widens a scope; it accepts it or fails.
 *
 * A subscription lasts until the app unsubscribes, the connection ends, or the source ends it
 * after revoking access. Subscription IDs are valid for one connection only, so after a
 * reconnect the app subscribes again, then rereads its snapshots.
 */
export const SubscriptionAckSchema = z.strictObject({
  subscriptionId: IdSchema,
  subscription: SubscriptionRequestSchema,
});
export type SubscriptionAckDto = z.infer<typeof SubscriptionAckSchema>;

/** Ends a subscription. Unsubscribing an unknown or already ended subscription succeeds. */
export const UnsubscribeInputSchema = z.strictObject({
  subscriptionId: IdSchema,
});
export type UnsubscribeInput = z.infer<typeof UnsubscribeInputSchema>;
