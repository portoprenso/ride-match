# Future API: authentication and users

Status: planned; all MVP authentication is simulated. Last updated: 2026-10-03.

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

The exact OTP lifetime, resend interval, and attempt limit remain implementation/handoff configuration choices. CONTRACT-001/AUTH-001 must record their selected mock values and test them; production policy is not implied by a static demo code.

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
- Private `CurrentUserDto`: user plus references to the current request/group so the app can restore navigation.
- Phone numbers, tokens, OTP details, and exact location never appear in public profiles.
- A lightweight first-session display name may be assigned in the mock; profile completion must not unexpectedly block the specified main flow.

## Verification

Verify anonymous browsing, auth cancellation, preserved drafts, invalid/expired codes, resend throttling, one concurrent refresh, failed-refresh cleanup, logout, and stale target revalidation. Test public schemas independently of mock internal state.
