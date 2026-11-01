# Future API: authentication and users

Status: planned API; all MVP authentication is simulated, and the mock operations exist ([AUTH-001-A](#implemented-mock-auth-001-a)). Last updated: 2026-11-01.

Paths are relative to `/v1`; response conventions and common failures are in [overview](overview.md).

## Endpoints

| Method/path | Authentication | Request | Response data | Important errors |
| --- | --- | --- | --- | --- |
| `POST /auth/otp/challenges` | Public | E.164 phone number | `OtpChallengeDto` | Invalid phone, `OTP_RESEND_THROTTLED`, `RATE_LIMITED` |
| `POST /auth/otp/verify` | Public | Challenge ID, code | `AuthSessionDto` | `OTP_INVALID`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED` |
| `POST /auth/refresh` | Refresh credential | Refresh token | Rotated session credentials | `REFRESH_TOKEN_INVALID` |
| `POST /auth/logout` | Session credential | Refresh token | `204` | Already-revoked credential is idempotent |
| `GET /me` | User | None | `CurrentUserDto` | `UNAUTHENTICATED`, `SESSION_EXPIRED` |
| `PATCH /me` | User | Display name | `UserDto` | `VALIDATION_FAILED` |

## OTP semantics

- Challenge includes ID, expiry, and earliest resend time. UI uses those values rather than hardcoded authority.
- A resend creates/replaces the applicable challenge according to server policy; a consumed or superseded code cannot establish a second session accidentally.
- Bound verification attempts and expose retry/resend behavior through stable errors.
- Phone normalization belongs to the auth input boundary, not public user DTOs.
- Successful verification returns the user and credentials. No role/identity can be supplied by the client.
- In mocks, use a documented synthetic number/code and deterministic challenge state. Show clearly that no SMS is sent. Do not solicit or persist real personal data merely to demonstrate the flow.

CONTRACT-001-C recorded the mock OTP lifetime, resend interval and attempt limit (see [implemented contracts](#implemented-contracts-contract-001-c)); AUTH-001-A applies and tests them. Production policy is not implied by these values or by a static demo code.

## Implemented contracts (CONTRACT-001-C)

Implemented in `packages/contracts/src/auth.ts` and covered by `pnpm test:contracts`. All of them are private to the authentication boundary; none is a public or member shape.

| Schema | Rule |
| --- | --- |
| `PhoneNumberSchema` | E.164: `+`, a country code not starting with 0, 7–15 digits in total, no spaces or punctuation. The app normalizes typed input first. Never echoed by any response |
| `OtpCodeSchema` | Exactly six ASCII digits, as a string |
| `SessionTokenSchema` | Opaque, 16–4,096 bearer-token characters (RFC 6750: letters, digits, `-._~+/`, then optional `=` padding) |
| `CreateOtpChallengeInputSchema` | `{ phoneNumber }`. Also the resend request: a new challenge replaces the number's current one, whose code stops working |
| `OtpChallengeSchema` | `{ id, expiresAt, resendAvailableAt }`, with `resendAvailableAt` no later than `expiresAt`. Never contains the code or the phone number |
| `VerifyOtpInputSchema` | `{ challengeId, code }` |
| `SessionCredentialsSchema` | `accessToken`, `accessTokenExpiresAt`, `refreshToken`, `refreshTokenExpiresAt`; the access token never outlives the refresh token. The refresh response |
| `AuthSessionSchema` | `user` (public `UserDto`) plus the same credential fields and rule. The verification response; no phone number |
| `RefreshSessionInputSchema`, `LogoutInputSchema` | `{ refreshToken }` only |

Error semantics the mock (AUTH-001-A) implements:

| Situation | Result |
| --- | --- |
| New challenge before the current one's `resendAvailableAt` | `OTP_RESEND_THROTTLED` (429) with `retryAfterSeconds` |
| Wrong code | `OTP_INVALID` (422) |
| Fifth wrong code for one challenge, and every attempt after it, even with the right code | `OTP_ATTEMPTS_EXCEEDED` (429); request a new challenge |
| Expired, already used, replaced or unknown challenge | `OTP_EXPIRED` (410); request a new challenge |
| Malformed code or phone number | `VALIDATION_FAILED` (422) with a field error; a malformed code is not counted as an attempt |
| Unknown, expired, revoked or already rotated refresh token | `REFRESH_TOKEN_INVALID` (401); the app clears the session |
| Logout with an already revoked token | `204`, as for a first logout |

**Mock policy (`AUTH_POLICY`).** Reviewed values for the mock MVP, not production policy. The schemas enforce the code length; the mock applies the rest and tests their boundaries in AUTH-001-A. Clients read the timestamps in each challenge and session rather than hardcoding these durations.

| Value | Default |
| --- | --- |
| Code length | 6 digits |
| Challenge lifetime | 300 s (5 minutes) |
| Resend interval | 30 s |
| Wrong codes per challenge | 5 |
| Access token lifetime | 900 s (15 minutes) |
| Refresh token lifetime | 30 days, renewed on each rotation |

The demo code itself is a mock fixture that AUTH-001-A documents; it is never part of a challenge response.

## Implemented mock (AUTH-001-A)

`apps/mobile/src/data/mock/auth.ts`, through the mock data source's `auth` namespace and covered by `tests/mockAuth.test.ts`. It applies `AUTH_POLICY` and the error table above on the simulated clock.

| Rule | Mock behavior |
| --- | --- |
| Demo numbers | Only Ofcom's range for fiction, `+447700900000` to `+447700900999` (+44 7700 900000–900999), so no real number is ever collected. Any other valid number fails with `VALIDATION_FAILED` and an `INVALID_VALUE` field error for `phoneNumber`; a malformed one with `INVALID_FORMAT`, a missing one with `REQUIRED`. No message repeats the number |
| Demo code | `123456` for every challenge (`DEMO_OTP_CODE`). No SMS is sent, and no response contains the code |
| Identity | Each demo number signs in as its own synthetic rider, created on its first sign-in and named "Demo rider" plus the number's last three digits, without an avatar. The same number gets the same rider until the scenario starts over |
| Challenges | Valid until just before `expiresAt`; a new one is refused until the previous one's `resendAvailableAt`, even if that one was used, with `retryAfterSeconds` rounded up. A new challenge replaces the number's previous one |
| Tokens | Opaque `demo-access.…` and `demo-refresh.…` strings from the scenario's seeded randomness, so the same steps give the same tokens. An access token lives 15 minutes (never past its refresh token), a refresh token 30 days from each rotation |
| Current user | `UNAUTHENTICATED` without a token, with an unknown one or after logout; `SESSION_EXPIRED` from the access token's deadline. A signed-in demo rider has no request or group yet (RIDE-001) |
| Refresh | Rotates both tokens; the refresh token sent stops working. Access tokens already issued keep working until they expire, as stateless tokens would |
| Logout | Revokes the whole session, so its access and refresh tokens stop working at once; repeating it, or sending a rotated or unknown token, still succeeds |
| Reset | The auth records live in the mock world, so restarting or switching the scenario (demo controls) signs everyone out |

The data source sends the access token it reads from an `AccessTokenSource` (`src/data/AppDataSource.ts`) when each call starts. The composition root does not pass one yet, so the app runs anonymous until the session controller (AUTH-001-B) supplies it. Every auth call goes through the simulator, so latency, queued failures and the connection apply: a request lost on the way leaves the challenge untouched.

## Session lifecycle

- Access token stays in memory; refresh credential uses the platform storage boundary backed by SecureStore.
- Refresh rotates credentials; the old refresh token cannot remain a parallel valid session credential indefinitely.
- Multiple operations encountering access expiry share one refresh attempt.
- A successful refresh retries a protected operation only where safe, preserving its operation ID.
- Failed refresh clears the session and private query data, stops private subscriptions, and resumes through the auth gate.
- Logout attempts session/device deregistration while credentials are available, then clears local credentials and private data. Offline cleanup failures must not trap the user in a signed-in local state or be silently reported as successful server revocation.
- A future backend must revoke device/session associations server-side as appropriate; the mock simulates that state change.
- Demo storage uses a separate namespace. Full scenario/cold reset clears demo credentials and state; future production persistence is separate.

## Protected-action continuation

Browsing the map, viewing public ride/group previews, and destination search are anonymous. Creating requests, joining groups, sending messages, and private mutations require authentication.

Keep a mobile-only pending action/draft, not an executable callback in a shared DTO. On sign-in return, revalidate the target and restore the final create/join confirmation. Restore unsent chat text without automatically sending it. Dismissing authentication returns to browsing.

Expired/removed targets must not become successful actions just because authentication succeeded. Authentication also does not substitute for ownership or group membership checks.

## User projections

- Public `UserDto`: opaque ID, display name, optional avatar URL.
- Implemented with `CurrentUserDto` by CONTRACT-001-B: display names have 1–40 characters on one line, avatars are `https` URLs or `null`, and both schemas reject phone, credential, session and location fields. Exact rules: [locations and users](overview.md#locations-and-users-contract-001-b).
- Private `CurrentUserDto`: user plus references to the current request/group so the app can restore navigation.
- Phone numbers, tokens, OTP details, and exact location never appear in public profiles.
- A lightweight first-session display name may be assigned in the mock; profile completion must not unexpectedly block the specified main flow.

## Verification

Verify anonymous browsing, auth cancellation, preserved drafts, invalid/expired codes, resend throttling, one concurrent refresh, failed-refresh cleanup, logout, and stale target revalidation. Test public schemas independently of mock internal state.
