# Mobile MVP roadmap

Last updated: 2026-11-01. **MONO-001, MOBILE-001, TOOLCHAIN-001, CONTRACT-001, CONTRACT-002, CONTRACT-003 and CONTRACT-004 are completed; UI-001 is paused for an Android text fix (UI-001-D completed with its screen-reader checks waived until final device testing); DATA-001 is completed; MOCK-001 is completed (A, B, and C's demo controls); LOCATION-001 is completed (A's native checks in VERIFY-002, B's home recovery and named pickup); ANALYTICS-001 is completed; MAP-001 is paused with A implemented and its native checks pending; all other implementation tasks are planned.**

## Milestone order

1. Implement a complete mobile MVP using realistic mocks.
2. Review and stabilize contracts against the working mobile product.
3. Future milestone: implement the backend against those contracts.
4. Future milestone: replace mock transport with HTTP/Socket.IO.

This roadmap covers only items 1–2. No backend implementation or real transport tasks are in the DAG. Completing a task does not authorize starting the next milestone automatically.

## Progress

**MOCK-001-C — Completed (2026-11-01); MOCK-001 is `Completed`.**

- **Done:**
  - The `DevControls` port (`src/data/DevControls.ts`, `useDevControls()`), created by the composition root with the mock source only in development and preview builds; production builds never create it.
  - `/dev/scenarios` (screen 50), opened from home's Demo badge: the 14 documented scenarios with only the two implemented ones selectable, restart, Online/Offline, moving the source's clock ahead, and a failure for the next request (no answer or refused). Starting a scenario resets the one simulator into it, so the data source stays the same, and clears the app's cached reads. Production builds show an unavailable state and no entry on home.
  - `ScreenHeader` and two more design icons. 268 mobile tests (12 new).
- **Parent check:** reset is repeatable and leaves no timers or listeners (A's tests, and a scenario switch leaves the same counts as a fresh simulator); public outputs contain no exact private locations (B).
- **Not run (JavaScript only, deferred):** opening the screen on a device. The next native pass needs rebuilt clients anyway (MAP-001-A).
- **Next available:** AUTH-001-A and SYNC-001-A (both need the whole MOCK-001). MAP-001-B follows MAP-001-A's native checks.

**MAP-001-A — Paused (2026-11-01): implemented, native checks pending.**

- **Done:**
  - `react-native-maps` 1.27.2 and `react-native-svg` 15.15.4, the versions Expo SDK 57 lists. Home is now a map (Apple Maps on iOS, Google Maps on Android) in `MapLayout`: a floating "along" title and Demo badge, "Show my location" above a fixed bottom sheet, and the location card, the confirmed pickup and the temporary Sign in moved into that sheet.
  - `src/features/map/`: the device position from the location controller (dot with accuracy circle, grey when stale, circle only under approximate permission, nothing with a denial), the confirmed pickup's pin, a camera that opens on the demo city and moves once to the first position or a newly confirmed pickup and never fights the user's own panning, and observation only while home is the focused screen.
  - The Android key comes from `GOOGLE_MAPS_ANDROID_API_KEY` (ignored `.env.local` or the shell) through Expo's `android.config.googleMaps.apiKey`, which stays out of the public configuration; without a key Android shows a notice instead of a map that would stop the app. 256 mobile tests (13 new); typecheck, lint, peers and doctor (21/21) pass.
- **Pending (deferred native pass):** rebuild both development clients (both libraries are native) and run DEVELOPMENT's map shell checks: rendering, pan and zoom, Bishkek coverage, recenter, denial browsing, logo and legal notice above the sheet. Android rendering also needs the user's restricted Google Maps key; without it, check the notice.
- **Next available:** MOCK-001-C. MAP-001-B (map-centre picker) follows MAP-001-A's native checks.

**LOCATION-001-B — Completed (2026-11-01); LOCATION-001 is `Completed`.**

- **Done:**
  - `src/features/location/`: the location introduction (screen 01), which shows the OS prompt only on "Use my location" and can be set aside for the launch; a home location card for every state that needs words (screen 21 and its siblings), with a second action that fits the cause (ask again, open the settings, location services first, retry a fix); and a named pickup point chosen from the curated places through `places.search` and confirmed explicitly, kept as a frozen `manual` location for the request draft.
  - The root layout creates, starts and disposes the one location controller and provides this launch's choices. `src/platform/location/openLocationSettings.ts` opens the settings. 243 mobile tests (22 new), through the real routes with a stand-in device.
- **Parent check:** allow, deny, unavailable, stale and recovery paths (A natively in VERIFY-002, B in tests); observation stops in the background (VERIFY-002); a confirmed pickup and a captured fix never move (frozen, tested).
- **Not run (JavaScript only, deferred):** opening the new screens on a device. The next native pass should look at the introduction, the cards and the settings links on both platforms.
- **Next available:** MAP-001-A (needs LOCATION-001 and UI-001-D) and MOCK-001-C.

**UI-001-D — Completed (2026-11-01, user waiver).**

- **Decision:** the user marked the TalkBack and VoiceOver checks as accepted without running them, and will test them in the final device testing, once everything including the backend works. They were not run: focus returning to the opener after a sheet closes, the VoiceOver escape gesture, and the announced confirmation error. Jest covers the calls; VERIFY-001 verified the rest natively.
- **Unblocked:** MOCK-001-C and LOCATION-001-B now have all their prerequisites; MAP-001-A follows LOCATION-001-B, and AUTH-001-A and SYNC-001-A follow MOCK-001-C.

**VERIFY-002 — Completed (2026-11-01): native pass for LOCATION-001-A; LOCATION-001-A is `Completed`.**

- **Done:**
  - Both development clients rebuilt from regenerated native folders (iOS: 106 pods, 0 errors; Android: BUILD SUCCESSFUL in 49 s). Both open on the home screen with the mock source composed from `.env`, which also closes DATA-001-A's deferred native check; both exports pass.
  - The LOCATION-001-A permission checks on the iPhone 17 Pro simulator (iOS 26.5) and the Pixel 9 Pro XL emulator (Android 16): no prompt until requested, the when-in-use text, no "always" option in the prompt, the settings or the manifest, denial, permission granted in the settings picked up on return, approximate location never accurate enough for a pickup, location services off, and observation stopped in the background and resumed on return (iOS `locationd` log, Android's location request list).
  - **Fix:** iOS reports every app's permission as denied while location services are off, so the controller showed a denial. A denial now also reads the services state, and `describeLocation` reports `services-off` before `denied`. One new test (221 mobile tests).
- **Finding for LOCATION-001-B:** on Android, expo-location still reported `canAskAgain: true` after the second denial; only a third request, which showed no dialog, returned `false`.
- **Not done:** UI-001-D's screen-reader checks. The user postponed them and chose not to sign an iPhone build for VoiceOver yet; later the same day the user waived them until final device testing (entry above).

**ANALYTICS-001-A — Completed (2026-11-01); ANALYTICS-001 is `Completed`.**

- **Done:**
  - `src/analytics/`: the event catalog from DEVELOPMENT.md with stages (`view`, `intent`, `success`, `observed`) and bounded properties, checked by types and by `validateEvent` (sensitive, unknown, missing and out-of-range properties rejected without echoing values); `createAnalytics` with sessions (new after 30 minutes away), once-per-session and once-per-key events, and marker dwell (1 second of foreground visibility, once per target per session); a context with environment, version, scenario, pseudonymous identities and `synthetic`; memory and no-op sinks; `isRealUserEvent`; the provider and hook. Not created by the app yet. 220 mobile tests (27 new).
- **Parent check:** intent and success events are distinct, sensitive properties are rejected, and mock events are excluded from real-user metrics (all tested).
- **Not run (no native change):** exports and native builds.

**LOCATION-001-A — Completed (2026-11-01; native checks in VERIFY-002).**

- **Done:**
  - `expo-location` 57.0.22 with a foreground-only config plugin entry (iOS when-in-use text only; Android coarse and fine location only).
  - `src/platform/location/`: the `LocationServices` port over Expo Location, `createLocationController` (permission without prompting until asked, cached then fresh fixes with a 15-second timeout, services checks, observation only while needed and in the foreground, recheck on return, permission loss clears the fix), `describeLocation` and `assessFix` (fresh, recent or stale; accurate; usable for a pickup), and `LocationProvider` with its hooks. Not mounted yet. 193 mobile tests (25 new).
- **Native checks:** passed on both platforms in VERIFY-002 (above), with the services-off fix.

**MOCK-001-B — Completed (2026-11-01).**

- **Done:**
  - `src/data/mock/`: world records with exact origins and meeting points kept private (`world.ts`); safe serializers for users, places, public rides, group previews, nearby items and events (`serializers.ts`); 12 curated places and the demo coverage (`places.ts`); the `active-neighborhood` and `empty-neighborhood` seeds with deadlines and scenario A's timed events (`scenarios.ts`, `lifecycle.ts`); place search, nearby discovery, ride and group previews and nearby subscriptions (`discovery.ts`); `createMockSimulator` and the `AppDataSource` adapter (`createMockDataSource.ts`), where every other operation is unavailable.
  - Composition: the root layout runs the configured scenario from launch and disposes it on unmount; an unknown scenario key shows the configuration error screen. 168 mobile tests (33 new).
- **Parent check (partial):** public outputs contain no exact private locations (every output and every event of a full scenario run checked), and reset stays repeatable with the seeds. The dev controls (C) remain.
- **Not run (deferred; no native configuration changed):** a development build or export. The app still shows the map placeholder, since no feature reads yet.

**MOCK-001-A — Completed (2026-11-01).**

- **Done:**
  - `src/data/mock/`: the simulated clock (real time plus an advanced offset), seeded randomness, deterministic IDs, the scheduler that catches up overdue tasks after background time, a typed emitter, idempotency receipts, and `createSimulator`: seeded latency, the operation pipeline (due tasks first, synchronous work, events only after it completes), explicit `network` (before or after commit) and `source` failures, connection loss that ends subscriptions, aborts, reset and disposal.
  - `MOCK_SCENARIOS.md`: the implemented rules. 135 mobile tests (30 new).
- **Parent check (partial):** reset is repeatable and timers and listeners do not accumulate (tested over ten resets and disposal). Safe public outputs and minimal seeds (B) and the dev controls (C) remain.
- **Not run (no app code path uses it yet):** native builds and exports.

**DATA-001-B — Completed (2026-11-01); DATA-001 is `Completed`.**

- **Done:**
  - `@tanstack/react-query` 5.104.5 with one client per launch in the root layout: reads retry at most twice and only when a retry may succeed; mutations never retry automatically.
  - `src/data/errors.ts`: the mobile error model (`DataError` with `source`, `network`, `unavailable`, `aborted` and `unexpected` kinds; source bodies validated against `ApiErrorSchema`), normalization, and Query's error type.
  - `src/data/queryKeys.ts` and `queries.ts`: keys scoped by viewer identity with every parameter, a public scope for place search, a per-group prefix for private data, and read options that pass Query's abort signal.
  - ESLint blocks simulator imports outside the composition root and the simulator. The contracts smoke import is removed. 105 mobile tests (36 new).
- **Parent check:** features cannot import the simulator (lint, tested with controlled imports), unsupported API mode fails clearly (A), and identity and parameters are in the query keys (tested).
- **Not run (deferred):** a development build or export, as for A. No native configuration changed.

**DATA-001-A — Completed (2026-11-01).**

- **Done:**
  - `src/config/appConfig.ts`: validates `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_DATA_SOURCE` (`mock` or `api`) and, for `mock`, `EXPO_PUBLIC_MOCK_SCENARIO`, with no defaults and every problem named. `apps/mobile/.env` holds the development values.
  - `src/data/`: the `AppDataSource` interface with its eight typed namespaces (one operation per documented endpoint, signals on reads only, typed event subscriptions and connection state), `createDataSource` (the one branch on the kind: `api` fails with `DataSourceUnavailableError`, never falling back to the simulator), `DataSourceProvider`/`useDataSource()`, and an unavailable stand-in for the mock slot until MOCK-001.
  - `src/bootstrap/`: one composition per launch; the root layout provides the data source or shows a "This build can’t start" screen. 69 mobile tests (27 new).
- **Parent check (partial):** unsupported API mode fails clearly. Query keys with identity and parameters, the error model, read cancellation and the import restriction (B) remain.
- **Not run (deferred to the later verification pass):** a development build or export confirming the app reads `apps/mobile/.env` and opens on the map. No native configuration changed.

**CONTRACT-004-B — Completed (2026-11-01); CONTRACT-004 is `Completed`.**

- **Done:**
  - `notifications.ts`: the four notification payloads (`matches.available` with the own request and one target or `null`, `group.member_joined`, `group.ready`, `chat.message_created` with the group and message), each with a notification ID, schema version 1, `issuedAt` and `expiresAt` (at most one hour later), and their union on `kind`. Push-device registration: installation UUID, Expo push token, platform, permission state, and a receipt with the installation and registration time only.
  - `api/realtime.md`: recipients per kind, fixed generic copy (no display text in payloads), tap handling for invalid and expired payloads, and the registration rules (upsert without an operation ID, takeover by another user, a token never reaching two users, removal before sign-out). No error codes were added. 860 contract tests (79 new).
- **Parent check:** each event has a validated payload, audience and cache/recovery rule (A), and the notification payloads contain no sensitive content: text, names, coordinates, phone numbers, tokens and links all fail (B).
- **Not run (no app code changed):** mobile Jest, exports and native builds.

**CONTRACT-004-A — Completed (2026-11-01).**

- **Done:**
  - `realtime.ts`: the event envelope (event ID, schema version 1, occurrence time, type, audience, payload), the three audiences (public, one user, one group's members), the seven events with their payloads and cache rules, the per-subscription event unions, and the subscription request (`nearby` viewport, `user`, `group`), acknowledgement and unsubscribe.
  - `api/realtime.md`: payload and cache action per event, removal, group-change and revocation reasons that never reveal a join or a block, subscription errors, and the events one block-and-leave raises. No error codes were added. 781 contract tests (82 new).
- **Parent check (partial):** each event has a validated payload, audience and cache/recovery rule. Notification payloads (B) remain.
- **Not run (no app code changed):** mobile Jest, exports and native builds.

**CONTRACT-003-C — Completed (2026-11-01); CONTRACT-003 is `Completed`.**

- **Done:**
  - `safety.ts`: the four report reasons, report details (1–500 characters, multi-line), the report context (group, and message or `null`; references only), the report input (operation ID, target user, reason, optional details and context) and the receipt (ID and acceptance time, no moderation status). The block input (operation ID), the block result (the block and the caller's leave from a shared live group, or `null`), the blocked-user summary, and the block-list query and page (newest first, `nextCursor`).
  - `common.ts`: `multilineTextSchema(max)`, now also behind chat text.
  - `api/groups.md`: block and report checks in order. A report retry returns the original receipt even after access to the context is lost; a repeated block returns the existing block with no leave; unblock always answers `204`. No error codes were added (`NOT_FOUND` answers an unknown user). 699 contract tests (101 new).
- **Parent check:** solo-to-group formation, the last-seat conflict, leave, closure and access revocation (by leave, closure, history expiry and block-and-leave) are specified, with a transition and permission table, check orders and tested request/response examples.
- **Not run (no app code changed):** mobile Jest, exports and native builds.

**CONTRACT-003-B — Completed (2026-11-01).**

- **Done:**
  - `chat.ts`: message text (1–1,000 characters, line breaks allowed, no other control characters), the group-local sequence (from 1, no gaps), the stored message with sender, time and client message ID, the send input, the history query (latest, `beforeCursor` or `afterSequence`, never both; limit 1–50) and the page (consecutive messages, `olderCursor`, `latestSequence`).
  - `api/groups.md`: send and history errors in order; a retry returns the stored message even after closure; catch-up ends at `latestSequence`. No error codes were added. 598 contract tests (76 new).
- **Parent check (partial):** chat access follows the group's revocation and retention rules. Safety (C) remains.
- **Not run (no app code changed):** mobile Jest, exports and native builds.

**CONTRACT-003-A — Completed (2026-11-01).**

- **Done:**
  - Ready-point policy adopted: a changed or withdrawn meeting point returns a ready group to forming, and the coordinator marks it ready again.
  - `groups.ts`: the member-only group (status, coordinator always among the members, members in join order, meeting point or `null`, closure, version), the member, the closure and its reasons, and the join, leave and coordinator status-change inputs with their results. `GROUP_POLICY` gained the 30-minute lifetime and one-hour history retention.
  - `api/groups.md`: endpoint inputs, results and error order; a transition table with the actor of each change; the join checks in order. The separate meeting-point read was removed (the group carries the point), and the join has no expected version. No error codes were added. 522 contract tests (83 new).
- **Parent check (partial):** solo-to-group formation, the last-seat conflict, leave, closure and access revocation are specified, and a test walks them. Chat (B) and safety (C) remain.
- **Not run (no app code changed):** mobile Jest, exports and native builds.

**CONTRACT-002-B — Completed (2026-11-01); CONTRACT-002 is `Completed`.**

- **Done:**
  - `rides.ts`: the public projection of an active request (no status or group, so no public read links a rider to a group), the owner view (status, group reference consistent with the status, exact origin), the create input (operation ID, exact origin, destination place ID, departure choice of 0, 5 or 10 minutes) and the cancel input (operation ID, expected version).
  - `nearby.ts`: a coarse viewport (span at most 0.5°), the discovery query (optional destination and departure), the ride/group item union and the snapshot (at most 100 items, `truncated`, previews only for returned items). Items carry no distance; the app computes it from the public area.
  - `matches.ts`: match level, preview, match and the owner's match set (at most 20, each target once, with its own version and no cursor).
  - `groups.ts`: group status, `GROUP_POLICY`, the join target and the public group preview without members, coordinator, meeting point or chat.
  - `INVALID_DEPARTURE` removed: a departure outside the options fails validation. Rules and mock policy values in `api/rides.md`. 439 contract tests (162 new).
- **Parent check:** every CONTRACT-002 criterion holds: anonymous previews (ride projection, group preview, nearby snapshot), protected creation, expiry and supplied matches are representable without UI fields; a test walks a request from creation through a match to expiry with its owner and public projections.
- **Not run (no app code changed):** mobile Jest, exports and native builds.

**CONTRACT-002-A — Completed (2026-10-31).**

- **Done:**
  - `places.ts`: the curated place (stable ID, label, optional detail line, coordinates), the search input (optional text, coarse area, limit 1–20) and the results (at most 20, each place once).
  - `CoarseCoordinatesSchema` in `location.ts`: at most 2 decimal places, so anonymous search cannot carry an exact device position.
  - `UNSUPPORTED_AREA` (422) for an area outside the curated coverage.
  - Rules in `api/rides.md`; mock limits in `PLACE_SEARCH_POLICY`. 277 contract tests (44 new).
- **Not run (no app code changed):** mobile Jest, exports and native builds.

**CONTRACT-001-C — Completed (2026-10-31); CONTRACT-001 is `Completed`.**

- **Done:**
  - `auth.ts`: E.164 phone number, six-digit code, opaque session tokens, the challenge request (also used to resend), the challenge, code verification, session credentials, the new session (user plus credentials), and the refresh and logout inputs.
  - Cross-field rules: a challenge's resend time is never after its expiry, and an access token never outlives its refresh token.
  - `OTP_INVALID` (422) and `OTP_EXPIRED` (410) joined the shared error codes; `api/authentication.md` maps each OTP and refresh failure to its code.
  - Mock policy recorded in `api/authentication.md` and `AUTH_POLICY`: 6-digit code, 5-minute challenge, 30-second resend interval, 5 wrong codes, 15-minute access token, 30-day refresh token. AUTH-001-A applies and tests the timing and attempt values.
  - 233 contract tests (54 new). No response schema carries the phone number or the code, and the public user rejects credentials.
- **Parent check:** every CONTRACT-001 criterion holds: public schemas reject private fields, invalid location and auth inputs fail predictably, and all types are inferred from the schemas.
- **Not run (no app code changed):** mobile Jest, exports and native builds.

**CONTRACT-001-B — Completed (2026-10-31).**

- **Done:**
  - `location.ts`: coordinates; the private exact input (a device fix or a confirmed manual point); the owner view; the public area; the member-only meeting point; `LOCATION_POLICY` and `isLocationFixFresh`.
  - `users.ts`: the public `UserDto` and the private `CurrentUserDto`, neither with phone, credential, session or location fields.
  - `common.ts`: `singleLineTextSchema` for display names and labels.
  - Mock location defaults recorded in `api/overview.md`: device fix accuracy at most 100 m and age at most 60 s, public radius 200–5,000 m, walking estimate 0–60 min.
  - 179 contract tests (118 new), including private fields rejected by every public schema and boundary values of each limit.
- **Not run (no app code changed):** mobile Jest, exports and native builds. The next native pass should load the package under Hermes again, because `singleLineTextSchema` uses a Unicode property regex; `hermesc` compiles it.

**VERIFY-001 — Completed (2026-10-31).** One verification pass for TOOLCHAIN-001-A, UI-001-A, UI-001-C, UI-001-D and CONTRACT-001-A.

- **Passed:**
  - Frozen install, build, typecheck, lint, 61 contract and 42 mobile tests, online doctor (21/21), and both exports (run again after the fixes).
  - Clean Android 16 and iOS 26.5 rebuilds; every shell flow from MOBILE-001-G/H, with the 58-point bottom gap on every iOS screen.
  - Fonts, keyboards, focus, code paste, the selector, sheets, busy refusal and keyboard-safe actions, through a temporary development-only sample that was then removed.
- **Fixed during the pass:** `Screen`'s scroll layout passed content under the status bar; `OtpField` showed its hidden text on Android; `Button` lost its accessible name on Android after a busy state.
- **Result:** TOOLCHAIN-001-A, UI-001-C and CONTRACT-001-A are `Completed`. UI-001-A stays `Paused` for Android line-height clipping at 150% and above. UI-001-D stays `Paused` for screen-reader focus return and the VoiceOver escape gesture, which could not be driven on the emulator or simulator.

**CONTRACT-001-A — Paused (2026-10-31).**

- **Done:**
  - Zod 4.6.7 in `packages/contracts`, with strict object schemas and inferred types.
  - `common.ts`: opaque IDs, UTC timestamps, resource versions, UUID operation IDs, cursors, and the `{ data, meta: { serverTime } }` envelope.
  - `errors.ts`: the shared error codes, field errors that cannot echo submitted values, and the error body.
  - A real `pnpm test:contracts` (Vitest 5.0.5): 61 tests in which invalid IDs, timestamps and errors fail. `pnpm test` now runs it too.
  - Contracts typecheck and lint cover the tests; mobile still type-checks against the built package.
- **Deferred at the user's request:** the mobile Jest suite and both exports, which confirm that Jest and Metro load Zod through the contracts package, plus running it under Hermes in the native pass. They are needed before CONTRACT-001-A can be `Completed`.

**UI-001-D — Completed (2026-11-01; native checks in VERIFY-001, screen-reader checks waived by the user).**

- **Done:**
  - `SheetHost`: one bottom sheet per flow on React Native's `Modal`, over a dimmed screen. Only the flow closes it, after a background tap, Android back, or the VoiceOver escape gesture. It can refuse to close while an operation runs, and returns screen-reader focus to the control that opened it.
  - `SheetContent`, and a `scroll`/`footer` form layout for `Screen`: content that scrolls, with actions pinned above the keyboard and the bottom inset.
  - `ConfirmAction` and `ActionFooter`: a confirmation with a heading, consequence text, a confirm action (primary or danger) and a way back, plus busy and announced-error states.
  - No sheet library: `@gorhom/bottom-sheet` was checked and not adopted (see the implementation plan).
  - 41 mobile tests, typecheck, and lint pass.
- **Native checks:** VERIFY-001 verified Android back, background dismissal, busy refusal and keyboard-safe actions on both platforms. The screen-reader checks (restored focus, VoiceOver escape, announced error) were waived by the user on 2026-11-01 until final device testing.

**UI-001-C — Paused (2026-10-30).**

- **Done:**
  - `TextField` and `SearchField`: the label is the field's spoken name; they show focus and error borders, read and announce errors, offer a counter for bounded text, and add Clear for search.
  - `OtpField`: one transparent input over digit cells. Paste and autofill keep digits only, and screen readers get a single field.
  - `SegmentedControl`: a radio group, used for the departure choice.
  - 32 mobile tests, typecheck, and lint pass.
- **Deferred at the user's request:** native keyboard and enlarged-text checks on both platforms.

**UI-001-B — Completed (2026-10-30).**

- **`Button`:** primary, secondary, ghost, and danger variants, a `busy` state that blocks repeat presses and reports busy, 52-point height, and Manrope labels.
- **New:** `IconButton` (a 48-point target with a required name and a hidden icon), `Badge`, and `Notice`.
- **Checks:** 23 mobile tests pass, along with typecheck and lint.

**UI-001-A — Paused (2026-10-30).**

- **Done:** design tokens (`src/ui/tokens.ts`) and `AppText` were added, and the map, sign-in, and unavailable screens now use `AppText`. Static Manrope 400–800 with its OFL license is embedded through `expo-font`, and the Along mark (SVG plus PNGs) is in `apps/mobile/assets`. Typecheck, lint, and doctor (21/21) pass.
- **Deferred at the user's request:** tests, exports, and native font inspection after rebuilding both development clients. They are needed before UI-001-A is `Completed`.

**TOOLCHAIN-001-A — Paused (2026-10-30).**

- **Done:** `react-native-gesture-handler` is pinned at 2.32.0 (Expo SDK 57's `~2.32.0`), replacing the auto-installed 3.3.0. Peers, online doctor at 21/21, `expo install --check`, resolution, and autolinking on both platforms pass.
- **Deferred at the user's request:** `pnpm test:mobile`, both exports, and Android and iOS rebuilds from clean native directories, rechecking the shell flows. They are needed before TOOLCHAIN-001 can be `Completed`.

**MOBILE-001-H — Completed (2026-10-30); MOBILE-001 — Completed.**

- **Native builds:** the iOS development build runs on an iOS 26.5 simulator and the Android build on an Android 16 emulator. Both were rebuilt from clean native directories on the final files.
- **Checks:** home, sign-in navigation, Close, native swipe dismissal and Android back, direct-entry fallback, the inert routes, and safe areas all pass.
- **Changes inside H, authorized by the user:**
  - Expo SDK 57 patches aligned to online doctor's list: four packages on 2026-10-10, then six on 2026-10-30.
  - `Screen` now pads from the safe-area provider's insets, because the native `SafeAreaView` lost the bottom inset when the iOS sign-in sheet first opened.
- **Final checkpoint:** frozen install, build, typecheck, lint, 18 tests, online doctor at 21/21, and both exports pass.
- **Next:** no later child has started. The next card is TOOLCHAIN-001-A in [MOBILE_IMPLEMENTATION_PLAN.md](MOBILE_IMPLEMENTATION_PLAN.md), only when requested.

**DOC-004 — Reusable one-task execution prompt: Completed.** [Saved prompt](MOBILE_IMPLEMENTATION_PLAN.md#prompt-for-later-child-cards) supports NEXT or an explicit child ID, prerequisite/ownership checks, required verification and shared handoff, then a hard stop. No implementation task was started or marked complete.

**DOC-003 — Save the complete Along implementation plan: Completed.** [MOBILE_IMPLEMENTATION_PLAN.md](MOBILE_IMPLEMENTATION_PLAN.md) contains the 55-screen matrix, corrections, UI/navigation/state rules, 65 bounded assignments (including existing MOBILE-001-H), verification and prompts. No application/design implementation or dependency decision was executed by saving this plan. Next remains MOBILE-001-H when assigned.

**DESIGN-001 — Full mobile MVP design concept: Paused (user testing repaired importer).** Build 1.0.1 fixes duplicate flow registration, parent-container cleanup and stale sample-pruning IDs; regression checks and the rebuilt 55-screen/17-component/192-link package pass locally. The previous build failed in native Figma. The user chose to test the repaired package after automated manifest-picker input failed; native sample/full visual and prototype acceptance remains unfinished. See [design handoff](design/along/README.md). Implementation task statuses and the DAG are unchanged.

Documentation baseline **DOC-000**, shared Codex/Claude Code workflow **DOC-001**, and small first-step task plan **DOC-002** are complete. MONO-001 is completed: **MONO-001-A** recorded the toolchain in [TOOLCHAIN.md](TOOLCHAIN.md), **MONO-001-B** created the root pnpm workspace, **MONO-001-C** added the empty `@ride-match/contracts` package with a working `pnpm build:contracts`, **MONO-001-D** made `pnpm typecheck` and `pnpm lint` real checks (negative probes fail as expected), and **MONO-001-E** routed all three through Turbo with cached build outputs. It also passed the workspace checkpoint review. MOBILE-001 is completed: **MOBILE-001-A** created the minimal Expo Router app, with one anonymous home route showing a map placeholder; mobile typecheck and lint pass, and the Android and iOS JavaScript exports succeed. **MOBILE-001-B** connected the app to `@ride-match/contracts` through its public `dist` entry. It also added `pnpm dev` (contracts watch alongside Expo in Turbo's UI), `dev:mobile`, `doctor:mobile`, and the export and native wrappers. **MOBILE-001-C** added the `Screen` (safe-area container) and `Button` UI primitives. **MOBILE-001-D** added inert, dismissible sign-in placeholders: home → modal `/auth/phone` → `/auth/otp`, with Back and Close. **MOBILE-001-E** added inert “not available yet” pages for `/groups/[groupId]`, its chat, `/settings`, and `/dev/scenarios`, which is offered only in development builds. **MOBILE-001-F** added the Jest behavior-test harness: `pnpm test:mobile` and `pnpm test` run 16 tests against the real routes and `Button`. **MOBILE-001-G** verified the Android development build on an Android 16 (API 36) emulator: `pnpm mobile:android` builds, installs, and launches the app; home, sign-in navigation, Android back, Close, and direct-entry fallback work, and no runtime permission is requested. It also configured dark status-bar icons through the `expo-status-bar` config plugin. **MOBILE-001-H** verified the iOS development build on an iOS 26.5 simulator, including native swipe dismissal, and reran the Android checks on the final files. It aligned the Expo SDK 57 patches with online doctor, fixed `Screen`'s bottom inset in the iOS sign-in sheet, and passed the final checkpoint. See [WORK_LOG.md](WORK_LOG.md) for actual changes and verification. The next card is **TOOLCHAIN-001-A** in [MOBILE_IMPLEMENTATION_PLAN.md](MOBILE_IMPLEMENTATION_PLAN.md), only when requested.

Use [FIRST_STEPS.md](FIRST_STEPS.md) to execute MONO-001 and MOBILE-001 as 13 bounded child assignments, one per request. It owns child statuses; this table owns parent statuses. Complete a parent only after all required children and parent criteria pass. The proposed order is workspace -> Expo shell -> separately planned contract work, which preserves the existing dependencies. The 25 parent tasks and their DAG are unchanged.

| ID | Task | Status |
| --- | --- | --- |
| MONO-001 | Workspace foundation | Completed |
| CONTRACT-001 | Common, location, authentication contracts | Completed |
| CONTRACT-002 | Places, rides, matching contracts | Completed |
| CONTRACT-003 | Groups, chat, safety contracts | Completed |
| CONTRACT-004 | Realtime and notification contracts | Completed |
| MOBILE-001 | Expo shell and navigation | Completed |
| DATA-001 | Data-source and Query foundation | Completed |
| MOCK-001 | Simulator foundation | Completed |
| SYNC-001 | Event synchronization and recovery | Planned |
| AUTH-001 | Simulated authentication | Planned |
| LOCATION-001 | Foreground location | Completed |
| MAP-001 | Native map shell | Paused (A implemented, native checks pending; B planned) |
| ANALYTICS-001 | Typed analytics foundation | Completed |
| MAP-002 | Live nearby activity | Planned |
| DESTINATION-001 | Destination selection and compatibility | Planned |
| RIDE-001 | Creation, matching, expiration | Planned |
| GROUP-001 | Atomic mock group operations | Planned |
| GROUP-002 | Group product flow | Planned |
| CHAT-001 | Temporary text chat | Planned |
| MEETING-001 | Meeting point and readiness | Planned |
| TAXI-001 | Yandex Go handoff | Planned |
| SAFETY-001 | Block and report | Planned |
| NOTIFICATION-001 | Local notification-driven flows | Planned |
| QA-001 | Integrated MVP verification | Planned |
| HANDOFF-001 | Contract review and backend readiness | Planned |

### Proposed plan extensions

These additions are recorded separately from the original 25-parent graph. They do not reopen completed work or authorize automatic implementation. Child prerequisites in the implementation plan refine execution order; their criteria are the parent completion criteria for these additions.

| ID | Task | Prerequisites / execution | Status |
| --- | --- | --- | --- |
| TOOLCHAIN-001 | Resolve recorded gesture-handler compatibility decision | MOBILE-001-H; TOOLCHAIN-001-A in the implementation plan. Changes require its explicit assignment. | Completed |
| UI-001 | Along tokens, controls, inputs and layouts | MOBILE-001-H; gesture-dependent UI-001-D also requires TOOLCHAIN-001-A. Execute UI-001-A through D individually. | Paused (B, C and D completed; A's Android line-height fix open) |

## Task rules

Each parent task defines a bounded capability for either Codex or Claude Code. It can require several smaller assignments. For Terra, use [FIRST_STEPS.md](FIRST_STEPS.md) for the first batch and [MOBILE_IMPLEMENTATION_PLAN.md](MOBILE_IMPLEMENTATION_PLAN.md#e-dependency-ordered-implementation-cards) for later children. FIRST_STEPS owns MONO-001/MOBILE-001 child statuses; the implementation plan owns later child statuses; this roadmap owns parent statuses. Implement only requested scope and preserve completed behavior. Read the latest task handoff before resuming another assistant's work.

In task file lists, `M` means `apps/mobile` and `C` means `packages/contracts`. Later feature modules/commands are proposed; inspect manifests and DEVELOPMENT.md for tooling already implemented. Mobile tests are discovered under `M/tests/`: older parent examples below using `src/...test.ts` must be mapped to actual `tests/...` files, as specified in the implementation plan.

Every code task runs `pnpm typecheck` and `pnpm lint` in addition to listed checks once those scripts exist. Add meaningful tests for behavior/contract changes, not trivial snapshots. Record unavailable native checks honestly. Documentation-only tasks validate documents instead of pretending to run application checks.

After meaningful work, update affected specifications, this progress table, [WORK_LOG.md](WORK_LOG.md), and [AI_CONTEXT.md](AI_CONTEXT.md). Add useful TSDoc to reusable logic and integration boundaries. Mark completion only when observable acceptance criteria are met.

Use the statuses and attribution procedure in [AI_WORKFLOW.md](AI_WORKFLOW.md): `Planned`, `In progress`, `Paused`, `Blocked`, `Completed`. Active owner/session, working-copy scope, and resume point live in `AI_CONTEXT.md`; detailed attributed handoffs live in `WORK_LOG.md`. A new assistant must verify actual files and unfinished criteria instead of restarting a task based on its title alone.

## MONO-001 — Workspace foundation

Execution: [MONO-001-A through MONO-001-E](FIRST_STEPS.md#task-cards), assigned individually.

- **Goal:** Workspace commands and shared-package builds work.
- **Scope:** pnpm/Turborepo setup, strict TypeScript, contracts package shell, root scripts, README, documentation alignment.
- **Expected files/modules:** Root workspace/task configuration; `C/package.json`, `C/tsconfig.json`; README and existing docs.
- **Dependencies:** None.
- **Acceptance criteria:** Contracts build from the root; package boundaries and script behavior are documented; mobile/API packages are not invented prematurely.
- **Verification:** `pnpm build:contracts`, `pnpm typecheck`, `pnpm lint`; inspect package graph and documented command behavior. Do not introduce meaningless tests to claim a test pass.
- **Non-goals:** Expo app, backend package, remote cache, extra shared packages, unrelated repository cleanup.

## CONTRACT-001 — Common, location, and authentication contracts

- **Goal:** Foundational communication/privacy boundaries are explicit.
- **Scope:** IDs/timestamps, exact/public locations, user projections, OTP/session schemas, error envelopes.
- **Expected files/modules:** `C/src/{common,location,auth,users,errors}.ts`, contract tests; API overview/authentication docs.
- **Dependencies:** MONO-001.
- **Acceptance criteria:** Public schemas reject private fields; invalid location/auth inputs fail predictably; types are inferred from runtime schemas.
- **Verification:** `pnpm test:contracts`; review example payloads for sensitive/private fields.
- **Non-goals:** SMS delivery, token signing, production location obfuscation.

## CONTRACT-002 — Places, rides, and matching contracts

- **Goal:** Discovery and ride-request semantics are specified.
- **Scope:** Places/search, nearby items, public/own requests, lifecycle, supplied match results.
- **Expected files/modules:** `C/src/{places,rides,matches}.ts`, contract tests, `docs/api/rides.md`. Implemented with `nearby.ts` and the public group preview in `groups.ts` as well.
- **Dependencies:** CONTRACT-001.
- **Acceptance criteria:** Anonymous previews, protected creation, expiry, and server-supplied matches are representable without UI fields.
- **Verification:** `pnpm test:contracts`; walk through create -> match -> expire payloads and public projections.
- **Non-goals:** Real geocoding, routes, compatibility algorithms.

## CONTRACT-003 — Groups, chat, and safety contracts

- **Goal:** Collaboration operations have unambiguous contracts.
- **Scope:** Atomic joining, group lifecycle, members, meeting points, text messages, block/report.
- **Expected files/modules:** `C/src/{groups,chat,safety}.ts`, contract tests, `docs/api/groups.md`. CONTRACT-003-A completed `groups.ts`, CONTRACT-003-B `chat.ts` and CONTRACT-003-C `safety.ts`.
- **Dependencies:** CONTRACT-002.
- **Acceptance criteria:** Solo-to-group formation, last-seat conflict, leave, closure, and access revocation are specified.
- **Verification:** `pnpm test:contracts`; review transition/permission table and request/response examples.
- **Non-goals:** Reputation, media chat, meeting-point optimization.

## CONTRACT-004 — Realtime and notification contracts

- **Goal:** Asynchronous updates share a stable vocabulary.
- **Scope:** Event/notification envelopes, logical subscriptions, audiences, recovery semantics.
- **Expected files/modules:** `C/src/{realtime,notifications}.ts`, contract tests, `docs/api/realtime.md`. CONTRACT-004-A completed `realtime.ts` and CONTRACT-004-B `notifications.ts`.
- **Dependencies:** CONTRACT-003.
- **Acceptance criteria:** Each event has a validated payload, audience, and cache/recovery rule; push payloads contain no sensitive content.
- **Verification:** `pnpm test:contracts`; validate public/private event and notification examples.
- **Non-goals:** Socket.IO server/client implementation, remote push delivery.

## MOBILE-001 — Expo shell and navigation

Execution: [MOBILE-001-A through MOBILE-001-H](FIRST_STEPS.md#mobile-001-a--create-the-minimal-expo-router-shell), assigned individually. Early routes are inert placeholders; real authentication, membership, and scenarios remain in their later tasks.

- **Goal:** A development application launches on both platforms.
- **Scope:** Expo Router, native app configuration, basic UI primitives/providers, test harness, route skeletons.
- **Expected files/modules:** `M/app/`, `M/src/bootstrap/`, `M/src/ui/`, app/test configuration.
- **Dependencies:** MONO-001.
- **Acceptance criteria:** Map placeholder and auth modal navigation work; the behavior-test harness runs; dependencies pass Expo checks.
- **Verification:** `pnpm doctor:mobile`, `pnpm test:mobile`, `pnpm mobile:android`, `pnpm mobile:ios`; manually open/dismiss auth routes.
- **Non-goals:** Domain data, finished map, large design system.

## DATA-001 — Data-source and Query foundation

- **Goal:** Features can call typed asynchronous operations through one boundary.
- **Scope:** AppDataSource, central selection, Query provider/keys, error normalization, read cancellation, config validation, import restrictions.
- **Expected files/modules:** `M/src/data/`, `M/src/config/`, bootstrap providers. DATA-001-A completed the interface, central selection, configuration and data-source provider, and DATA-001-B the Query client, keys, read options, error model and import rule.
- **Dependencies:** MOBILE-001, CONTRACT-004.
- **Acceptance criteria:** Features cannot import mock fixtures; unsupported API mode fails clearly; identity/parameters are represented in relevant query keys.
- **Verification:** `pnpm test:mobile --runTestsByPath src/data/dataSource.test.ts`; verify lint restriction with a controlled invalid import test/check.
- **Non-goals:** HTTP implementation, generic dependency-injection framework, multiple repository/service layers.

## MOCK-001 — Simulator foundation

- **Goal:** Deterministic mock operations and timed events work.
- **Scope:** State, injected clock, scheduled events, safe serialization, latency/failure controls, minimal active/empty seeds, reset cleanup.
- **Expected files/modules:** `M/src/data/mock/`, simulator behavior tests. MOCK-001-A completed the foundation modules and `tests/simulator.test.ts`; MOCK-001-B added the world, seeds, serializers, public reads and the adapter, with `tests/mockDataSource.test.ts`; MOCK-001-C added the demo controls (`createMockDevControls`, `src/features/demo/`) with `tests/demoControls.test.tsx`.
- **Dependencies:** DATA-001.
- **Acceptance criteria:** Reset is repeatable; timers/listeners do not accumulate; public outputs contain no exact private locations.
- **Verification:** `pnpm test:mobile --runTestsByPath src/data/mock/simulator.test.ts`; repeat resets and advance fake time.
- **Non-goals:** Every product operation, persistent fake database, fake HTTP server.

## SYNC-001 — Event synchronization and recovery

- **Goal:** Query state converges after events and interruptions.
- **Scope:** Subscriptions, invalidation, version guards, deduplication, snapshot/event races, foreground/reconnect recovery.
- **Expected files/modules:** `M/src/data/synchronizeEvents.ts`, lifecycle hooks and synchronization tests.
- **Dependencies:** MOCK-001.
- **Acceptance criteria:** Duplicate/stale/missed events converge to canonical state; session/scenario resets clear subscriptions and protected data.
- **Verification:** `pnpm test:mobile --runTestsByPath src/data/synchronizeEvents.test.ts`; inject duplicate/out-of-order events during reads.
- **Non-goals:** Socket.IO adapter, event-sourced client database, persistent offline mutation queue.

## AUTH-001 — Simulated authentication

- **Goal:** Protected actions authenticate while preserving context.
- **Scope:** Mock OTP/session operations, phone/code screens, bootstrap/refresh/logout, credential boundary, pending-action continuation.
- **Expected files/modules:** `M/src/features/auth/`, storage adapter, mock auth operations.
- **Dependencies:** MOCK-001.
- **Acceptance criteria:** Anonymous browsing remains usable; create/join/send are gated; cancelled auth returns to browsing; refresh failures clear private data.
- **Verification:** `pnpm test:mobile --runTestsByPath src/features/auth/authFlow.test.tsx`; manually verify invalid/expired code, preserved draft, and refresh failure.
- **Non-goals:** Real SMS, production auth, collecting real phone numbers for demos.

## LOCATION-001 — Foreground location

- **Goal:** The app presents honest usable location states.
- **Scope:** Permission, cached/fresh fix, manual fallback, foreground observation, stale/accuracy handling and cleanup.
- **Expected files/modules:** `M/src/platform/location/`, permission UI and tests. LOCATION-001-A added the controller and `tests/locationLifecycle.test.tsx`; LOCATION-001-B added `M/src/features/location/` and `tests/locationRecovery.test.tsx`.
- **Dependencies:** MOBILE-001.
- **Acceptance criteria:** Allow/deny/unavailable/stale/recovery paths work; observation stops in background; a published request is not silently moved.
- **Verification:** `pnpm test:mobile --runTestsByPath tests/locationLifecycle.test.tsx`; device permission/settings/background checks.
- **Non-goals:** Background tracking, real route calculation, automatic ride-origin updates.

## MAP-001 — Native map shell

- **Goal:** Users can view and navigate a map.
- **Scope:** Provider configuration, user dot, camera/recenter, overlays, base sheet interaction.
- **Expected files/modules:** `M/src/features/map/`, app native configuration. MAP-001-A added `M/src/features/map/`, `M/src/ui/{MapLayout,Icon}.tsx`, the Android key setting in `app.config.ts`, and `tests/{mapHome,mapProvider}.test.ts(x)`.
- **Dependencies:** LOCATION-001.
- **Acceptance criteria:** Basemap/recenter work on both platforms; denied location still permits browsing; local coverage is checked.
- **Verification:** `pnpm mobile:android`, `pnpm mobile:ios`; manually pan/zoom/recenter and deny location.
- **Non-goals:** Nearby domain activity, match highlighting, map-provider abstraction framework.

## ANALYTICS-001 — Typed analytics foundation

- **Goal:** Product actions emit defined inspectable events.
- **Scope:** Event/property schemas, session/dwell semantics, memory/no-op sink, privacy guards, demo labeling.
- **Expected files/modules:** `M/src/analytics/`, behavior tests, analytics section in development docs. ANALYTICS-001-A added them, with `tests/analytics.test.tsx`.
- **Dependencies:** MOBILE-001.
- **Acceptance criteria:** Intent and success events are distinct; sensitive properties are rejected; mock events can be excluded from real metrics.
- **Verification:** `pnpm test:mobile --runTestsByPath tests/analytics.test.tsx`; inspect safe event output.
- **Non-goals:** Vendor integration, dashboards, real retention claims.

## MAP-002 — Live nearby activity

- **Goal:** Anonymous users can inspect realistic nearby intentions.
- **Scope:** Nearby reads, public previews, markers/selection/sheets, clustering, empty/stale states, exposure events.
- **Expected files/modules:** Map feature, mock nearby operations, scenarios A/B/M.
- **Dependencies:** MAP-001, SYNC-001, ANALYTICS-001.
- **Acceptance criteria:** Active/empty scenarios work; markers appear/remove without camera jumps; groups do not duplicate solo members; selection stays coherent.
- **Verification:** `pnpm test:mobile --runTestsByPath src/features/map/nearbyMap.test.tsx`; manually run A/B/M and inspect accessibility.
- **Non-goals:** Create/join operations, production matching.

## DESTINATION-001 — Destination selection and compatibility

- **Goal:** Destination choice changes map emphasis.
- **Scope:** Curated place search, sheet, debounce/cancellation, fixture preview matches, clear selection.
- **Expected files/modules:** `M/src/features/destinations/`, mock place/match operations, map selectors.
- **Dependencies:** MAP-002.
- **Acceptance criteria:** Compatible activity is emphasized without hiding the map; unrelated activity remains; clearing selection restores general browsing.
- **Verification:** `pnpm test:mobile --runTestsByPath src/features/destinations/destinationFlow.test.tsx`; rapidly change searches/destinations to check stale reads.
- **Non-goals:** Real geocoder, paid places service, mobile compatibility calculation.

## RIDE-001 — Creation, matching, and expiration

- **Goal:** Users can publish and manage a ride intention.
- **Scope:** Authenticated create/cancel, departure choices, one-live-request invariant, supplied match arrival, expiry and retry behavior.
- **Expected files/modules:** `M/src/features/rides/`, mock ride operations, scenarios C/F.
- **Dependencies:** DESTINATION-001, AUTH-001.
- **Acceptance criteria:** Create -> searching -> match and create -> expired both work; retries do not duplicate; auth preserves the draft.
- **Verification:** `pnpm test:mobile --runTestsByPath src/features/rides/rideFlow.test.tsx`; manually background across expiry and cancel an active request.
- **Non-goals:** Recurring commuting, long-term scheduling, editing published routes.

## GROUP-001 — Atomic mock group operations

- **Goal:** Group invariants work independently of UI.
- **Scope:** Join solo/group, canonical target resolution, capacity, idempotency, leave, coordinator transfer, lifecycle and expiry.
- **Expected files/modules:** Mock group operation modules and transition tests.
- **Dependencies:** MOCK-001.
- **Acceptance criteria:** Concurrent joins cannot exceed four or create duplicate target groups; leaves/transfers/expiry follow documented rules.
- **Verification:** `pnpm test:mobile --runTestsByPath src/data/mock/groups.test.ts`; simulate simultaneous last-seat and first-group joins with fake time.
- **Non-goals:** Group screens, backend transactions/distributed locks.

## GROUP-002 — Group product flow

- **Goal:** Users can join, inspect, leave, and manage groups.
- **Scope:** Public preview/join confirmation, member/seat display, group routes, readiness/completion controls, conflict recovery.
- **Expected files/modules:** `M/src/features/groups/`, routes, scenarios D/E.
- **Dependencies:** GROUP-001, RIDE-001.
- **Acceptance criteria:** Solo joining forms a group; capacity conflicts show canonical state; leave updates map/access. Readiness UI can use a supplied mock meeting point until MEETING-001 adds its full display.
- **Verification:** `pnpm test:mobile --runTestsByPath src/features/groups/groupFlow.test.tsx`; manual D/E plus leave and coordinator transfer.
- **Non-goals:** Invitations, approval queues, multi-seat members, optimized meeting points.

## CHAT-001 — Temporary text chat

- **Goal:** Authorized members can exchange text.
- **Scope:** History pagination, composer, canonical send, pending/failed presentation, simulated replies, retry/deduplication, sequence catch-up.
- **Expected files/modules:** `M/src/features/chat/`, mock chat operations, route, scenario H.
- **Dependencies:** GROUP-002.
- **Acceptance criteria:** Retry yields one message; missing messages recover; leaving revokes access; closure disables sending.
- **Verification:** `pnpm test:mobile --runTestsByPath src/features/chat/chatFlow.test.tsx`; native keyboard/sheet checks on both platforms.
- **Non-goals:** Media/files, editing, reactions, threads, typing, read receipts.

## MEETING-001 — Meeting point and readiness

- **Goal:** Members can inspect a shared pickup point and prepare to leave.
- **Scope:** Mock point assignment/update, member-only map landmark/detail, supplied walking estimate, readiness prerequisite integration.
- **Expected files/modules:** Group/map meeting-point components, mock group scenarios.
- **Dependencies:** GROUP-002.
- **Acceptance criteria:** Point changes synchronize; authorized members see it; readiness works when prerequisites are met.
- **Verification:** `pnpm test:mobile --runTestsByPath src/features/groups/meetingPoint.test.tsx`; inspect landmark/distance and mark ready on device.
- **Non-goals:** Optimization, turn-by-turn walking routes, collaborative point editing.

## TAXI-001 — Yandex Go handoff

- **Goal:** Ready groups can open the external taxi provider.
- **Scope:** Small taxi boundary, reviewed parameter validation, link generation/opening, fallback, intent/handoff analytics.
- **Expected files/modules:** `M/src/platform/taxi/`, group CTA, scenario L.
- **Dependencies:** MEETING-001.
- **Acceptance criteria:** Installed and absent-provider paths work; link handoff never automatically completes the group; links/coordinates are not logged.
- **Verification:** `pnpm test:mobile --runTestsByPath src/platform/taxi/yandex.test.ts`; device checks with and without Yandex Go on both platforms.
- **Non-goals:** Booking APIs, fares, payments, multiple providers.

## SAFETY-001 — Block and report

- **Goal:** Users can complete mocked safety flows with real state effects.
- **Scope:** Report receipt/errors, block/unblock, block-and-leave, filtering, membership/cache/subscription cleanup.
- **Expected files/modules:** `M/src/features/safety/`, mock safety operations, scenario J.
- **Dependencies:** GROUP-002, CHAT-001.
- **Acceptance criteria:** Block changes pairing eligibility and shared-group access; old events cannot restore chat; report acceptance/failure is clear.
- **Verification:** `pnpm test:mobile --runTestsByPath src/features/safety/safetyFlow.test.tsx`; manual report/block/leave/unblock sequence.
- **Non-goals:** Moderation service/dashboard, reputation, claims of real enforcement.

## NOTIFICATION-001 — Local notification-driven flows

- **Goal:** Notification entry works without a push backend.
- **Scope:** Contextual permission, local notifications, validated payloads, tap deduplication, cold/warm navigation, mock registration.
- **Expected files/modules:** `M/src/platform/notifications/`, mock devices, scenario K.
- **Dependencies:** CHAT-001, MEETING-001.
- **Acceptance criteria:** Match/member/ready/message notifications resolve current authorized state; stale or denied targets fail gracefully.
- **Verification:** `pnpm test:mobile --runTestsByPath src/platform/notifications/notificationFlow.test.tsx`; development-build device checks for permission denial and warm/cold entry.
- **Non-goals:** Remote push delivery, real backend registration, production push credentials, background location.

## QA-001 — Integrated MVP verification

- **Goal:** Complete mock product is demonstrable and resilient.
- **Scope:** Remaining scenarios, focused Maestro flows, both-platform checks, density/accessibility, timer/listener cleanup, analytics verification.
- **Expected files/modules:** `M/.maestro/`, integration tests/scenarios, development and scenario docs.
- **Dependencies:** TAXI-001, SAFETY-001, NOTIFICATION-001.
- **Acceptance criteria:** [MVP completion criteria](DEVELOPMENT.md#mobile-mvp-completion-criteria) pass; outstanding native/product limitations are recorded accurately.
- **Verification:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm doctor:mobile`, `pnpm export:android`, `pnpm export:ios`, `pnpm test:e2e`; complete manual A–N matrix and device handoff checks.
- **Non-goals:** Store release, production load tests, backend development.

## HANDOFF-001 — Contract review and backend readiness

- **Goal:** Reviewed mobile behavior provides a concrete future backend specification.
- **Scope:** Reconcile schemas, operations, endpoints/events, errors, privacy, scenarios, implementation limitations, and roadmap state.
- **Expected files/modules:** `C/src/`, API docs, architecture/development/roadmap/context/work log.
- **Dependencies:** QA-001.
- **Acceptance criteria:** Every data-source method maps to a documented endpoint/event; no mock-only assumptions leak into features; [handoff artifacts](api/overview.md#backend-handoff-readiness) are complete.
- **Verification:** `pnpm test:contracts`, `pnpm typecheck`; operation/spec audit and complete demonstration. Run additional relevant tests if review changes behavior.
- **Non-goals:** Populating `apps/api`, implementing HTTP/Socket.IO transport, automatically starting the next milestone.

## Dependency graph

```mermaid
flowchart TD
    MONO["MONO-001"] --> C1["CONTRACT-001"]
    C1 --> C2["CONTRACT-002"]
    C2 --> C3["CONTRACT-003"]
    C3 --> C4["CONTRACT-004"]
    MONO --> MOBILE["MOBILE-001"]
    MOBILE --> LOCATION["LOCATION-001"]
    LOCATION --> MAP1["MAP-001"]
    MOBILE --> ANALYTICS["ANALYTICS-001"]
    MOBILE --> DATA["DATA-001"]
    C4 --> DATA
    DATA --> MOCK["MOCK-001"]
    MOCK --> SYNC["SYNC-001"]
    MOCK --> AUTH["AUTH-001"]
    MOCK --> GROUP1["GROUP-001"]
    MAP1 --> MAP2["MAP-002"]
    SYNC --> MAP2
    ANALYTICS --> MAP2
    MAP2 --> DEST["DESTINATION-001"]
    DEST --> RIDE["RIDE-001"]
    AUTH --> RIDE
    RIDE --> GROUP2["GROUP-002"]
    GROUP1 --> GROUP2
    GROUP2 --> CHAT["CHAT-001"]
    GROUP2 --> MEETING["MEETING-001"]
    MEETING --> TAXI["TAXI-001"]
    CHAT --> SAFETY["SAFETY-001"]
    GROUP2 --> SAFETY
    CHAT --> NOTIFICATIONS["NOTIFICATION-001"]
    MEETING --> NOTIFICATIONS
    TAXI --> QA["QA-001"]
    SAFETY --> QA
    NOTIFICATIONS --> QA
    QA --> HANDOFF["HANDOFF-001"]
```

## Potential parallel work

- After MONO-001: contracts and Expo shell.
- After MOBILE-001: location/map infrastructure and analytics while contracts mature.
- After MOCK-001: auth, synchronization, and atomic group operations.
- After GROUP-002: chat and meeting-point UI.
- Once prerequisites hold: taxi, safety, and notifications.

Sequential implementation remains the default, including when alternating Codex and Claude Code. Follow [shared ownership and handoff rules](AI_WORKFLOW.md#safe-use-of-both-tools) for concurrent work; coordinate shared schemas, composition, lockfiles, and documentation. This graph is not authorization to spawn agents or implement future tasks.
