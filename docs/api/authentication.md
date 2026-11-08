# Future API: authentication and users

Status: planned API; all MVP authentication is simulated. The mock operations ([AUTH-001-A](#implemented-mock-auth-001-a)), the app's session controller ([AUTH-001-B](#implemented-session-auth-001-b)) and the sign-in screens with the pending-intent gate ([AUTH-001-C](#implemented-sign-in-and-gate-auth-001-c)) exist. Last updated: 2026-11-07.

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

The data source sends the access token it reads from an `AccessTokenSource` (`src/data/AppDataSource.ts`) when each call starts; since AUTH-001-B the session controller supplies it. Every auth call goes through the simulator, so latency, queued failures and the connection apply: a request lost on the way leaves the challenge untouched.

## Session lifecycle

- Access token stays in memory; refresh credential uses the platform storage boundary backed by SecureStore.
- Refresh rotates credentials; the old refresh token cannot remain a parallel valid session credential indefinitely.
- Multiple operations encountering access expiry share one refresh attempt.
- A successful refresh retries a protected operation only where safe, preserving its operation ID.
- Failed refresh clears the session and private query data, stops private subscriptions, and resumes through the auth gate.
- Logout attempts session/device deregistration while credentials are available, then clears local credentials and private data. Offline cleanup failures must not trap the user in a signed-in local state or be silently reported as successful server revocation.
- A future backend must revoke device/session associations server-side as appropriate; the mock simulates that state change.
- Demo storage uses a separate namespace. Full scenario/cold reset clears demo credentials and state; future production persistence is separate.

## Implemented session (AUTH-001-B)

`apps/mobile/src/features/auth/createSessionController.ts` (with `AuthSessionProvider.tsx`) and `apps/mobile/src/platform/secureStorage/credentialStore.ts`, covered by `tests/authSession.test.tsx`. Its native check (rebuilt development clients) is pending. The sign-in screens (AUTH-001-C) and settings with the sign-out confirmation (AUTH-001-D) use it.

| Rule | Behavior |
| --- | --- |
| Credentials | The access token stays in memory and reaches the data source only through `getAccessToken`. The refresh token is kept in memory and in SecureStore under `ridematch.<namespace>.refreshToken` (`mock` now, `api` later), readable only while the device is unlocked and never restored to another device (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`; the config plugin excludes it from Android backups). Feature code never sees a token |
| States | `restoring` at launch; `restore-failed` when a stored session could not be renewed (source unreachable or `RATE_LIMITED`/`SERVICE_UNAVAILABLE`, or the store unreadable), retried by `restore()`; `signed-out` with reason `none`, `signed-out`, `expired` or `reset`; `signed-in` with the rider and `persisted` (`false` when the token could not be saved, so the session ends with the app) |
| Launch | Renews the stored session and reads the rider (`GET /me`). Any other source refusal ends it as `expired` and clears the key. On the mock source nothing is resumed: its world lives in memory, so the demo key is cleared at every launch (the cold reset the lifecycle rules ask for) |
| Sign-in | `signIn({ challengeId, code })` verifies, keeps the credentials and saves the refresh token; a refused code leaves the state unchanged. Refused while a rider is signed in. Requesting a code needs no session and stays a plain data-source call |
| Refresh | Single flight: callers that meet `SESSION_EXPIRED` at once share one `POST /auth/refresh`. `runAuthenticated(operation)` refreshes once and runs the operation again, for reads and for mutations whose closure keeps its operation ID. `REFRESH_TOKEN_INVALID` ends the session as `expired`; a network failure keeps it for the next attempt. Expiry is detected from the source's answer, not the device clock, because the source's clock can differ (the demo controls move it). Since RIDE-001-C the composition root wraps every signed-in data-source operation in `runAuthenticated` (`withSessionRenewal`), so features never handle an expired access token themselves |
| Sign-out | Waits for a refresh in flight, sends `POST /auth/logout` with the newest refresh token, then clears memory and storage. The rider is signed out locally whatever happens; the result `{ revoked, revokeError, storageCleared }` says what was not confirmed, so the app never reports an unconfirmed revocation as done. Push-device deregistration joins it in NOTIFICATION-001 |
| Ordering | Storage writes and removals run one at a time in call order, so a late save never brings back a token that signing out removed. A result that arrives after the session was replaced or ended (sign-out, a new sign-in, a demo reset) changes nothing |
| Demo reset | Starting or restarting a scenario from the demo controls signs everyone out of the simulator, so the composition root discards the app's session first (`reset`) |

Since SYNC-001-B, an identity change also clears the previous rider's cached private reads and subscriptions; since AUTH-001-C, an `expired` session opens the session-ended screen.

## Protected-action continuation

Browsing the map, viewing public ride/group previews, and destination search are anonymous. Creating requests, joining groups, sending messages, and private mutations require authentication.

Keep a mobile-only pending action/draft, not an executable callback in a shared DTO. On sign-in return, revalidate the target and restore the final create/join confirmation. Restore unsent chat text without automatically sending it. Dismissing authentication returns to browsing.

Expired/removed targets must not become successful actions just because authentication succeeded. Authentication also does not substitute for ownership or group membership checks.

## Implemented sign-in and gate (AUTH-001-C)

`apps/mobile/src/features/auth/` (`PhoneScreen`, `OtpScreen`, `SessionEndedScreen`, `SignInFlow`, `SessionExpiryRedirect`, `pendingIntent.ts`, `PendingIntentProvider.tsx`, `signInMessages.ts`), routed by `app/auth/{_layout,phone,otp,session-ended}.tsx`, covered by `tests/signIn.test.tsx` and `tests/pendingIntent.test.tsx`.

| Rule | Behavior |
| --- | --- |
| Demo identity | On the mock source (`DemoSignIn` from the composition) the phone field starts with `+447700900123`, says which numbers work and that no SMS is sent, and turns autofill off so the device's real number is never offered; the code screen shows the demo code. A real source supplies no `DemoSignIn` and gets neutral copy |
| Phone step | Typed input is normalized (spaces, dashes, dots and brackets dropped, `00` read as `+`) and checked as E.164 before anything is sent. Source refusals map to the app's own copy: a field error for `VALIDATION_FAILED` (a non-demo number gets the demo hint), a wait for `OTP_RESEND_THROTTLED`/`RATE_LIMITED` with `retryAfterSeconds`, a connection notice for network or `SERVICE_UNAVAILABLE`. No message repeats the number |
| Flow state | The number and challenge live in the auth layout's memory (`SignInFlow`), never in a route or storage. Opening `/auth/otp` without a challenge offers only the phone step |
| Code step | Verify is enabled with all six digits and signs in through the session controller. `OTP_INVALID` shows under the field; `OTP_EXPIRED` and `OTP_ATTEMPTS_EXCEEDED` switch to the fresh-code state (47), whose main action requests a new challenge for the same number. A new code can be requested at any time; the source decides: a refusal disables the action for its `retryAfterSeconds`, counted on the device. The challenge's timestamps are not compared with the device clock, which can differ from the source's (the demo controls move it) |
| Leaving | A rider signed in closes the whole auth stack, back to the screen it opened over. Closing it any other way (Close and keep browsing, Browse anonymously, a back gesture) cancels the pending intent |
| Session ended | A session ending as `expired` (a refused refresh, or a stored session refused at launch) opens `/auth/session-ended` (31): Sign in again continues to the phone step with the intent kept; Browse anonymously closes it. Private reads and subscriptions are already gone (SYNC-001-B) |
| Pending intent | `ProtectedIntent` is `create-request`, `join-ride`, `join-group` or `send-message` with the target ID: data only. `useRequireSignIn()(intent)` returns `true` for a signed-in rider; otherwise it keeps the intent (replacing an older one) and opens sign-in. After sign-in the intent is `ready`, and `useResumeIntent(kind, onResume)` hands it once to its screen, which must read the target again and show its own confirmation. An expiry puts a ready intent back to waiting; a sign-out or demo reset drops it. Sign-in never creates, joins or sends anything |
| Home | "Sign in" shows only while nobody is signed in; it is a temporary entry until the first protected action (RIDE-001) uses the gate |

## Implemented settings and sign-out (AUTH-001-D)

`apps/mobile/src/features/settings/SettingsScreen.tsx`, `apps/mobile/src/features/auth/{SignOutSheet.tsx,signOutOutcome.ts}`, routed by `app/settings.tsx` (opened from home's Settings button), covered by `tests/settings.test.tsx`.

| Rule | Behavior |
| --- | --- |
| Variants | Settings (40) follows the session: signed in shows the rider's display name, a warning when the session could not be saved (it ends when the app closes) and Sign out; signed out shows anonymous browsing and Sign in, which returns to settings; restoring says so; a failed restore offers Try again. The location row summarizes the foreground permission. On the mock source it carries the demo label. Signed in, a "Blocked riders" row opens the blocked-riders panel (44, SAFETY-001-C) without reading anything itself. Notifications (NOTIFICATION-001-B) are not shown until their card |
| Confirmation | Sign out opens the confirmation (48) in a sheet: what is cleared, that anonymous browsing remains, and that signing out does not leave a group or cancel a request. "Keep me signed in" changes nothing. While signing out the sheet cannot be dismissed; an unexpected failure is shown in it and can be retried |
| Cleanup | Confirming calls the session controller's `signOut` (revocation, then local credential removal); the identity change makes the sync coordinator drop private reads and subscriptions, and the gate drops a pending intent. No group or request operation runs. The root stack is then reset to the map with settings on top, so no private screen stays beneath |
| Outcome | The result is reduced to `confirmed`, `unconfirmed` (the source did not confirm revocation), `storage-kept` (the stored token could not be removed) or both, carried as a route parameter with no rider detail, and shown on settings in those terms; only `confirmed` says private details were cleared. It shows only while signed out by a sign-out, so a link cannot claim one. Push-device deregistration joins it in NOTIFICATION-001 |

## User projections

- Public `UserDto`: opaque ID, display name, optional avatar URL.
- Implemented with `CurrentUserDto` by CONTRACT-001-B: display names have 1–40 characters on one line, avatars are `https` URLs or `null`, and both schemas reject phone, credential, session and location fields. Exact rules: [locations and users](overview.md#locations-and-users-contract-001-b).
- Private `CurrentUserDto`: user plus references to the current request/group so the app can restore navigation.
- Phone numbers, tokens, OTP details, and exact location never appear in public profiles.
- A lightweight first-session display name may be assigned in the mock; profile completion must not unexpectedly block the specified main flow.

## Verification

Verify anonymous browsing, auth cancellation, preserved drafts, invalid/expired codes, resend throttling, one concurrent refresh, failed-refresh cleanup, logout, and stale target revalidation. Test public schemas independently of mock internal state.
