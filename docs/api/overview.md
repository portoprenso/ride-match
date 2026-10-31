# Future API: conventions, boundaries, and handoff

Status: proposed specification, not an implemented API. Last updated: 2026-10-31. The shared schemas for [common values and errors](#common-values-and-errors-contract-001-a) and for [locations and users](#locations-and-users-contract-001-b) exist in `packages/contracts`; the other contracts are still planned.

The mobile mock data source must reproduce these observable operations and rules. A future NestJS backend will implement the reviewed contracts after the mock mobile MVP. No backend implementation belongs to the current milestone.

## Authority and conventions

- REST snapshots and mutation responses are authoritative. Realtime events synchronize/invalidate caches.
- Base path: `/v1`.
- Successful responses: `{ data, meta: { serverTime } }`; `204` responses have no body.
- Endpoint tables describe unwrapped `data`.
- Opaque string IDs; ISO-8601 UTC timestamps; bounded strings and arrays.
- Use explicit `null` for known absence. Use omitted optional fields only when omission has documented meaning.
- Resource versions are monotonically increasing integers for that resource, not a global clock.
- Server time drives expiry decisions. Clients may derive countdowns using an observed clock offset but cannot extend validity.
- Pagination uses opaque cursors and documented ordering. A bounded nearby map snapshot can report `truncated` instead of pretending it includes every result.
- Public endpoints support anonymous browsing. Optional authenticated context personalizes filtering without exposing additional private fields.
- User IDs and roles come from authentication, never from caller-supplied ownership fields.
- Exact native device state and UI state do not become API fields merely for rendering convenience.

## Shared contract inventory

Schemas live in `packages/contracts`, organized as described in [architecture](../ARCHITECTURE.md). Use one Zod definition per shape and infer its TypeScript type. Distinguish input, public, owner, and member schemas. Object schemas are strict: unknown fields fail validation.

| Contract | Essential fields / constraints |
| --- | --- |
| `CoordinatesDto` | Latitude/longitude with valid ranges; no implied access permission. Implemented; see [locations and users](#locations-and-users-contract-001-b) |
| `ExactLocationInput` | Device fix (coordinates, accuracy, captured time) or confirmed manual point; sensitive input. Implemented |
| `OwnerLocationDto` | Owner's own exact point and its source; owner responses only. Implemented |
| `PublicLocationDto` | Approximate area center, uncertainty radius, optional area label. Implemented |
| `UserDto` | ID, display name, optional avatar URL; never phone/session fields. Implemented |
| `CurrentUserDto` | User and current request/group references. Implemented |
| `OtpChallengeDto` | Challenge ID, expiresAt, resendAvailableAt |
| `VerifyOtpInput` | Challenge ID, OTP code |
| `AuthSessionDto` | User, access/refresh credentials and expiry timestamps |
| `PlaceDto` | Stable place ID, label, coordinates of selected place/venue |
| `CreateRideRequestInput` | Exact origin, selected destination, departure time, client operation ID |
| `RideRequestDto` | ID, public user summary, public origin/destination, departure/expiry, status, group reference, version |
| `OwnRideRequestDto` | Public request plus authorized owner-only draft restoration fields |
| `NearbyItemDto` | Discriminated public ride or public group summary |
| `RideMatchDto` | Target ride/group, match level, optional additional minutes, validity time, version |
| `RideGroupDto` | ID, coordinator, authorized members, capacity, status, destination, departure, meeting point, expiry, version |
| `GroupMemberDto` | User summary, joinedAt, linked request ID |
| `MeetingPointDto` | ID, shared place coordinates, label, optional viewer-specific walking estimate. Implemented; group embedding and updates come with CONTRACT-003-A |
| `ChatMessageDto` | ID, group ID, sender, text, createdAt, group-local sequence, client message ID |
| `ReportUserInput` | Target, reason, optional bounded details, optional relevant group/message reference |
| `BlockUserInput` | Target user ID |
| `NotificationPayloadDto` | Payload version, notification ID, kind, resource IDs, issuedAt/expiresAt |
| `DomainEventDto` | Event ID, schema version, type, occurredAt, resource version and payload |
| `ApiErrorDto` | Code, safe message, request ID, optional field errors/retry delay. Implemented; see below |

Keep enums/status schemas near their domain. Do not export React types, query keys, marker colors, database models, Prisma/PostGIS types, service implementations, or backend-only algorithms.

## Common values and errors (CONTRACT-001-A)

Implemented in `packages/contracts/src/{common,errors}.ts` and covered by `pnpm test:contracts`. These rules make the conventions above exact:

| Schema | Rule |
| --- | --- |
| `IdSchema` | 1–64 URL-safe characters (`A–Z`, `a–z`, `0–9`, `_`, `-`), because IDs appear in paths. UUIDs, ULIDs and prefixed IDs fit. Opaque: never parsed |
| `TimestampSchema` | ISO-8601 with a `Z` suffix; offsets, local times and date-only values fail; calendar dates are checked; fractional seconds optional. Stays a string |
| `ResourceVersionSchema` | Safe integer from 1, increasing per resource |
| `OperationIdSchema` | A UUID created once per user intent and reused on every retry of it; the future `Idempotency-Key` |
| `CursorSchema` | 1–512 RFC 3986 unreserved characters (`A–Z`, `a–z`, `0–9`, `-`, `.`, `_`, `~`), so it needs no encoding in a query string. Opaque |
| `ResponseMetaSchema`, `apiResponseSchema(data)` | The success envelope `{ data, meta: { serverTime } }`; no other top-level fields |
| `ApiErrorCodeSchema` | Exactly the codes in the [errors](#errors) table. A domain contract that owns more codes (OTP verification in CONTRACT-001-C) adds them to this list |
| `FieldErrorSchema` | `{ field, code, message }`. `field` is a dot path (`origin.latitude`, `members.0.userId`); `code` is `REQUIRED`, `INVALID_FORMAT`, `TOO_SHORT`, `TOO_LONG`, `OUT_OF_RANGE` or `INVALID_VALUE`; `message` is 1–200 characters. There is no field for the submitted value, so an error cannot echo it |
| `ApiErrorSchema` | `code`, `message` (1–500 characters, safe to show), `requestId` (an ID), optional `fieldErrors` (1–50), optional `retryAfterSeconds` (integer, 1–86,400) |
| `singleLineTextSchema(max)` | Builds a short text schema (added by CONTRACT-001-B): 1–`max` characters, no leading or trailing whitespace, no control characters such as line breaks. Nothing is trimmed; unclean text fails |

The error body has no envelope of its own in these contracts; how the future HTTP adapter wraps it is decided with that adapter. Transport failures (offline, timeout, aborted request, schema mismatch) have no `ApiErrorCode`; mobile models them separately.

## Locations and users (CONTRACT-001-B)

Implemented in `packages/contracts/src/{location,users}.ts` and covered by `pnpm test:contracts`. Who may see each shape follows the [privacy model](#privacy-model) below.

| Schema | Visibility | Rule |
| --- | --- | --- |
| `CoordinatesSchema` | Depends on the carrying schema | `{ latitude, longitude }` in WGS 84 degrees: latitude −90 to 90, longitude −180 to 180, finite numbers only |
| `ExactLocationInputSchema` | Private creation input | Union on `source`. `device`: `coordinates`, `accuracyMeters` (0–100) and `capturedAt`, nothing else (no altitude, speed or heading). `manual`: `coordinates` only, for a point the user picked on the map and confirmed |
| `OwnerLocationSchema` | Owner only | `coordinates` and `source`; the fix's accuracy and capture time are not echoed back |
| `PublicLocationSchema` | Anyone, including anonymous | `center`, `radiusMeters` (whole number, 200–5,000) and `label` (1–80 characters or `null`). Strict, so exact coordinates, accuracy, capture time, source or user fields fail |
| `MeetingPointSchema` | Current group members | `id`, `coordinates` of a shared place, `label` (1–80 characters), `walkingMinutes` (whole number 0–60 or `null`). Member and viewer locations fail |
| `UserSchema` | Anyone | `id`, `displayName` (1–40 characters, one line, no surrounding whitespace) and `avatarUrl` (`https` on a domain name, at most 2,048 characters, no user info, or `null`). Phone, token, session and location fields fail |
| `CurrentUserSchema` | The signed-in user | `user`, plus `rideRequestId` (current or latest own request) and `groupId` (live group), each an ID or `null`. No phone or credentials, even here |

**Location policy (mock defaults, `LOCATION_POLICY`).** Reviewed values for the mock MVP, not production policy. Revisit them after device checks and before a backend exists.

| Value | Default | Applied by |
| --- | --- | --- |
| Worst usable device-fix accuracy | 100 m | The schema. A worse or unknown accuracy, including approximate location permission (about 1–3 km), cannot be a pickup point; the user picks a point on the map instead |
| Oldest usable device fix | 60 s on the source clock | `isLocationFixFresh(fix, now)`. The source answers an old fix with `LOCATION_STALE`; the app checks first and gets a fresh fix |
| Fix time ahead of the source clock | Up to 10 s | `isLocationFixFresh`, to absorb error in the client's clock-offset estimate |
| Public uncertainty radius | 200–5,000 m | The schema. A smaller radius would claim a precise point |
| Walking estimate to a meeting point | 0–60 min | The schema |

`capturedAt` is on the source's clock: the client shifts the device's fix time by the clock offset it observes from `meta.serverTime`. This keeps freshness meaningful when the device clock is off, and when the development time controls move the mock clock. Manual points do not age, because the confirmation states where the user will be. Browsing defaults in [product](../PRODUCT.md#location-lifecycle) (a cached fix up to two minutes old, refresh after about 100 m) are mobile behavior and are not contract values.

## Privacy model

| Data | Allowed use |
| --- | --- |
| Exact rider origin | Sensitive authenticated creation input and strictly authorized owner data |
| Public origin | Approximate discovery marker only |
| Private exact destination | Owner-only input/data; never a stranger's public coordinate |
| Public destination | Approximate area or deliberately public venue label/location |
| Meeting point | Shared landmark/place, accessible to authorized group members |
| Phone/token/session | Authentication boundary only; never public profiles/events |
| Chat/history | Authorized group members with lifecycle/retention checks |

Use explicit public serializers and strict public schemas; do not expose full internal objects and rely on UI hiding fields. A schema can enforce field shape but cannot prove location obfuscation is safe. Future backend logic is responsible for obfuscation; mocks use sanitized fixtures and verify private fields are absent.

Group previews expose capacity/status/public destination and public origin, not members' private locations, meeting points, or chat. Authenticated filtering excludes blocked pairings. Discovery events must enforce the same projection/filtering as discovery reads.

Do not log exact inputs, phone numbers, OTPs, session tokens, messages, report text, push tokens, or links carrying trip coordinates. Notifications contain resource IDs and generic text, not private chat content or exact locations.

## Idempotency and concurrency

- Caller creates a stable operation ID for one user intent; retries reuse it.
- The future HTTP adapter carries it as `Idempotency-Key`. Where a DTO also carries that ID, both values must agree.
- Scope receipts to authenticated actor, operation, and key. Same key and input return the same canonical result; changed input returns `IDEMPOTENCY_CONFLICT`.
- Proposed receipt retention: at least 24 hours for mutation retries; simulator retention lasts until reset. Validate this production policy during handoff.
- Join checks request state, expiry, target membership, block relationships, and capacity in one atomic operation.
- Coordinator lifecycle changes use expected resource versions; stale commands return `VERSION_CONFLICT`.
- No optimistic seat reservation or membership success before authoritative confirmation.
- A timeout may follow a committed mutation. Reconcile via a read or repeat the same key rather than issuing a fresh action.
- Safe reads can retry with bounded backoff. Do not blindly retry terminal validation/authorization/conflict errors.
- Offline mutations fail visibly and are not automatically queued for later submission.

## Errors

Server responses use stable error codes; mobile must not branch on human-readable message text. Field errors reference fields without echoing sensitive submitted values. `requestId` is safe diagnostic context. Rate limiting may include `retryAfterSeconds` and the HTTP retry header.

| HTTP status | Representative codes |
| --- | --- |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED`, `REFRESH_TOKEN_INVALID` |
| 403 | `FORBIDDEN`, `MEMBERSHIP_REQUIRED` |
| 404 | `NOT_FOUND`, `TARGET_UNAVAILABLE` where existence should not be disclosed |
| 409 | `ACTIVE_REQUEST_EXISTS`, `ALREADY_IN_GROUP`, `GROUP_FULL`, `GROUP_CLOSED`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `USE_LEAVE_GROUP`, `BLOCKED_RELATIONSHIP` |
| 410 | `RIDE_EXPIRED`, `HISTORY_EXPIRED` when authorized to know the resource |
| 422 | `VALIDATION_FAILED`, `LOCATION_STALE`, `INVALID_DEPARTURE`, `INVALID_TRANSITION` |
| 429 | `RATE_LIMITED`, `OTP_ATTEMPTS_EXCEEDED`, `OTP_RESEND_THROTTLED` |
| 503 | `SERVICE_UNAVAILABLE` |

OTP-specific code failures are specified in [authentication](authentication.md). A transport outage, timeout, aborted request, or schema mismatch is a mobile transport/contract error, not a fabricated server error response. Normalize both families into a small mobile error model with clear retry behavior.

## Backend handoff readiness

Required artifacts before creating the future backend package:

| Artifact | Required content |
| --- | --- |
| Stable shared contracts | Validated inputs, outputs, enums, errors, events, notifications |
| Endpoint specification | Methods, paths, auth/permissions, bodies/queries, response/error behavior |
| Lifecycle specification | Request expiry, atomic group formation, readiness/closure, chat access |
| Concurrency specification | Capacity, atomicity, versions, idempotency, unknown outcomes |
| Authentication expectations | OTP lifecycle, refresh rotation, logout, protected actions |
| Privacy rules | Exact/public/shared-place boundaries and field-level projections |
| Realtime specification | Audience authorization, ordering assumptions, deduplication, reconnect/resync |
| Executable mock scenarios | Normal/failure behaviors the backend must reproduce |
| Verification suite | Contract tests and feature behavior usable for adapter conformance |
| Operation inventory | Each data-source method mapped to an endpoint/event |
| Reviewed limitations | Decisions/gaps needing production validation |

HANDOFF-001 reconciles all artifacts against actual mobile usage. Later backend internals may differ from the mock implementation; observable contracts and invariants must agree. After backend conformance, a separate milestone implements HTTP/Socket.IO behind `AppDataSource` and verifies features with the same interface.

No automatic transition to backend work is authorized by completing documentation or the mobile MVP.
