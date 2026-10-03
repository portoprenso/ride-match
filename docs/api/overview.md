# Future API: conventions, boundaries, and handoff

Status: proposed specification, not an implemented API. Last updated: 2026-10-03.

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

Schemas live in the future `packages/contracts`, organized as described in [architecture](../ARCHITECTURE.md). Use one Zod definition per shape and infer its TypeScript type. Distinguish input, public, owner, and member schemas.

| Contract | Essential fields / constraints |
| --- | --- |
| `CoordinatesDto` | Latitude/longitude with valid ranges; no implied access permission |
| `ExactLocationInput` | Coordinates, accuracy, captured time; sensitive input |
| `PublicLocationDto` | Approximate area center, uncertainty radius, optional area label |
| `UserDto` | ID, display name, optional avatar URL; never phone/session fields |
| `CurrentUserDto` | User and current request/group references |
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
| `MeetingPointDto` | ID, shared place coordinates, label, optional viewer-specific walking estimate |
| `ChatMessageDto` | ID, group ID, sender, text, createdAt, group-local sequence, client message ID |
| `ReportUserInput` | Target, reason, optional bounded details, optional relevant group/message reference |
| `BlockUserInput` | Target user ID |
| `NotificationPayloadDto` | Payload version, notification ID, kind, resource IDs, issuedAt/expiresAt |
| `DomainEventDto` | Event ID, schema version, type, occurredAt, resource version and payload |
| `ApiErrorDto` | Code, safe message, request ID, optional field errors/retry delay |

Keep enums/status schemas near their domain. Do not export React types, query keys, marker colors, database models, Prisma/PostGIS types, service implementations, or backend-only algorithms.

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
