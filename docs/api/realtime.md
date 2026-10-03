# Future API: realtime and notifications

Status: planned. Last updated: 2026-10-03. The mobile MVP uses an in-process event emitter and local notifications, not a Socket.IO server or remote push backend.

## Event envelope

Each domain event has an event ID, schema version, type, occurrence time, relevant resource version, and typed payload. Resource versions are compared only within that resource. Removed items carry tombstone identity/version so a delayed upsert cannot resurrect them.

| Event | Payload | Audience / cache action |
| --- | --- | --- |
| `nearby.upserted` | Safe `NearbyItemDto` | Authorized nearby subscribers; update known item or invalidate collection |
| `nearby.removed` | Item kind/ID, version, reason | Nearby subscribers; remove/invalidate |
| `ride.changed` | Own request ID, version, status | Owner; refetch own request |
| `matches.changed` | Request ID, match-set version | Owner; invalidate matches |
| `group.changed` | Group ID, version, reason | Authorized members; refetch group/related state |
| `chat.message.created` | Canonical message | Authorized members; merge/deduplicate and update history |
| `access.revoked` | Resource type and ID, relevant version/context | Affected user; clear private cache and subscriptions |

Group reasons include member joined/left, readiness, cancellation, completion, and meeting-point update. Separate events for every field are unnecessary. New event variants require schema tests and a documented audience/cache behavior.

## Subscription semantics

- Anonymous connections may request a bounded nearby-area subscription.
- Authenticated connections provide an access token at connection setup; user rooms are derived from the validated identity.
- Group subscriptions require current authorized membership.
- Client requests logical subscriptions, never arbitrary server room names.
- A subscribe acknowledgement identifies accepted subscription scope. Requests outside permitted scope fail explicitly.
- Limit/debounce viewport subscription changes; unsubscribe obsolete areas.
- Public events use the same safe projection as REST discovery, including authenticated block filtering where relevant.
- Group/owner events are never sent into public nearby rooms.
- Logout, membership removal, block effects, and token expiry revoke/revalidate applicable subscriptions.
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
8. Catch up chat using `afterSequence`, paging until caught up. Refresh recent history if recovery context is invalid.
9. Cancel/reset subscriptions and private state on session/scenario changes.

Handle the snapshot/event race explicitly: an event during an in-flight snapshot must not be lost when an older snapshot resolves. Resource version guards and follow-up invalidation provide a small solution without an event-sourced client database.

The future Socket.IO client lives inside the real data-source implementation. Connection-state recovery is an optimization, not the correctness mechanism. Socket.IO documents ordering but default at-most-once arrival; missed-event recovery must remain explicit. [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)

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
