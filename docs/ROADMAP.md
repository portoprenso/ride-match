# Mobile MVP roadmap

Last updated: 2026-10-31. **MONO-001, MOBILE-001, TOOLCHAIN-001 and CONTRACT-001 are completed; UI-001 is paused for an Android text fix and screen-reader checks; all other implementation tasks are planned.**

## Milestone order

1. Implement a complete mobile MVP using realistic mocks.
2. Review and stabilize contracts against the working mobile product.
3. Future milestone: implement the backend against those contracts.
4. Future milestone: replace mock transport with HTTP/Socket.IO.

This roadmap covers only items 1–2. No backend implementation or real transport tasks are in the DAG. Completing a task does not authorize starting the next milestone automatically.

## Progress

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

**UI-001-D — Paused (2026-10-31).**

- **Done:**
  - `SheetHost`: one bottom sheet per flow on React Native's `Modal`, over a dimmed screen. Only the flow closes it, after a background tap, Android back, or the VoiceOver escape gesture. It can refuse to close while an operation runs, and returns screen-reader focus to the control that opened it.
  - `SheetContent`, and a `scroll`/`footer` form layout for `Screen`: content that scrolls, with actions pinned above the keyboard and the bottom inset.
  - `ConfirmAction` and `ActionFooter`: a confirmation with a heading, consequence text, a confirm action (primary or danger) and a way back, plus busy and announced-error states.
  - No sheet library: `@gorhom/bottom-sheet` was checked and not adopted (see the implementation plan).
  - 41 mobile tests, typecheck, and lint pass.
- **Deferred at the user's request:** native checks on both platforms for Android back, iOS dismissal and escape, keyboard-safe actions, and restored focus.

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
| CONTRACT-002 | Places, rides, matching contracts | Planned |
| CONTRACT-003 | Groups, chat, safety contracts | Planned |
| CONTRACT-004 | Realtime and notification contracts | Planned |
| MOBILE-001 | Expo shell and navigation | Completed |
| DATA-001 | Data-source and Query foundation | Planned |
| MOCK-001 | Simulator foundation | Planned |
| SYNC-001 | Event synchronization and recovery | Planned |
| AUTH-001 | Simulated authentication | Planned |
| LOCATION-001 | Foreground location | Planned |
| MAP-001 | Native map shell | Planned |
| ANALYTICS-001 | Typed analytics foundation | Planned |
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
| UI-001 | Along tokens, controls, inputs and layouts | MOBILE-001-H; gesture-dependent UI-001-D also requires TOOLCHAIN-001-A. Execute UI-001-A through D individually. | Paused |

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
- **Expected files/modules:** `C/src/{places,rides,matches}.ts`, contract tests, `docs/api/rides.md`.
- **Dependencies:** CONTRACT-001.
- **Acceptance criteria:** Anonymous previews, protected creation, expiry, and server-supplied matches are representable without UI fields.
- **Verification:** `pnpm test:contracts`; walk through create -> match -> expire payloads and public projections.
- **Non-goals:** Real geocoding, routes, compatibility algorithms.

## CONTRACT-003 — Groups, chat, and safety contracts

- **Goal:** Collaboration operations have unambiguous contracts.
- **Scope:** Atomic joining, group lifecycle, members, meeting points, text messages, block/report.
- **Expected files/modules:** `C/src/{groups,chat,safety}.ts`, contract tests, `docs/api/groups.md`.
- **Dependencies:** CONTRACT-002.
- **Acceptance criteria:** Solo-to-group formation, last-seat conflict, leave, closure, and access revocation are specified.
- **Verification:** `pnpm test:contracts`; review transition/permission table and request/response examples.
- **Non-goals:** Reputation, media chat, meeting-point optimization.

## CONTRACT-004 — Realtime and notification contracts

- **Goal:** Asynchronous updates share a stable vocabulary.
- **Scope:** Event/notification envelopes, logical subscriptions, audiences, recovery semantics.
- **Expected files/modules:** `C/src/{realtime,notifications}.ts`, contract tests, `docs/api/realtime.md`.
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
- **Expected files/modules:** `M/src/data/`, `M/src/config/`, bootstrap providers.
- **Dependencies:** MOBILE-001, CONTRACT-004.
- **Acceptance criteria:** Features cannot import mock fixtures; unsupported API mode fails clearly; identity/parameters are represented in relevant query keys.
- **Verification:** `pnpm test:mobile --runTestsByPath src/data/dataSource.test.ts`; verify lint restriction with a controlled invalid import test/check.
- **Non-goals:** HTTP implementation, generic dependency-injection framework, multiple repository/service layers.

## MOCK-001 — Simulator foundation

- **Goal:** Deterministic mock operations and timed events work.
- **Scope:** State, injected clock, scheduled events, safe serialization, latency/failure controls, minimal active/empty seeds, reset cleanup.
- **Expected files/modules:** `M/src/data/mock/`, simulator behavior tests.
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
- **Expected files/modules:** `M/src/platform/location/`, permission UI and tests.
- **Dependencies:** MOBILE-001.
- **Acceptance criteria:** Allow/deny/unavailable/stale/recovery paths work; observation stops in background; a published request is not silently moved.
- **Verification:** `pnpm test:mobile --runTestsByPath src/platform/location/locationLifecycle.test.ts`; device permission/settings/background checks.
- **Non-goals:** Background tracking, real route calculation, automatic ride-origin updates.

## MAP-001 — Native map shell

- **Goal:** Users can view and navigate a map.
- **Scope:** Provider configuration, user dot, camera/recenter, overlays, base sheet interaction.
- **Expected files/modules:** `M/src/features/map/`, app native configuration.
- **Dependencies:** LOCATION-001.
- **Acceptance criteria:** Basemap/recenter work on both platforms; denied location still permits browsing; local coverage is checked.
- **Verification:** `pnpm mobile:android`, `pnpm mobile:ios`; manually pan/zoom/recenter and deny location.
- **Non-goals:** Nearby domain activity, match highlighting, map-provider abstraction framework.

## ANALYTICS-001 — Typed analytics foundation

- **Goal:** Product actions emit defined inspectable events.
- **Scope:** Event/property schemas, session/dwell semantics, memory/no-op sink, privacy guards, demo labeling.
- **Expected files/modules:** `M/src/analytics/`, behavior tests, analytics section in development docs.
- **Dependencies:** MOBILE-001.
- **Acceptance criteria:** Intent and success events are distinct; sensitive properties are rejected; mock events can be excluded from real metrics.
- **Verification:** `pnpm test:mobile --runTestsByPath src/analytics/analytics.test.ts`; inspect safe event output.
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
