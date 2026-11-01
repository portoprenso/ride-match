# Future API: realtime and notifications

Status: planned; the event and subscription contracts (CONTRACT-004-A) exist in `packages/contracts`, and the notification contracts are still planned. Last updated: 2026-11-01. The mobile MVP uses an in-process event emitter and local notifications, not a Socket.IO server or remote push backend.

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

No error codes were added. The notification payloads and device registration below remain planned (CONTRACT-004-B).

## Notification payloads

Use a versioned discriminated payload with notification ID, kind, relevant resource IDs, issuedAt, and expiresAt. Kinds:

| Kind | Resource identifiers | Expected entry |
| --- | --- | --- |
| `matches.available` | Own request ID, optional target reference | Revalidated request/match on map |
| `group.member_joined` | Group ID | Current group detail |
| `group.ready` | Group ID | Ready group/meeting point |
| `chat.message_created` | Group ID, message ID | Authorized chat after history sync |

No exact coordinates, phone numbers, credentials, or private message bodies in push payloads/lock-screen copy. Use generic text such as “A person nearby is travelling in your direction.” Local mock notifications use the same payload shape.

Notifications are hints, not permission grants or authoritative state. Validate payload/version, deduplicate notification taps, resolve authentication, fetch current resource, then navigate. Expired/removed/inaccessible resources produce an unavailable result. A cold start must wait for session/navigation readiness; duplicate callbacks must not stack screens.

## Push-device registration specification

Paths use `/v1` and require an authenticated user.

| Method/path | Request | Response | Errors |
| --- | --- | --- | --- |
| `PUT /me/push-devices/{installationId}` | Expo push token, platform, notification permission state | Registration receipt | Invalid token, unauthenticated |
| `DELETE /me/push-devices/{installationId}` | None | `204`; idempotent | Session errors |

Upsert replaces a rotated token/permission state for that installation. Registration associates the current authenticated user; logout/account switches remove or reassign the association without leaking another user's notifications. Push tokens are sensitive operational data and must not be logged.

During MVP, these operations store inert mock receipts. Do not register real remote push delivery or require backend push credentials. Ask notification permission contextually after a useful action rather than blocking initial browsing. Simulate notification entry with Expo local notifications in development builds. [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)

No background GPS or headless background workflow is required. Local scheduled notifications and foreground events are enough to exercise navigation and lifecycle behavior.

## Verification

Duplicate/out-of-order events, snapshot races, multiple reconnects, lost message pages, revoked subscriptions, logout/session replacement, scenario reset cleanup, denied notifications, duplicate taps, warm/cold entry, expired targets, and privacy-safe payloads.
