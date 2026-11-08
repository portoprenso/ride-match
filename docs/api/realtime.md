# Future API: realtime and notifications

Status: planned; the event and subscription contracts (CONTRACT-004-A) and the notification and push-device contracts (CONTRACT-004-B) exist in `packages/contracts`, and the app-side synchronization of events with reads exists (SYNC-001-A). Last updated: 2026-11-07. The mobile MVP uses an in-process event emitter and local notifications, not a Socket.IO server or remote push backend.

## Event envelope

Each domain event has an event ID, schema version, type, occurrence time, audience, and typed payload that carries the relevant resource version. Resource versions are compared only within that resource. Removed items carry tombstone identity/version so a delayed upsert cannot resurrect them.

| Event | Payload | Audience / cache action |
| --- | --- | --- |
| `nearby.upserted` | `item`: the safe `NearbyItemDto`, with its version; no match preview | Public (nearby subscribers, with discovery's authenticated filtering); replace a known item only with a newer version, never one not newer than its tombstone. With a destination selected, reread the snapshot for previews |
| `nearby.removed` | `target` (kind and ID), `version`, `reason` (`expired` or `unavailable`) | Public; remove the item and keep the tombstone |
| `ride.changed` | `rideRequestId`, `version`, `status` | The owner; reread the own request if newer. `grouped` leads to reading and subscribing to the group |
| `matches.changed` | `rideRequestId`, match-set `version` | The owner; reread matches if newer |
| `group.changed` | `groupId`, `version`, `reason` | The group's members (audience `groupId` equals the payload's); reread the group if newer |
| `chat.message.created` | `message`: the stored `ChatMessageDto` | The group's members, sender included (audience `groupId` equals the message's); merge by message ID, replace the sender's pending message by `clientMessageId`, and catch up if the sequence skips ahead |
| `access.revoked` | `groupId`, group `version` when access ended, `reason` (`left` or `history_expired`) | The affected user; clear the group's private data and chat and end its subscription, unless a newer group version is held (the user rejoined) |

Group reasons are `member_joined`, `member_left` (also a coordinator handover, and a leave by blocking), `ready`, `reopened`, `meeting_point_changed`, `completed` and `cancelled` (the group's closure gives why). Separate events for every field are unnecessary, and several changes may arrive as one event for the latest version. New event variants require schema tests and a documented audience/cache behavior.

No reason reveals a join or a block: a ride that joins a group, a group that closes, and an item a block hides from a subscriber are all `unavailable` to nearby subscribers, a leave by blocking is `member_left` to the group, and it is `left` to the blocker. One operation may raise several events, each for its audience; for example, a block-and-leave that leaves one member raises `access.revoked` for the blocker, `group.changed` (`cancelled`) for the remaining member, `ride.changed` for that member's cancelled request and `nearby.removed` for the group.

`occurredAt` is for display and diagnostics; the app orders changes by version (or message sequence), never by time or arrival. The app drops a private event whose audience user is not the signed-in user, or whose audience group is not one it may still read. An event that fails validation, such as an unknown type or schema version, is treated as a missed event: the app logs its type only and resynchronizes as after a reconnect.

## Subscription semantics

- Logical subscriptions are `nearby` (a coarse map viewport, at most 0.5° across), `user` (the signed-in user's own events, naming no user) and `group` (one group ID). Each receives only its audience's events: public, user or group.
- Anonymous connections may request a bounded nearby-area subscription.
- Authenticated connections provide an access token at connection setup; user rooms are derived from the validated identity.
- Group subscriptions require current authorized membership.
- Client requests logical subscriptions, never arbitrary server room names.
- A subscribe acknowledgement identifies accepted subscription scope: a subscription ID and the scope exactly as requested, never narrowed or widened. Requests outside permitted scope fail explicitly with an error body: `UNAUTHENTICATED` or `SESSION_EXPIRED` for `user` or `group` without a valid session, `MEMBERSHIP_REQUIRED` for a group the caller may not read (also an unknown group), `HISTORY_EXPIRED` after a closed group's history expired, `UNSUPPORTED_AREA` for an uncovered viewport and `VALIDATION_FAILED` for a malformed request.
- Subscription IDs are valid for one connection. Unsubscribing an unknown or ended subscription succeeds.
- Limit/debounce viewport subscription changes; unsubscribe obsolete areas.
- Public events use the same safe projection as REST discovery, including authenticated block filtering where relevant.
- Group/owner events are never sent into public nearby rooms.
- Logout, membership removal, block effects, and token expiry revoke/revalidate applicable subscriptions. Losing group access raises `access.revoked` on the user subscription and ends the group subscription; a block also removes each user's items from the other's nearby subscriptions as `unavailable`.
- Reject stale private events after session or membership changes; unsubscribe alone is not sufficient cache protection.

The future adapter may use Socket.IO rooms internally, but feature code sees only the typed data-source interface.

## Synchronization and reconnection

REST remains authoritative:

1. Establish subscriptions and acknowledge accepted scope.
2. Fetch resource snapshots.
3. Buffer/track events arriving during those reads; apply only newer canonical payloads or schedule a follow-up refetch.
4. Deduplicate events/messages by ID; do not overwrite a newer resource version.
5. Prefer invalidation for membership/matches/lifecycle changes. Merge full payloads only when simple and safe, such as a chat message.
6. On disconnect, show stale status; do not pretend current capacity is confirmed.
7. On reconnect or foreground return, resubscribe and refetch current own request, active group, nearby discovery, and applicable matches.
8. Catch up chat using `afterSequence`, paging until a page is empty or ends at `latestSequence`; a message event whose sequence skips ahead also starts catch-up. Refresh recent history if recovery context is invalid (an empty page for an `afterSequence` beyond `latestSequence`).
9. Cancel/reset subscriptions and private state on session/scenario changes.

Handle the snapshot/event race explicitly: an event during an in-flight snapshot must not be lost when an older snapshot resolves. Resource version guards and follow-up invalidation provide a small solution without an event-sourced client database.

The future Socket.IO client lives inside the real data-source implementation. Connection-state recovery is an optimization, not the correctness mechanism. Socket.IO documents ordering but default at-most-once arrival; missed-event recovery must remain explicit. [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)

## Implemented synchronization (SYNC-001-A)

`apps/mobile/src/data/synchronizeEvents.ts`, covered by `tests/synchronizeEvents.test.ts`. `createEventSynchronizer(queryClient)` applies events to the Query cache; `synchronizeSubscription` feeds it a subscription's events for one viewer. SYNC-001-B's coordinator creates and drives it; the first subscriber is discovery (MAP-002-A).

| Rule | Behavior |
| --- | --- |
| Once | An event ID applies once (the last 1,000 IDs are remembered); a repeat is `duplicate` |
| Versions | What events and reads taught is kept per viewer and per resource: public ones (`ride:<id>`, `group:<id>`, from discovery and preview reads) apart from private ones (`own-ride:<id>` for the own request and `ride.changed`, `member-group:<id>` for the group detail, `group.changed` and `access.revoked`), and `matches:<rideId>`. An event not newer than the known version is `stale`. Public and private are apart because the public tombstone of the rider's own ride or group carries the same version as the private change behind it (fixed in GROUP-002-B: a ride joined by someone else, or an expired request, left the card unchanged). A rider's tombstones never hide items from another viewer |
| Audience | A user event for another user, any private event for an anonymous viewer, and a group event after `access.revoked` (unless its version is newer, a rejoin) are `not-for-viewer` and touch nothing |
| `nearby.upserted` | Replaces the item in cached snapshots that hold it, and the item's held ride or group preview read when older. Snapshots without the item, or with match previews (a destination selected), are invalidated: only the source knows ordering, limits and previews |
| `nearby.removed` | Leaves a tombstone, removes the item (and its preview) from snapshots and invalidates its ride or group preview read |
| `ride.changed`, `matches.changed`, `group.changed` | Invalidate the own request, ride, matches, group detail or preview read unless it already holds that version; `ride.changed` also rereads the current user's references |
| `chat.message.created` | Joins the held chat history (`src/data/chatHistory.ts`, CHAT-001-C): a message already held or older than the newest held is a `duplicate`; the next sequence is appended to the latest page; a gap rereads the history. The mock source emits it since CHAT-001-A, through `group` subscriptions |
| `access.revoked` | Cancels and removes every private read of the group (`queryKeys.group`) and rereads the current user, unless a newer group version is held |
| Snapshot race | Each successful read is reconciled: a snapshot item older than a known upsert is replaced by it, one not newer than a tombstone is dropped, a newer item teaches its version; a single-resource read older than a known version, or a snapshot item older than a version known only from a private event, is reread once per known version. An upsert that arrives while a snapshot's first read is in flight (Query joins the invalidation to that read) rereads it once it lands, unless it holds the item |
| Invalid event | Reported by type only (`onInvalidEvent`, a warning by default), and every read of the viewer is invalidated, as after a missed event |

## Implemented lifecycle (SYNC-001-B)

`apps/mobile/src/data/createSyncCoordinator.ts`, built by the composition root with the app's Query client and started by the root layout; covered by `tests/syncCoordinator.test.ts`. Features keep a subscription with `useEventSubscription(request)` (`src/data/SyncProvider.tsx`) and key reads with `useViewer()`.

| Situation | Behavior |
| --- | --- |
| Watching | Equal requests share one subscription, ended when the last holder releases. `user` and `group` requests are subscribed only for a signed-in viewer. A refusal goes to the watchers' `onError` and is tried again after the next reconnect or identity change |
| Read after acknowledgement | Once a `user` or `group` subscription is acknowledged, the reads it keeps current are read again (own request and current user; the group's private reads), so a change between the first read and the acknowledgement is not lost (GROUP-002-B). Nearby reads start with their viewport's subscription and need none |
| Stale delivery | Each subscription carries a generation; an event or acknowledgement from a subscription that has since ended (identity change, disconnect, reset) is dropped, and a late acknowledgement is unsubscribed at once |
| Identity change | Sign-in, sign-out, an expired session or a demo reset: every subscription ends, the previous rider's reads are cancelled and removed (a read still on its way cannot settle into the cache), the synchronizer forgets what it learned, and watched subscriptions are made again for the new viewer. Anonymous reads stay when someone signs in |
| Disconnect | The source ends every subscription; Query's online state turns off, so reads wait (keeping what they showed) instead of failing |
| Reconnect | Watched subscriptions are made again and the viewer's reads are invalidated, so what is on screen is read anew (own request, group, discovery, matches) |
| Foreground | Query's focus follows `AppState`: returning to the foreground refetches stale reads on screen |
| Scenario start | The demo controls' wrapper discards the session and calls `resetWorld()`: subscriptions are made again into the new world; the demo screen clears the cached reads |
| Mutations | Never wait for the connection (`networkMode: 'always'`), so nothing is queued while offline |

## Implemented contracts (CONTRACT-004-A)

`packages/contracts/src/realtime.ts`, covered by `pnpm test:contracts`:

| Schema | Rule |
| --- | --- |
| `EVENT_SCHEMA_VERSION` | `1`; any other `schemaVersion` fails |
| `EventAudienceSchema` (`PublicAudienceSchema`, `UserAudienceSchema`, `GroupAudienceSchema`) | Union on `kind`: `public`; `user` with `userId`; `group` with `groupId`. Room names and lists of users fail |
| `NearbyUpsertedEventSchema`, `NearbyRemovedEventSchema` | Envelope (`id`, `schemaVersion`, `occurredAt`, `type`), audience `public`, and the payloads above. Exact origins, ride status or group, members, meeting points, closed groups, match previews, and removal reasons such as `grouped` or `blocked` fail |
| `RideChangedEventSchema`, `MatchesChangedEventSchema`, `AccessRevokedEventSchema` | Audience `user`. The exact origin, the matches themselves, a `blocked` revocation reason and a missing version fail |
| `GroupChangedEventSchema`, `ChatMessageCreatedEventSchema` | Audience `group`, refined to the payload's group. Member data, meeting points, a block reason and message delivery status fail |
| `DomainEventSchema` | Union on `type` of the seven events |
| `PublicEventSchema`, `UserEventSchema`, `GroupEventSchema` | The events each subscription kind receives; any other event fails, so a private event cannot pass on a nearby subscription |
| `SubscriptionRequestSchema` | Union on `kind`: `nearby` with a `MapViewportSchema` viewport, `user`, `group` with `groupId`. A caller-chosen user, a room name, an exact or oversized viewport and a destination fail |
| `SubscriptionAckSchema`, `UnsubscribeInputSchema` | `subscriptionId` with the accepted `subscription`; `subscriptionId` only |

No error codes were added. The notification payloads and device registration below are implemented by CONTRACT-004-B.

## Notification payloads

Use a versioned discriminated payload with notification ID, kind, relevant resource IDs, issuedAt, and expiresAt. Every payload has `id`, `schemaVersion` (1), `kind`, `issuedAt` and `expiresAt`: after `issuedAt`, at most one hour later, and no later than the named resource stops being readable. Kinds:

| Kind | Resource identifiers | Recipients | Expected entry |
| --- | --- | --- | --- |
| `matches.available` | `rideRequestId` (own request); `target` (ride or group) for one new match, `null` for several | The request's owner; expires no later than the request | Revalidated request/match on map |
| `group.member_joined` | `groupId` | The members already in the group, never the rider who joined | Current group detail |
| `group.ready` | `groupId` | The members other than the coordinator who confirmed | Ready group/meeting point |
| `chat.message_created` | `groupId`, `messageId` | The members other than the sender | Authorized chat after history sync |

No exact coordinates, phone numbers, credentials, or private message bodies in push payloads/lock-screen copy. Use generic text such as “A person nearby is travelling in your direction.” Local mock notifications use the same payload shape. The payload carries no display text at all, not even a name: the title and body are fixed generic copy for each kind, never built from resource data, and the strict schemas reject text, names, coordinates, meeting points, phone numbers, tokens, match details and links.

Notifications are hints, not permission grants or authoritative state. Validate payload/version, deduplicate notification taps, resolve authentication, fetch current resource, then navigate. Expired/removed/inaccessible resources produce an unavailable result. A cold start must wait for session/navigation readiness; duplicate callbacks must not stack screens. A payload that fails validation (such as a newer schema version) or has expired gets the generic unavailable notice without a read; otherwise the app reads the current resource with the signed-in session, so a notification for another user, a closed group or a removed target reveals nothing.

## Push-device registration specification

Paths use `/v1` and require an authenticated user.

| Method/path | Request | Response | Errors |
| --- | --- | --- | --- |
| `PUT /me/push-devices/{installationId}` | Expo push token, platform, notification permission state | Registration receipt: installation ID and registration time | `VALIDATION_FAILED` (such as an invalid token), `UNAUTHENTICATED` or `SESSION_EXPIRED` |
| `DELETE /me/push-devices/{installationId}` | None | `204`; idempotent | Session errors |

Upsert replaces a rotated token/permission state for that installation. Registration associates the current authenticated user; logout/account switches remove or reassign the association without leaking another user's notifications. Push tokens are sensitive operational data and must not be logged.

- `installationId` is a UUID the app creates once per installation and keeps locally, never a hardware or advertising identifier; a reinstall creates a new one.
- The app registers once it has a token, and again when the token rotates or the permission changes. The source sends nothing to an installation whose permission is not `granted`.
- The upsert needs no operation ID: a retry replaces the same registration. Another user signing in on the installation takes it over, and a token registered for another installation moves to this one, so a token never reaches two users.
- The app removes the registration before signing out, and the source also drops the association when the registering session ends. The receipt echoes neither the token nor the user.

During MVP, these operations store inert mock receipts. Do not register real remote push delivery or require backend push credentials. Ask notification permission contextually after a useful action rather than blocking initial browsing. Simulate notification entry with Expo local notifications in development builds. [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)

No background GPS or headless background workflow is required. Local scheduled notifications and foreground events are enough to exercise navigation and lifecycle behavior.

## Implemented notification contracts (CONTRACT-004-B)

`packages/contracts/src/notifications.ts`, covered by `pnpm test:contracts`:

| Schema | Rule |
| --- | --- |
| `NOTIFICATION_SCHEMA_VERSION`, `NOTIFICATION_POLICY` | `1`, and any other `schemaVersion` fails; `maxLifetimeSeconds` 3,600 |
| `MatchesAvailableNotificationSchema`, `GroupMemberJoinedNotificationSchema`, `GroupReadyNotificationSchema`, `ChatMessageCreatedNotificationSchema` | `id`, `schemaVersion`, `kind`, `issuedAt`, `expiresAt` (after issue, within the lifetime; failures on `expiresAt`) and the resource IDs above. Text, titles, bodies, names, the recipient, coordinates, meeting points, phone numbers, tokens, matches, match levels and links fail |
| `NotificationPayloadSchema` | Union on `kind` of the four; `NotificationKind` is its kind. The realtime type `chat.message.created` is not a notification kind |
| `InstallationIdSchema` | UUID |
| `ExpoPushTokenSchema` | `ExponentPushToken[…]` or `ExpoPushToken[…]` with URL-safe characters inside, at most 256 characters; raw device tokens and the legacy UUID form fail. Secret |
| `PushPlatformSchema`, `NotificationPermissionSchema` | `ios`, `android`; `granted`, `denied`, `undetermined` |
| `RegisterPushDeviceInputSchema` | `pushToken`, `platform`, `permission`. The installation (in the path), a user, device details and locations fail |
| `PushDeviceReceiptSchema` | `installationId`, `registeredAt`. An echoed token, the user, the permission or a delivery status fail |

No error codes were added. Removal (`DELETE`) has no schema and always answers `204`.

## Verification

Duplicate/out-of-order events, snapshot races, multiple reconnects, lost message pages, revoked subscriptions, logout/session replacement, scenario reset cleanup, denied notifications, duplicate taps, warm/cold entry, expired targets, and privacy-safe payloads.
