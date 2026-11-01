# Development, testing, and analytics plan

Status: partly implemented. Last updated: 2026-11-01. **Only commands marked implemented exist. The others are specifications for the named tasks, not checks already run.**

## Workflow and proposed commands

Codex and Claude Code follow the same [shared AI workflow](AI_WORKFLOW.md). Begin with the current handoff and task ownership, inspect actual files, and record attributed changes and verification before handing work to the other tool. The commands and acceptance criteria do not change with the assistant.

| Root command | Intended behavior | Status |
| --- | --- | --- |
| `pnpm dev` | Build contracts once, then run contracts watch and Expo development server | Implemented: `turbo run dev --filter=@ride-match/mobile` (MOBILE-001-B) |
| `pnpm dev:mobile` | Start mobile with contracts prepared | Implemented (MOBILE-001-B) |
| `pnpm build:contracts` | Emit shared JavaScript and declarations | Implemented: `turbo run build --filter=@ride-match/contracts` (MONO-001-E) |
| `pnpm typecheck` | Type-check all workspace packages | Implemented: `turbo run typecheck` (MONO-001-E); covers mobile from MOBILE-001-A and the contracts tests from CONTRACT-001-A |
| `pnpm lint` | Lint application/contracts and enforce import boundaries | Implemented: `turbo run lint` (MONO-001-E); covers mobile from MOBILE-001-A. Import-boundary rules are planned (DATA-001/MOCK-001) |
| `pnpm test` | Run contract and mobile tests once | Implemented: `turbo run test` after dependency builds (MOBILE-001-F); runs the contracts tests too since CONTRACT-001-A |
| `pnpm test:contracts` | Vitest contracts; forward file filters | Implemented (CONTRACT-001-A): `vitest run --dir tests` in `packages/contracts`, against the source, with no build first. `pnpm test:contracts errors` runs only matching files |
| `pnpm test:mobile` | Jest mobile; forward `--runTestsByPath` and other test arguments | Implemented (MOBILE-001-F): builds contracts, then runs `jest` in `apps/mobile`; paths are relative to `apps/mobile` |
| `pnpm test:e2e` | Selected Maestro flows against an installed development build | Planned (QA-001) |
| `pnpm doctor:mobile` | Expo dependency/configuration checks (`pnpm doctor` is pnpm's built-in) | Implemented (MOBILE-001-B) |
| `pnpm export:android` | Export Android JavaScript bundle | Implemented (MOBILE-001-B) |
| `pnpm export:ios` | Export iOS JavaScript bundle | Implemented (MOBILE-001-B) |
| `pnpm mobile:android` | Build/run Android development application | Implemented (MOBILE-001-B) and verified on an Android 16 emulator (MOBILE-001-G). Set the per-command Android variables from [TOOLCHAIN.md](TOOLCHAIN.md#native-prerequisites) |
| `pnpm mobile:ios` | Build/run iOS development application | Implemented (MOBILE-001-B) and verified on an iOS 26.5 simulator (MOBILE-001-H). Run it with a UTF-8 locale; see [TOOLCHAIN.md](TOOLCHAIN.md#native-prerequisites) |

Turborepo development tasks are persistent and uncached. Declare contract build outputs and task dependencies explicitly. The root [`turbo.json`](../turbo.json) does this: `build` caches `dist/**` after dependency builds, `typecheck`, `lint`, and `test` emit nothing, and `dev` is persistent and uncached. No task depends on `dev`. No remote cache or release/deployment automation is needed initially. Bundle exports do not replace native build verification.

Install only justified dependencies during an authorized implementation task. Pin compatible versions and commit the workspace lockfile. Use Expo's recommended native dependency versions and run doctor after native integration changes.

Each bounded task should leave runnable behavior, focused tests where useful, updated current specs, and an honest work-log entry. Do not mark incomplete native checks as passing because a JavaScript export succeeds.

## First implementation batch

Use [FIRST_STEPS.md](FIRST_STEPS.md) for the 13 small assignments under MONO-001 and MOBILE-001. Assign one child at a time. [TOOLCHAIN.md](TOOLCHAIN.md), recorded by MONO-001-A, pins Node 24.17.0, pnpm 11.28.2 through Corepack, Expo SDK 57, TypeScript 6.0.3, Turbo 2.11.6, and the lint and test packages, with exact per-task install commands and local prerequisites. Use those versions and commands; do not guess independent latest dependency versions while implementing later cards.

Commands become available incrementally. Implemented so far: `pnpm install --frozen-lockfile` (MONO-001-B; setup in the root [README](../README.md)), `build:contracts` (MONO-001-C), and root lint/typecheck (MONO-001-D). MONO-001-E routed all three through Turbo. MOBILE-001-A added mobile `start` (`expo start --dev-client`), `typecheck`, and `lint` package scripts; root typecheck and lint now include mobile. MOBILE-001-B added the root development, doctor, export, and native wrappers. MOBILE-001-G verified the Android native run, and MOBILE-001-H verified iOS and reran Android on the final files. MOBILE-001-F added mobile `test` (`jest`) with root `test:mobile` and `test`. CONTRACT-001-A added the first contract schemas (common values and errors), contracts `test` (Vitest) and root `test:contracts`; CONTRACT-001-B added the location and user schemas, and CONTRACT-001-C the authentication schemas. Do not create success-only placeholders for unavailable commands.

Review workspace setup after MONO-001-E and the shell after MOBILE-001-H. Android and iOS development-build checks are separate required assignments; missing native verification stays unresolved. The shell's auth/private/settings/scenario routes are inert navigation placeholders (MOBILE-001-D/E). Outside development builds (`__DEV__` false), `/dev/scenarios` shows an unavailable state instead of its placeholder. Real session, membership, configuration, and scenario behavior remain in their later roadmap tasks.

## Shell checkpoint (MOBILE-001-H, completed 2026-10-30)

Use Node 24.17.0 and the native commands in [TOOLCHAIN.md](TOOLCHAIN.md#native-prerequisites).

- **iOS (iPhone 17 Pro, iOS 26.5):**
  - Cold launch opens anonymous home.
  - The sign-in sheet works through phone → code → Back → phone, and Close works from either step.
  - Swiping the sheet down dismisses it from either step, and the next Sign in starts again at the phone step.
  - Links to the code step work warm and cold. A cold link arrives after you choose the recent server in the development client's list.
  - The group, chat, settings, and scenario pages show their unavailable states, and the edge swipe goes back.
  - Status-bar content is dark.
- **Measuring the bottom inset:** content is vertically centered, so screenshots can't show the top inset. The bottom inset can be measured: read the simulator screenshot (`xcrun simctl io <device> screenshot`) and take the gap between the lowest full-width button and the screen edge. It should be 58 points (34 inset + 24 padding) on every screen, including a freshly opened sheet.
- **Android (Pixel 9 Pro XL emulator, Android 16):** the MOBILE-001-G procedure below was rerun on the final files, and every check passed.

Fonts are embedded at build time (UI-001-A), so rebuild both development clients after changing `assets/fonts` or the `expo-font` plugin list. An older build silently shows the system font.

**UI component checks (VERIFY-001, 2026-10-31):** components without a real screen are checked through a temporary development-only route (VERIFY-001 used `app/dev/ui-sample.tsx`, opened with `ride-match://dev/ui-sample`, and removed it afterwards; the work log lists its contents). Check fonts at default and enlarged text, each keyboard type, focus borders, code paste, the selector's checked state, sheet opening, sizing and closing, busy refusal, error display, and that actions stay above the keyboard in a sheet and in a `scroll`/`footer` `Screen`. Emulator and simulator setup for keyboards, enlarged text and screen readers is in [TOOLCHAIN.md](TOOLCHAIN.md#native-prerequisites).

Online `pnpm doctor:mobile` depends on Expo's current patch list, so it can start failing without any repository change (see TOOLCHAIN). Align the reported patches only when authorized, rerun both native builds afterwards, and never exclude packages or treat exports as native evidence.

## Configuration

| Configuration | Use |
| --- | --- |
| `EXPO_PUBLIC_DATA_SOURCE=mock` | Select the mock data source centrally. Implemented (DATA-001-A): `mock` or `api`; `api` shows a configuration error |
| `EXPO_PUBLIC_MOCK_SCENARIO=active-neighborhood` | Initial deterministic scenario. Implemented: required with `mock`, a lowercase hyphenated key; the simulator (MOCK-001) rejects keys it does not know |
| `EXPO_PUBLIC_APP_ENV=development` | Environment/demo labeling and analytics segregation. Implemented: `development`, `preview` or `production` |
| Restricted Google Maps native build configuration | Android map provider; configure/restrict credential for the application |
| Future `EXPO_PUBLIC_API_BASE_URL` | Future adapter only; no API transport implemented now |

**Configuration files (DATA-001-A):** `apps/mobile/.env` (committed) sets the three public variables to the development values above. Override them in `apps/mobile/.env.local` (ignored) or the shell, then restart Metro: Expo reads `.env` when Metro starts and inlines `EXPO_PUBLIC_` values into the bundle. `src/config/appConfig.ts` validates them, with no defaults. A missing or invalid value, or `api`, replaces every route with a "This build can’t start" screen that names the variable; it never falls back to another data source. Jest loads no `.env`: `tests/setup/publicEnvironment.ts` sets the same development values. No credentials exist.

Public Expo variables are not secrets. API mode must fail clearly until implemented, never silently switch to synthetic riders. The scenario picker is limited to development/preview mock builds.

Store future refresh credentials through SecureStore; keep access token in memory. Keep demo and production credential namespaces separate. Scenario reset clears demo state and this app's demo credentials only. No tokens or sensitive payloads in logs.

## Test strategy

Use Vitest for schema/contract checks, Jest with jest-expo and React Native Testing Library for feature behavior, and a small Maestro suite for native flows. Two test environments serve different needs: pure TypeScript contracts and Expo/native component integration. [Expo unit testing](https://docs.expo.dev/develop/unit-testing/)

| Layer | Important checks |
| --- | --- |
| Contracts | Invalid inputs, strict public/private fields, discriminated events/notifications, error envelopes |
| Mock operations | Expiry, capacity, atomic joining, idempotency, permissions, block effects |
| Feature integration | Auth continuation, create/cancel, match UI, joining, chat retries |
| Synchronization | Duplicate/out-of-order events, reconnect, logout/private-cache clearing, revocation |
| Native integration | Permission fallback, map gestures/markers, keyboard/sheets, local notification entry, taxi handoff |

Inject clocks and use deterministic failures. Advance fake time instead of sleeping in unit/integration tests. Test behavior, not copies of implementation details. Avoid exhaustive snapshots of trivial UI.

**Current contracts harness (CONTRACT-001-A):** Vitest 5 runs `packages/contracts/tests/**/*.test.ts` in Node against the source (`../src/index.js`), so `pnpm test:contracts` needs no build. `tests/common.test.ts` covers IDs, timestamps, resource versions, operation IDs, cursors and the success envelope; `tests/errors.test.ts` covers the error body and field errors. CONTRACT-001-B added `tests/location.test.ts` (coordinates, exact input, freshness, owner, public and meeting-point locations, at their policy boundaries) and `tests/users.test.ts` (public and current user), plus single-line text cases in `tests/common.test.ts`. CONTRACT-001-C added `tests/auth.test.ts` (phone number, code, challenge, credentials, session, refresh and logout, including the cross-field time rules and private fields) and the OTP error codes in `tests/errors.test.ts`. CONTRACT-002-A added `tests/places.test.ts` (place, search input and results) and coarse-coordinate cases in `tests/location.test.ts`. CONTRACT-002-B added `tests/rides.test.ts` (public and owner requests, lifecycle group rule, create and cancel inputs, a create-match-expire walkthrough), `tests/nearby.test.ts` (viewport, query, item union, snapshot consistency), `tests/matches.test.ts` and `tests/groups.test.ts` (group preview, join targets). CONTRACT-003-A extended `tests/groups.test.ts` (member-only group invariants, members, closure, join, leave and status inputs and results, and a formation → last seat → leave → closure walkthrough). CONTRACT-003-B added `tests/chat.test.ts` (text bounds, message, send input, history modes, page consistency, and a send → retry → scroll back → catch up walkthrough). CONTRACT-003-C added `tests/safety.test.ts` (report reasons, details, context, input and receipt; block input and result; block-list query and page; and a report → block and leave → unblock walkthrough) and multi-line text cases in `tests/common.test.ts`. CONTRACT-004-A added `tests/realtime.test.ts` (audiences, each event with its mixed public/private failures, the per-subscription unions, subscription request, acknowledgement and unsubscribe, and a join → chat → block-and-leave event walkthrough). CONTRACT-004-B added `tests/notifications.test.ts` (the four payloads, kinds, envelope and lifetime failures on `expiresAt`, private content rejected from every payload, installation ID, Expo push token, platform, permission, registration input and receipt, and a registration and match → chat notification walkthrough). 860 tests. Each schema gets accepted and rejected examples, including unknown fields, which strict object schemas reject. `tests/tsconfig.json` makes `pnpm typecheck` and lint cover the tests.

**Current mobile harness (MOBILE-001-F):** Jest 29 with `jest-expo` and Testing Library 14 runs `apps/mobile/tests/**/*.test.ts?(x)`. `tests/navigation.test.tsx` renders the real `app/` routes through `tests/helpers/renderApp.ts` (Expo Router's `renderRouter`), and `tests/ui.test.tsx` covers `Button` (enabled, disabled, busy), `IconButton` (name, hidden icon, 48-point target, disabled, busy), and `Screen`'s safe-area padding (under a `SafeAreaProvider` with fixed `initialMetrics`). `tests/fields.test.tsx` covers the field components' labels, errors and announcements, counter, Clear, digit-only paste, and radio-group selection. `tests/layout.test.tsx` covers the form layout (footer and top inset outside the scroll view), `SheetHost` (closing requests, the not-dismissible state, focus return on iOS and Android) and `ConfirmAction` (choice, busy, announced error). `tests/ui.test.tsx` also checks that `Button` sets its label as the explicit accessible name. DATA-001-A added `tests/dataSource.test.tsx`: configuration validation (every variable, empty values, all problems at once), the central selection (`api` refused without calling the simulator), the stand-in data source's eight namespaces and 26 rejecting operations, the composition result, `useDataSource()`, and the root layout showing the configuration error for `api` and for a missing scenario. DATA-001-B added `tests/dataQueries.test.tsx` (keys that separate viewers and parameters, removal by viewer and by group, the previous viewport's read aborted when the map moves and the last on unmount, failures arriving in Query as `DataError`s, error bodies validated against the contract, normalization, and the retry policy) and `tests/importBoundary.test.ts` (ESLint fails a controlled simulator import from a feature, a route, a UI component and the data layer, and allows the composition root and the simulator). Test Query clients set `gcTime: Infinity`, so no cache timer keeps Jest running. 105 tests in total. `jest.config.js` sets `clearMocks`, because React Native's preset shares mocks such as `AccessibilityInfo`'s across tests. Route tests run under the fake timers `renderRouter` enables; each one ends with no pending timer. To test non-development behavior, override only `isDevelopmentMode()` (Jest runs with `__DEV__` true). The suites load `@ride-match/contracts` from its built `dist/`, so run them through `pnpm test:mobile` or `pnpm test`, which build it first. Jest cannot check native modal presentation, gestures, keyboards, screen-reader focus, or safe areas; those are native checks (Android in MOBILE-001-G, iOS in MOBILE-001-H).

**Android development-build check (MOBILE-001-G):** run `pnpm mobile:android` with a booted emulator and the variables from [TOOLCHAIN.md](TOOLCHAIN.md#native-prerequisites). Exercise home, Sign in → phone → code → Back, Android back on each step, Close from each step, and direct entry through `adb shell am start -a android.intent.action.VIEW -d ride-match://auth/otp com.ridematch.dev`, both while the app is open and after `adb shell am force-stop com.ridematch.dev`. After a force-stop, the development client first shows its server list; choose the recent server. Known development-build limitation (MOBILE-001-H): the first link sent right after Android back closed an app that had been loaded from the server list sometimes opens home instead of the target. That happened in 2 of 3 tries on 2026-10-30 and in 1 of 2 earlier the same day; later links in the same process worked. To test a route, bring the app to the foreground before sending the link. Production link handling is planned with the notification and deep-link work. Check `adb shell dumpsys package com.ridematch.dev` for runtime permissions. Stop Metro, run `./gradlew --stop` in `apps/mobile/android`, and shut down the emulator afterwards. Record the OS and API level, not device identifiers or the development server's address.

Native-map component mocks can verify selection and accessibility but cannot validate actual map rendering. Perform real simulator/device checks and record device/platform/version and relevant limitations. Test a 100-item discovery scenario for pan/tap responsiveness and avoid idle rerender loops or repeated camera jumps.

## Priority end-to-end flows

1. Anonymous browse -> destination -> auth -> create -> match -> group -> chat -> meeting point.
2. Empty map and denied/unavailable location.
3. Last-seat conflict and simultaneous join.
4. Expiration in foreground and after background return.
5. Failed message retry, duplicate delivery, and missed-message catch-up.
6. Leave/block/report with access removal.
7. Warm/cold notification entry with valid and stale targets.
8. Taxi handoff and provider-unavailable fallback.
9. Session expiry with successful and failed refresh.

## Analytics boundary

Use typed `analytics.track(...)` events with bounded properties. Initially use an in-memory/no-op sink, inspectable in development. No vendor integration or external transmission is required.

| Event | Exact trigger |
| --- | --- |
| `app_opened` | Start of a defined foreground session |
| `map_opened` | Main map first becomes visible in that session |
| `nearby_activity_exposed` | Fresh successful discovery renders; record zero/nonzero and count bucket |
| `nearby_marker_seen` | Peer marker visible for a minimum dwell; deduplicate per session |
| `nearby_marker_tapped` | Peer marker tap |
| `destination_selected` | Search suggestion confirmed |
| `ride_request_create_clicked` | User confirms creation intent |
| `ride_request_created` | Canonical create succeeds |
| `ride_request_expired` | Authoritative expiry observed, once per request |
| `match_found` | New valid match observed, once per match/version |
| `group_join_clicked` | Join intent confirmed |
| `group_joined` | Canonical membership succeeds |
| `group_leave_clicked` | Leave intent confirmed |
| `group_left` | Canonical removal succeeds |
| `message_send_clicked` | User submits text |
| `message_sent` | Canonical message accepted |
| `meeting_point_viewed` | Meeting-point detail opened |
| `taxi_open_clicked` | External handoff requested |
| `taxi_opened` | OS accepts handoff; not proof of native opening or booking |
| `ride_completed` | Explicit completion mutation succeeds |
| `user_reported` / `user_blocked` | Corresponding operation succeeds |

Properties may include environment, application version, mock scenario ID, session ID, and pseudonymous installation/user identity. Do not accept unrestricted metadata. Exclude phone numbers, coordinates, destination search text, messages, report content, and credentials. Never emit success solely because a button was pressed.

Session/dwell thresholds should be defined and tested in ANALYTICS-001. Synthetic scenario traffic must remain distinguishable and excluded from future real-user metrics.

## Retention hypothesis

Hypothesis: users exposed to at least one nearby active ride engage and return more often than users seeing an empty map.

- Cohort by the first eligible successful map exposure, not a failed or loading screen.
- Distinguish zero visible peer activity from at least one visible peer activity item.
- Exclude own markers, stale data, failed loads, and mock sessions.
- Track clustered visible activity for the exposure metric without inventing individual marker impressions.
- D1/D7 are return sessions on UTC calendar day 1/day 7 after cohort entry.
- Preserve anonymous-to-authenticated association with pseudonymous IDs, never phone numbers.
- Instrumentation is verifiable now; actual retention requires a future analytics destination and real users.

## Mobile MVP completion criteria

The complete development-build demonstration is:

```text
Open anonymously -> nearby activity -> destination -> authentication gate
-> create request -> simulated match -> inspect rider -> join/form group
-> text chat -> meeting point -> ready -> Yandex Go/fallback
```

Also demonstrate honest empty state, location fallback, expiration across backgrounding, group-full/concurrent-join conflict, stale/offline resync, failed/duplicate chat recovery, leave/report/block, valid/stale notifications, and explicit group completion.

Technical completion requires:

- No feature imports of mock fixtures or infrastructure.
- Public/private location and group-access boundaries verified.
- Session changes clear private data.
- Schema, feature, and synchronization tests pass.
- Typecheck, lint, Expo doctor, and both platform exports pass.
- Native map, location, notifications, and taxi flows checked on supported platforms; limitations recorded.
- No unintended listeners/timers survive resets or screen lifecycle changes.
- API operations/events and actual mock behavior agree.
- Demo data is clearly identified; no claims of real riders, production matching, real SMS, or remote push.

## Documentation and code comments

After each meaningful task, update the relevant spec, [ROADMAP.md](ROADMAP.md), [WORK_LOG.md](WORK_LOG.md), and [AI_CONTEXT.md](AI_CONTEXT.md). Use the [handoff template](AI_WORKFLOW.md#handoff-entry-template) to record actor/session, working copy, actual changes, checks/results, unfinished criteria, and next concrete step. Keep future work labeled planned and release ownership when handing off. Neither assistant should rely on the other's private chat or memory.

Add useful TSDoc to public/reusable hooks, data-source operations, transformations, and native/external boundaries. Document privacy, authorization, side effects, idempotency, or lifecycle assumptions where relevant. Do not bulk-comment obvious code.
