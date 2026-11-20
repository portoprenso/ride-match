# Backend start package

Updated: 2026-11-20. BE-002 completed locally, Codex / be-002-auth-places; BACKEND-PREP-001 retained as the reviewed baseline.

## Decision and readiness

The user explicitly reprioritized backend preparation before completion of frontend QA. **The existing mobile contracts and data-source boundary are sufficient to start the backend foundation.** Frontend completeness, the remaining VERIFY-005 cases, the typography backlog and the full QA-001 audit are not prerequisites for that first slice. They remain unfinished; they are not waived or reported as passing.

**BE-001 and BE-002 are implemented and verified locally:** foundation/health plus the five auth operations and place search, persisted in PostgreSQL, with the first mobile HTTP adapter. The remaining 19 REST operations and realtime are explicitly unavailable in API mode; there is no fallback to mocks. Default mobile configuration remains mock. This is not production-ready: development OTP accepts only synthetic numbers and is forbidden in production; real SMS/provider deployment is unconfigured. Original HANDOFF-001 remains the final reconciliation/audit; frontend QA no longer gates assigned backend slices. No external deployment/accounts were provisioned.

## Source of truth reviewed

- `apps/mobile/src/data/AppDataSource.ts`: **25 REST operations in seven namespaces**, plus two event-facade operations; eight namespaces total.
- `apps/mobile/src/data/mock/createMockDataSource.ts`: adapters exist for all operations. Mock domain modules demonstrate rules, not production persistence, clocks, algorithms or authentication.
- `packages/contracts/src/`: strict inputs/results, errors, seven domain events, three subscription scopes and four notification kinds.
- [API conventions](api/overview.md), [auth](api/authentication.md), [rides](api/rides.md), [groups/chat/safety](api/groups.md), [realtime/push](api/realtime.md).
- [Verification report](VERIFY_005_REPORT.md): evidence and remaining frontend work, distinct from backend-start requirements.

Use the existing schemas at server request/response boundaries. Keep database entities, persistence, policies and services inside `apps/api`; do not import mobile/mock modules into the backend or turn the contracts package into a shared service layer. Freeze only the interface needed by each implemented slice; review contract changes explicitly as the product evolves.

## Operation inventory

Paths below are relative to `/v1`. Types are exported by `@ride-match/contracts`; input types have their corresponding `*Schema` definitions. Results are unwrapped `data`; common response/error conventions are below. Domain errors and their precedence remain in the linked API specifications.

| Data-source operation | Method/path | Input besides path | Result | Access |
| --- | --- | --- | --- | --- |
| `auth.requestOtp` | POST `/auth/otp/challenges` | `CreateOtpChallengeInput` | `OtpChallengeDto` | Public, throttled |
| `auth.verifyOtp` | POST `/auth/otp/verify` | `VerifyOtpInput` | `AuthSessionDto` | Public, challenge/attempt limits |
| `auth.refreshSession` | POST `/auth/refresh` | `RefreshSessionInput` | `SessionCredentialsDto` | Refresh credential |
| `auth.logout` | POST `/auth/logout` | `LogoutInput` | 204 | Refresh credential; repeat succeeds |
| `auth.getCurrentUser` | GET `/me` | — | `CurrentUserDto` | Authenticated |
| `places.search` | GET `/places/search` | `SearchPlacesInput` | `PlaceSearchResultsDto` (array) | Public |
| `rides.getNearby` | GET `/rides/nearby` | `NearbyQueryInput` | `NearbySnapshotDto` | Public; authenticated filtering |
| `rides.getRide` | GET `/rides/{rideId}` | — | `RideRequestDto` | Public active projection |
| `rides.getOwnRequest` | GET `/me/ride-request` | — | `OwnRideRequestDto` or null | Owner |
| `rides.create` | POST `/rides` | `CreateRideRequestInput` | `OwnRideRequestDto` | Authenticated |
| `rides.cancel` | POST `/rides/{rideId}/cancel` | `CancelRideRequestInput` | `OwnRideRequestDto` | Owner |
| `rides.getMatches` | GET `/rides/{rideId}/matches` | — | `RideMatchSetDto` | Owner |
| `groups.join` | POST `/groups/join` | `JoinGroupInput` | `JoinGroupResultDto` | Own active request |
| `groups.getPreview` | GET `/groups/{groupId}/preview` | — | `GroupPreviewDto` | Public live projection |
| `groups.getGroup` | GET `/groups/{groupId}` | — | `RideGroupDto` | Member / authorized at closure |
| `groups.leave` | DELETE `/groups/{groupId}/members/me` | `LeaveGroupInput` | `LeaveGroupResultDto` | Member |
| `groups.updateStatus` | PATCH `/groups/{groupId}/status` | `UpdateGroupStatusInput` | `RideGroupDto` | Coordinator |
| `chat.getHistory` | GET `/groups/{groupId}/messages` | `ChatHistoryQueryInput` | `ChatMessagePageDto` | Member / authorized at closure |
| `chat.send` | POST `/groups/{groupId}/messages` | `SendChatMessageInput` | `ChatMessageDto` | Member, live group; see retry rules |
| `safety.report` | POST `/reports` | `ReportUserInput` | `ReportReceiptDto` | Authenticated + context access |
| `safety.block` | PUT `/me/blocks/{userId}` | `BlockUserInput` | `BlockUserResultDto` | Authenticated |
| `safety.unblock` | DELETE `/me/blocks/{userId}` | — | 204 | Authenticated, repeat succeeds |
| `safety.listBlocks` | GET `/me/blocks` | `BlockListQueryInput` | `BlockListPageDto` | Owner |
| `devices.register` | PUT `/me/push-devices/{installationId}` | `RegisterPushDeviceInput` | `PushDeviceReceiptDto` | Authenticated installation association |
| `devices.remove` | DELETE `/me/push-devices/{installationId}` | — | 204 | Own association, repeat succeeds |

`PATCH /me` was an unsupported speculative row: no update-profile contract, data-source method or consuming feature exists. It is excluded from the initial backend scope; profile editing can be introduced later with its own reviewed contract. Place search really returns an array; it does not need a new results wrapper. Meeting points come from `groups.getGroup`; taxi opening is a local native boundary. Neither needs an invented endpoint.

| Event facade | Backend responsibility |
| --- | --- |
| `events.subscribe` | Socket.IO subscribe acknowledgement with `SubscriptionAckDto`; `nearby` takes coarse viewport, `user` derives actor from credentials, `group` checks readable membership. Unsubscribe uses `UnsubscribeInput`; subscriptions end on disconnect. |
| `events.watchConnection` | Adapter-local immediate/current connection callback and subsequent transitions. Not a REST endpoint. Reconnect creates new subscriptions and rereads snapshots. |

Seven events: `nearby.upserted`, `nearby.removed`, `ride.changed`, `matches.changed`, `group.changed`, `chat.message.created`, `access.revoked`. Preserve resource versions, message sequences, audience checks, tombstones and subscribe-before-snapshot recovery. Never trust a client-provided room name or user ID. Recheck private delivery after leave, block, session expiry/logout and history expiry. Socket event names/ack envelope and refresh/reconnect mechanics must be fixed together with the mobile adapter in BE-005; they do not block BE-001.

## HTTP decisions for the first implementation

- Base path `/v1`; JSON body/response. Non-204 success uses `{ data, meta: { serverTime } }`; use 200 for the inventoried operations initially. Health/readiness routes are operational routes, not new mobile contracts.
- Non-2xx domain error body is the **raw `ApiErrorDto`**, not `{ error: ... }` or the success envelope. Preserve the existing HTTP/code table; unknown internal failures become safe `SERVICE_UNAVAILABLE` with HTTP 503, with diagnostics kept server-side. Parse/schema errors use `VALIDATION_FAILED` (422). Unsupported routes and non-domain transport failures remain separate concerns.
- Access credentials travel in `Authorization: Bearer …`; refresh/logout receive only their existing refresh-token body. Optional-auth requests without a token may browse; an explicitly supplied invalid/expired token fails authentication rather than silently falling back to anonymous. This behavior needs adapter handling when BE-002 is connected.
- Operation-ID mutations send `Idempotency-Key` matching body `operationId`; chat uses matching `clientMessageId`. Reject absent/mismatched keys as `VALIDATION_FAILED`. Registration/removal/unblock are naturally idempotent and do not invent an operation ID. Auth challenge/verify/refresh are not blindly auto-retried.
- Receipt lookup is **actor + operation ID**, matching the actual mock. Operation name, path target and canonical validated input belong to the fingerprint; reusing an actor's key for another operation/input conflicts. Serialize concurrent claims and persist successful result + domain changes atomically. A process restart must not lose receipts. Proposed initial receipt lifetime: 24 h, subject to sensitive-result access/retention below.
- Reads accept cancellation in the mobile adapter; mutation cancellation never implies rollback. After an unknown result reconcile via read or retry the same key. No automatic offline mutation queue.
- GET encoding: explicit dotted query keys for nested DTO fields. Place search uses `query`, `area.center.latitude`, `area.center.longitude`, `area.radiusMeters`, `limit`; nearby uses `viewport.southWest.latitude`, `viewport.southWest.longitude`, `viewport.northEast.latitude`, `viewport.northEast.longitude`, optional `destinationPlaceId`, `departureOffsetMinutes`, and `limit`. Chat uses `beforeCursor` or `afterSequence`, plus `limit`; blocks use `cursor` and `limit`. Omit absent optionals. Reject duplicate/unknown keys; reconstruct whitelisted fields and parse finite numbers before Zod validation, without generic deep-object query parsing. Do not send JSON bodies on GET.
- DELETE member-leave retains the documented JSON `LeaveGroupInput` plus its matching header. Do not silently discard this body in server/proxy/client plumbing. The other DELETE operations above have no body.
- Mobile HTTP implementation must observe `meta.serverTime`, estimate offset using request/response timing and translate device-fix capture times to server time. The Demo UI-clock fix is not that HTTP clock synchronization. Leave device location aging on device time.

## Backend shape and persistence

Implemented BE-001 server configuration: `API_APP_ENV`, `API_PORT`, `DATABASE_URL`, `API_ALLOWED_ORIGINS`, `API_LOG_LEVEL`, required and validated on startup. `apps/api/.env.example` contains synthetic local values; `.env.local` is ignored. The database URL remains server-only and is never logged. [Development setup](DEVELOPMENT.md#local-backend-be-001) records accepted values and Compose-only settings. BE-002 additionally requires `API_AUTH_SECRET` (server-only HMAC key, at least 32 characters) and `API_SMS_PROVIDER` (`development` or `disabled`). The former must stay stable across restarts; changing it invalidates identity/token digests. Production rejects the development provider; no real SMS/push secrets are provisioned.

Implemented **NestJS/TypeScript modular monolith foundation**: NestJS 12.5.1, Express 5.3.0, TypeScript 6.0.3, `pg` 8.23.1, Zod 4.6.7, PostgreSQL 18.1 Compose image. Exact manifests/lockfile follow existing Node 24.17.0 / pnpm 11.28.2 conventions. ESM/NodeNext and `tsc` preserve decorator metadata without a CLI/transpiler layer. Direct `pg` plus a small transactional SQL runner avoids an ORM before domain models exist; journal checksums and advisory lock protect retries/concurrent runs. Keep controllers thin and domain rules in services/operations with injected clock and persistence boundaries. One deployable backend initially; Redis, microservices, extra providers and a routing engine are not prerequisites for the foundation.

| Internal storage concept | Required invariant |
| --- | --- |
| Users, private auth identities, OTP challenges, sessions | Public profiles separate from phone identity; store token/code verifiers, never plaintext credentials. Consume challenges/refresh credentials atomically; enforce attempts/resend limits; handle parallel refresh and session revocation. |
| Curated places + coverage | Stable place IDs independent of seed runs; no mobile fixture imports. Initial server-owned development dataset can be synthetic. A real place catalogue/provider is a later decision. |
| Requests + per-user live state | At most one live active/grouped request and one live group per user; deadline checks plus constraints/transactions. Preserve latest terminal own request for recovery. Store exact origin separately from public projection. |
| Groups + membership history + meeting points | Capacity four; canonical group for competing joins to one ride; coordinator always a member. Retain join order and who was entitled at closure; a past leaver cannot regain history. |
| Messages + group-local counter | Unique `(groupId, senderId, clientMessageId)` and `(groupId, sequence)`. Allocate the next sequence inside the committed message transaction, not a database sequence which can leave rollback gaps. No copied message text in logs. |
| Blocks + reports | Unique directed block pair; block-and-leave atomic against concurrent join. Store only authorized report context; acceptance receipt is not moderation. Unblock never restores membership. |
| Push registrations | Unique installation and token ownership; associate registering session, update/take over safely. An old session logout must not delete a new user's reassigned installation. |
| Idempotency receipts + transactional outbox | Durable retries; mutation, receipt and event intent committed together. Publish committed events only. Delivery can repeat; consumer IDs/versions deduplicate. Private payload/receipt storage must obey access and purge policy. |

Use real database transactions, uniqueness constraints and a documented consistent locking/serialization strategy for joins, leaves, blocks and expiry. Mock single-process execution is not proof of database race safety. Background expiry workers improve timeliness; every authoritative read/mutation must also enforce deadlines after worker delays/restarts. The same user action cannot create extra seats or duplicate side effects after a retry.

## Domain baseline and decisions assigned to slices

Carry current observable defaults into local backend development: request lifetime 15 min, departures 0/5/10 min, group capacity four/lifetime 30 min, ready requires at least two members and a meeting point, history read-only for one hour after closure, immediate access loss on leave. These remain development product defaults, not approved production/legal retention policies. Fourth member means full, not automatically ready. Opening Yandex Go never completes a group.

| Decision / gap | Resolve in | Effect on starting |
| --- | --- | --- |
| PostgreSQL driver/ORM, migration tooling, exact pins, local DB configuration | BE-001 — resolved | Direct `pg`, checked SQL runner, pinned local Compose; see DEVELOPMENT |
| SMS provider/credentials, OTP abuse limits and refresh-reuse policy | BE-002 — local policy resolved | Synthetic-only development provider, production disabled; durable attempt/cooldown/phone+peer limits; rotated-token replay revokes its family. Real SMS/provisioning remains required before external users. |
| Public-origin obfuscation | BE-003 | Mock fixtures are already sanitized and `PublicLocationSchema` does not obfuscate arbitrary coordinates. Define server projection + privacy properties before exposing real locations. A coarse grid/radius is a candidate, not a proven anonymity guarantee. |
| Matching/coverage/meeting-point policy | BE-003 | Existing matches are scripted, not an algorithm. Specify one initial server policy using current DTOs; do not claim route overlap/detour from straight-line distance. If road data is absent, return unknown additional/walking minutes as null where allowed. No full routing product is needed to start BE-001/002. |
| Replay of stored group/private results after leave/retention | BE-003/004 | Mock generic receipts can return their original result before current membership checks. Do not copy that as blanket production authorization. Define authorized replay/error precedence before group endpoints; stable keys must not extend private-data access. Record any intentional divergence and update conformance expectations. |
| Physical deletion and private outbox/receipt retention | BE-004 | One-hour history access is not a complete storage-retention policy. Prevent receipts/queued events from bypassing history expiry; align purge of message-bearing records. Decide report/auth retention before production. |
| Real push project/credentials and token lifecycle | BE-005 | Existing client registers synthetic demo tokens only. Add real token acquisition and provider configuration with the adapter; no background JS timer substitute for remote push. |
| Health checks, deployment/secrets, backup/restore, production policy | BE-006 | Before external rollout; no deployment/account spending authorized by preparation |

These are implementation decisions for their slices, not a demand to finish every future policy before writing the backend foundation. Frontend spacing, marker cosmetics, native test variants and the full A–N demo suite remain a separate backlog.

## Bounded implementation order

BE-001 and BE-002 are **Completed** for local scope; BE-003–006 remain **Planned**. Completion does not authorize starting the next slice. API mode must never fall back per-operation to mocks: unfinished API operations fail explicitly, while the separately selected mock mode remains usable.

| Task | Scope | Exit check |
| --- | --- | --- |
| **BE-001 — Foundation (Completed)** | Create `apps/api` workspace package, Nest bootstrap/config, safe request IDs/errors, Zod boundary support, local PostgreSQL/migrations and liveness/readiness. Pin actual dependencies and document real commands/env names. No application-wide endpoint stubs returning fake success. | Package builds/typechecks; health works, readiness reflects DB availability; migration runs from an empty local DB and repeats safely. Only targeted checks; stop the server/DB started for verification. |
| **BE-002 — Auth + place search (Completed locally)** | OTP/session/logout/me plus curated places, private identity/session persistence, rate limits; first real mobile HTTP adapter behind the existing boundary. Unsupported operations fail explicitly; mock remains available for unfinished features. | Real DB-backed sign-in → me → places; refresh/logout behavior and public projections. No full UI audit. |
| BE-003 — Rides + discovery + groups + meeting points | Define the listed policies, then requests, matching, transactional membership/lifecycle and expiry. Wire those adapter namespaces. | Two-client last-seat/solo-target race, stable-key lost-response retry, restart-safe expiry and public/private projections. |
| BE-004 — Chat + safety | Ordered persisted chat, paged catch-up, access/retention, report/block/unblock and atomic block-and-leave. | Retry stores one message, no sequence gaps, leave/block race denies private access, retention enforced even on retries. |
| BE-005 — Realtime + devices + push | Authorized Socket.IO scopes/acks, outbox delivery, connection/refresh resync and real push boundary; complete adapter composition. | Reconnect/catch-up, duplicate/out-of-order handling, revoked delivery, installation/account reassignment and generic notifications. |
| BE-006 — Integration and operational readiness | One representative multi-user journey, remaining important failures, deployment configuration and documented production limits. Revisit frontend QA where real behavior requires it. | Focused backend/integration checks plus bounded cross-platform smoke, not repeated full native audits per endpoint. |

**Next suggested action: BE-003**, only when assigned. No additional frontend QA pass or A–N fixture completion gates it. No business endpoint stubs, auth, matching, chat, Socket.IO or push were added in BE-001.

## Preparation checks

Reviewed operation signatures, mock wiring, schema exports, lifecycle/event specifications and actual manifests. A static inventory check reconciles all 25 REST methods, the two event methods and their contract types; local documentation links/status references are checked. No mobile tests, native apps, Metro, database or backend server were started; no latest dependency/version or production-service claim is made. Existing 656 mobile / 860 contract passes remain historical evidence, not new backend verification.

## BE-001 implementation evidence

- `apps/api/src/config`, `database`, `http`, `health`: required config, lazy/drained pool, safe raw errors, fresh server request IDs, explicit reusable Zod pipe and success envelope. `/v1/health/live` and `/v1/health/ready` are the only production routes; readiness queries DB on every call. It checks connectivity, not schema readiness.
- SQL files and `schema_migrations` commit atomically under transaction advisory lock; migration 0001 creates only schema `ride_match`. New numbered files are required for changes; no automatic reset/down migration. Explicit root build/dev/start/DB/test scripts exist and workspace typecheck/lint/test include API.
- Build/typecheck/lint pass; 10 foundation tests and one real PostgreSQL test pass. Fresh migration: 1; repeat: 0. Concurrent runs, rollback, restart journal and changed/deleted history tested. Live/ready during available → stopped → restored DB: 200/200 → 200/503 → 200/200. Start/dev commands and offline frozen install verified. All owned runtime processes/container/network and Docker Desktop stopped; local volume retained.
- Commands, configuration, shutdown and limitations: [DEVELOPMENT](DEVELOPMENT.md#local-backend-be-001). No mobile/contract source edits, mobile/native suites, Git commands or external services. BE-002–006 policies remain assigned to those slices; health alone does not indicate production readiness.

## BE-002 local implementation and deliberate policies

- Production routes now include the five inventoried auth operations and `GET /places/search`, with the existing schemas/envelopes/statuses. No ride/group/chat/safety/device stubs. `/me` reads the persisted user; request/group references are null because those entities do not exist yet.
- Migration 0002 adds separate public users, private keyed-phone identities/challenges, sessions, hashed credentials, persistent rate windows, public places and coverage. It seeds three clearly synthetic, stable-ID landmarks in a server-owned Bishkek-area catalogue. No fixture/module imports from mobile. Identity/OTP/session data is never returned by public serializers.
- OTP lifetime 5 min, resend 30 s, five failed attempts; malformed inputs do not increment the challenge counter. Phone identity locks serialize request/replace/verify; failed attempts commit before the safe refusal. Delivery occurs outside DB locks; challenges are unusable until confirmed. Local provider accepts only `+447700900000`–`+447700900999` with synthetic code `123456`, sends no SMS, and cannot run in production. Disabled delivery fails 503. No real-phone collection or provider account was introduced.
- Tokens have 256 bits of randomness; only domain-separated HMAC-SHA256 verifiers are stored. Access lifetime 15 min, refresh 30 days, renewed per rotation. Session locks plus a fresh credential read after waiting prevent double refresh. **Unexpired rotated-token replay revokes the entire session family**, including a concurrent winner; clients share one refresh and never retry unknown refresh outcomes automatically. A known old refresh also logs out its family (intentional stricter behavior than the mock's rotated-token logout). Already revoked/unknown logout remains 204. These policies use unchanged contract shapes/codes.
- DB limits: 60 attempts/minute per handler/TCP peer, five OTP requests/hour per phone, plus per-challenge controls. Keys are HMAC digests, not stored IPs/phones; no forwarded-header trust. Responses set `Cache-Control: no-store`, rate failures also set `Retry-After`. Invalid explicit optional auth never becomes anonymous.
- Mobile `src/data/api` implements auth/places with schema validation, dotted GET encoding, cancellation/timeout, raw errors and midpoint server-time estimation. `EXPO_PUBLIC_API_BASE_URL` is required in API mode (HTTPS in production; no userinfo/query/fragment). The existing session/SecureStore namespace restores/rotates credentials. Optional-auth places also use shared session renewal. Unimplemented operations/subscriptions reject locally. HTTP reachability does not claim realtime; API queries attempt directly instead of waiting for a nonexistent socket. API mode never creates synthetic push registrations or demo controls.
- Evidence: backend build/typecheck/lint, 11 unit/HTTP tests and 14 PostgreSQL integration tests pass, including the actual mobile adapter + session against the server (sign-in → me → places → concurrent expiry/one refresh → place-only renewal → restore → logout). Fresh migrations apply two files, BE-001 local upgrade applies one, repeat zero; failure/history/concurrency/restart cases pass. Focused mobile tests/typecheck/lint recorded in WORK_LOG. No native/Metro/full-mobile suite, external rollout or Git operations.
- Limits: real SMS/provider configuration, production abuse/retention/purge/key rotation and trusted proxy/TLS are not supplied. Catalogue coverage uses its center and straight-line landmark distance; it is not road matching/routing. Clock samples are available in the transport but exact-location timestamp translation belongs to BE-003. Details/start/stop: [DEVELOPMENT](DEVELOPMENT.md#local-auth-and-places-be-002).
