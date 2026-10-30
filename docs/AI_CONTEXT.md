# AI context

Last updated: 2026-10-30

## Purpose and state

- Ride Match: map-first discovery of nearby compatible ride intentions, groups of up to four, temporary text chat, shared meeting point, external Yandex Go handoff.
- **Implemented:** Documentation baseline, shared Codex/Claude Code instructions, the toolchain record [TOOLCHAIN.md](TOOLCHAIN.md) (MONO-001-A), and the root pnpm workspace (MONO-001-B): root `package.json` (`packageManager` pnpm 11.28.2, `engines` Node `^24.17.0`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`, exact saves, `engineStrict`), `.nvmrc`, `.gitignore`, root `README.md`, and `pnpm-lock.yaml` with root dev tools (Turbo 2.11.6, TypeScript 6.0.3, ESLint 9.39.5, `@eslint/js`, `typescript-eslint`). MONO-001-C added `packages/contracts` (`@ride-match/contracts`, private ESM, `exports` `types`/`default` to `dist/`, scripts `build`/`dev`/`typecheck`, TypeScript 6.0.3 only, empty `export {}` entry) and root `pnpm build:contracts`. MONO-001-D added root `eslint.config.mjs` (`@eslint/js` recommended plus `typescript-eslint` `recommendedTypeChecked` for `packages/contracts/**/*.ts`, `no-explicit-any` error; ignores `dist`, `node_modules`, `apps/`), contracts `lint` (`eslint .`, ESLint 9.39.5), and root `typecheck`/`lint`. MONO-001-E added root `turbo.json` (`build` → `dist/**` after `^build`; non-emitting `typecheck`/`lint` after `^build`, lint also hashing the root ESLint config; persistent uncached `dev`; `ui: tui`; `agentGuidance: false` so Turbo never edits `AGENTS.md`; local cache only) and routed `build:contracts`, `typecheck`, and `lint` through `turbo run`. MOBILE-001-A added `apps/mobile`. It is `@ride-match/mobile`, with `main: expo-router/entry` and scripts `start`/`typecheck`/`lint`. Its exact Expo SDK 57 dependencies include four pins that make transitive peers resolve at Expo versions: reanimated 4.5.1, worklets 0.10.1, `react-dom` 19.2.3, and `@react-native/metro-config` 0.86.3. It also has `app.config.ts` (provisional `com.ridematch.dev`, scheme `ride-match`, typed routes off), the TOOLCHAIN tsconfig, Expo flat lint with `no-explicit-any` for TS files, an anchored `.gitignore`, a root `Stack`, and `/` rendering `MapPlaceholderScreen` (static “Ride Match” / “Map coming soon”). `pnpm-workspace.yaml` has `allowBuilds: { unrs-resolver: false }`. MOBILE-001-B added:
  - The mobile dependencies `@ride-match/contracts: workspace:*` and `expo-doctor` 1.20.4 (dev).
  - A temporary `src/bootstrap/checkContractsPackage.ts` (side-effect import, imported by `app/_layout.tsx`; remove it when real code imports a contract).
  - Mobile scripts `dev`, `android`, `ios`, `export:android`, `export:ios`, and `doctor`.
  - Root scripts `dev` (`turbo run dev --filter=@ride-match/mobile`), `dev:mobile`, `doctor:mobile`, `export:android`/`export:ios`, and `mobile:android`/`mobile:ios`. The doctor script is `doctor:mobile` because pnpm 11's built-in `pnpm doctor` shadows a root `doctor` script.
  - In `turbo.json`, `@ride-match/mobile#dev` with `dependsOn: ["^build"]`, `with: ["@ride-match/contracts#dev"]`, and an evidence-based `passThroughEnv`: `EXPO_*`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `REACT_NATIVE_PACKAGER_HOSTNAME`, `RCT_METRO_PORT`, `EDITOR`, `VISUAL`, `HTTP_PROXY`, `TMPDIR`.
  - MOBILE-001-C added `src/ui/Screen.tsx` and `src/ui/Button.tsx`, and the map placeholder now renders inside `Screen`.
    - `Screen` has a typed `edges` prop (default: all four) and 24-point padding on top of the insets. Since MOBILE-001-H it is a `View` padded with the `SafeAreaProvider`'s insets (`useSafeAreaInsets`) rather than a native `SafeAreaView`. The insets are the window's and are not reduced for the screen's position, so callers omit edges owned by a visible native header or an iOS modal sheet.
    - `Button` has `label`, `onPress`, optional `disabled` (Pressable reports it to screen readers), and optional `accessibilityLabel`, with a 48-point minimum height. It has no consumer until MOBILE-001-D.
  - MOBILE-001-D added the auth placeholders.
    - The root `Stack` has `unstable_settings.anchor: 'index'`, and `auth` is presented as a `modal` without a header.
    - `app/auth/_layout.tsx` is a headerless `Stack` with `anchor: 'phone'`. The `phone` and `otp` routes are thin and wire `router.push('/auth/otp')`, `router.dismissTo('/auth/phone')` (Back), and `router.dismissTo('/')` (Close).
    - `src/features/auth/AuthPlaceholderScreens.tsx` has `PhonePlaceholder`/`OtpPlaceholder` with “not available yet” copy and `Screen` edges that omit `'top'` on iOS.
    - Home has a temporary “Sign in” `Button` (`onSignIn` prop) that AUTH-001 replaces with protected-action gating.
  - MOBILE-001-E added inert shells for the remaining planned routes.
    - `app/groups/[groupId]/{index,chat}.tsx` and `app/settings.tsx` render `src/ui/UnavailableScreen.tsx` (title, “not available yet” message, one “Go to map” `Button` wired to `router.dismissTo('/')`). The group routes never read `groupId`. Home does not link to any of them.
    - `app/dev/scenarios.tsx` calls `isDevelopmentMode()` (`src/config/isDevelopmentMode.ts`, returns `__DEV__`) at render time: development builds get an inert “Mock scenarios” placeholder, other builds an unavailable state, never a redirect. DATA-001 replaces the check with validated environment/data-source gating.
    - The root `Stack` now sets `screenOptions={{ headerShown: false }}`; every screen draws its own title and actions, and the anchor puts home beneath any direct entry.
  - MOBILE-001-F added the behavior-test harness.
    - Mobile dev dependencies: Jest 29.7.0, `jest-expo` 57.0.5, `@types/jest` 29.5.14, Testing Library 14.0.1, `test-renderer` **1.2.0** (1.3.0 pulls `react-reconciler` 0.34, which needs React 19.3), `@react-native/jest-preset` 0.86.3, and `@babel/runtime` 7.29.7 (Jest-transformed files import its helpers; undeclared, they loaded from `/Users/home/node_modules`).
    - `apps/mobile/jest.config.js` (`preset: 'jest-expo'`, `testMatch` `tests/**/*.test.ts?(x)`, preset's own pnpm-aware `transformIgnorePatterns`), no `babel.config.js`, mobile tsconfig `types: ["jest"]`.
    - Scripts: mobile `test` (`jest`), root `test:mobile` (`pnpm build:contracts && pnpm --filter @ride-match/mobile test`, arguments forwarded), root `test` (`turbo run test`; `turbo.json` `test` after `^build`).
    - `tests/navigation.test.tsx` (14 tests) renders the real `app/` through `tests/helpers/renderApp.ts` (`renderRouter`); `tests/ui.test.tsx` (2 tests) covers `Button`. Each router test ends with no pending fake timer.
  - MOBILE-001-G verified Android and made one app-config fix.
    - `app.config.ts` now has `plugins: [['expo-status-bar', { style: 'dark' }]]`. Without it, Android's edge-to-edge status bar kept white icons on the white screens. On iOS it sets `UIStatusBarStyle` to dark content, which MOBILE-001-H must check.
    - `pnpm mobile:android`, with the per-command Android variables, generates the untracked `apps/mobile/android/`, builds and installs the debug app, and opens it on the `Pixel_9_Pro_XL` emulator (Android 16, API 36). On the device, the checks covered cold launch, home, sign-in navigation, Android back, Close, direct-entry fallback, the inert routes, and permissions. No runtime permission was requested. Details are in `WORK_LOG.md`.
    - pnpm auto-installed `react-native-gesture-handler` 3.3.0, a required peer of an `expo-router` dependency, back in MOBILE-001-A, while Expo SDK 57 expects `~2.32.0`. TOOLCHAIN-001-A decided it (see below).
  - MOBILE-001-H verified iOS, reran Android, and finished the shell checkpoint (2026-10-30; it was started by Codex on 2026-10-10 and finished by Claude Code).
    - **Expo patches:** realigned to online `expo-doctor` at the user's request. The current pins are `expo` 57.0.31, `expo-constants` 57.0.22, `expo-dev-client` 57.0.20, `expo-linking` 57.0.13, `expo-router` 57.0.29, and `jest-expo` 57.0.6. Codex's 2026-10-10 alignment was overtaken by Expo releases published October 12–21.
    - **`src/ui/Screen.tsx`:** pads from `useSafeAreaInsets()`. The native `SafeAreaView` measured while the iOS sign-in sheet slid in, so each freshly opened sheet lost its 34-point bottom inset. `tests/ui.test.tsx` gained two `Screen` padding tests, for 18 tests in total.
    - **iOS (iPhone 17 Pro, iOS 26.5):** build, cold launch, sign-in sheet, Back, Close, native swipe dismissal, warm and cold links, inert routes, edge swipe-back, dark status bar, and the 58-point bottom gap on every screen all pass.
    - **Android (Android 16 emulator):** the G checks were rerun on the final files and all pass.
    - **Known development-client limitation:** on Android, the first link right after back closed a server-list-loaded app sometimes opens home (see DEVELOPMENT).
- No contract schemas, domain or backend code, or contract tests.
- `apps/api/` is empty. Preserve unrelated files; do not populate `apps/api/` during the mobile milestone.
- TOOLCHAIN-001-A pinned `react-native-gesture-handler` at **2.32.0** as a direct mobile dependency, so pnpm stops auto-installing 3.x for `react-native-drawer-layout`'s required peer. The quick dependency checks pass; tests, exports and native rebuilds are deferred (see TOOLCHAIN).
- UI-001-A added the UI foundation.
  - `src/ui/tokens.ts` holds the palette, spacing, radii, `MANROPE` face names, and the `typography` variants (display, heading, section, subheading, body, label, small).
  - `src/ui/AppText.tsx` renders `variant` and `color` and never sets `fontWeight`. The map, sign-in, and unavailable screens use it; `Button` is unchanged until UI-001-B.
  - Static Manrope 400–800 is in `assets/fonts/` with `OFL.txt`, from `@expo-google-fonts/manrope` 0.4.3. The files are named by PostScript name and embedded by the `expo-font` 57.0.4 config plugin.
  - The Along mark is in `assets/brand/` (SVG plus 1x/2x/3x PNGs) and is not displayed yet.
  - Typecheck, lint, and doctor pass. Tests, exports, and native font inspection are deferred.
- UI-001-B (`Completed`) added the core controls.
  - `Button` has primary, secondary, ghost, and danger variants, the design's disabled look, and `busy`, which shows a spinner, reports busy and disabled, and blocks repeat presses. It is at least 52 points tall and grows with its label.
  - New: `IconButton` (48-point square, required `accessibilityLabel`, caller-supplied icon hidden from screen readers, `soft`/`white` tones, disabled/busy), `Badge` (neutral, success, warning, danger), and `Notice` (neutral, warning, danger).
  - `tokens.ts` gained `dangerSoft` and `warningSoft`.
  - No icon renderer is installed yet; the first card that draws real icons chooses one.
  - 23 mobile tests pass.
- MONO-001 and MOBILE-001 are `Completed` in [ROADMAP.md](ROADMAP.md), and all 13 [FIRST_STEPS.md](FIRST_STEPS.md) children are `Completed`. TOOLCHAIN-001-A and UI-001-A, and their parents TOOLCHAIN-001 and UI-001, are `Paused`, waiting for the deferred verification. UI-001-B is `Completed`. The next card in [MOBILE_IMPLEMENTATION_PLAN.md](MOBILE_IMPLEMENTATION_PLAN.md) is UI-001-C, only when requested.
- Sequence: mock mobile MVP -> contract review -> future backend -> future HTTP/Socket.IO adapter.

## Shared handoff and active work

- Active implementation: **None.** UI-001-B (Claude Code / ui-controls, 2026-10-30) is `Completed` with ownership released. UI-001-A and TOOLCHAIN-001-A stay `Paused` for the deferred verification pass.

- Latest implementation handoff: **MOBILE-001-H — Completed**, Claude Code / h-finish (2026-10-30), shared `main` at `19e345c`; committed on top of it at the user's request.
  - **Native evidence:** iOS (iPhone 17 Pro, iOS 26.5) and Android (Pixel 9 Pro XL emulator, Android 16) were rebuilt from clean native directories on the final files. Every card check passed, including native swipe dismissal and safe areas.
  - **Final checkpoint:** frozen install, build, typecheck, lint, 18 tests, online doctor at 21/21, both exports, and `git diff --check` all pass.
  - **Changes (user-authorized):** the Expo patch alignment and the `Screen` safe-area fix.
  - **Generated, ignored:** `ios/` and `android/`. The details are in WORK_LOG.

- Prompt handoff: **DOC-004 — Completed**, Codex / one-task-prompt (2026-10-10); ownership released. [One-task session prompt](MOBILE_IMPLEMENTATION_PLAN.md#prompt-for-later-child-cards) accepts NEXT or an exact child ID, verifies prerequisites/ownership, updates shared docs and stops after one child or blocker. No implementation status changed. (H has since been completed.)
- Plan handoff: **DOC-003 — Completed**, Codex / save-along-plan (2026-10-10); ownership released. [MOBILE_IMPLEMENTATION_PLAN.md](MOBILE_IMPLEMENTATION_PLAN.md) saves all 55 screens, UI/state rules and 65 bounded assignments (H plus 64 later Planned cards). It owns later child statuses; FIRST_STEPS still owns H. TOOLCHAIN/UI extensions and ready-point policy are explicit proposals; no implementation or dependency decision was executed. (H has since been completed; TOOLCHAIN-001-A is next.)
- Entry points: [AGENTS.md](../AGENTS.md) contains shared rules; [CLAUDE.md](../CLAUDE.md) imports them for Claude Code.
- Both assistants use [AI_WORKFLOW.md](AI_WORKFLOW.md), this file, the roadmap, relevant specs, and [WORK_LOG.md](WORK_LOG.md) as shared project memory. Private chat/memory is not a substitute.
- Active task/owner: **None; ownership released. DESIGN-001 paused for the user's native test of importer 1.0.1.** Codex / along-importer-repair fixed duplicate flow registration, parent-container rollback and stale IDs from sample pruning; regenerated plugin/ZIP. Regression checks pass for 55 screens, 17 components and 192 links. User reported the previous native failure; repaired native import/visual/prototype acceptance is unverified. Along is open in desktop; automated manifest picker input failed, and the user chose to test the package themselves. Next: reopen build 1.0.1, import/review six-screen sample, remove sample, import/review full design and save report. Preserve original draft, application code, MOBILE-001-G changes and unrelated files.
- Latest handoff: UI-001-B (Claude Code / ui-controls, 2026-10-30) in `WORK_LOG.md`; before it, UI-001-A, TOOLCHAIN-001-A, and MOBILE-001-H. The latest native design handoff remains DESIGN-001 (2026-10-04). `FIRST_STEPS.md` owns the original 13 child assignments, and all are `Completed`. Terra records its actor as `Codex (Terra)`.
- DESIGN-001 continuation retry (2026-10-03): account inspection succeeded, but read-only canvas access still hit the Starter MCP limit; browser tab was signed out. No remote edits or fresh native inventory verification. Resume from saved IDs when MCP access is available.
- Working copy: `main`; MONO-001-A is `2f35ea5`, MONO-001-B is `87bb91c`, MONO-001-C is `46a6865`, MONO-001-D is `f5a6c93`, MONO-001-E is `2e93390`, MOBILE-001-A is `c924bf1`, MOBILE-001-B is `2a4906a`, MOBILE-001-C is `76c8477`, MOBILE-001-D is `99d3572`, MOBILE-001-E is `243a715`, and MOBILE-001-F is `85f38aa`. Two Codex commits follow: `fd32dda` (DESIGN-001) and `19e345c` (DOC-003/DOC-004, which also carried the MOBILE-001-G write-up). `475e662` holds G's `app.config.ts` status-bar plugin and all MOBILE-001-H changes. None are pushed. TOOLCHAIN-001-A is `b4bb17f`. UI-001-A is `619b134`. UI-001-B is the following commit. Preserve unrelated untracked `.idea/` files.
- Local environment decisions (user, 2026-10-03; details in `TOOLCHAIN.md`): Node 24.17.0; the user-approved `corepack enable pnpm` ran in the Node 24.17.0 installation during MONO-001-B. The checkout stays in MEGAsync; the user adds exclusions for generated `dist/`, `android/`, and `ios/` paths. Ancestor home-folder packages stay; the repository relies on guards (explicit tsconfig `types`, compiler file-list check, `require.resolve` check). Reminder: `packages/contracts/dist/` and the generated `apps/mobile/android/` and `apps/mobile/ios/` now exist, and exports recreate `apps/mobile/dist/`. The sync-root rules did not exclude them when last checked (MEGAsync was not running), so the user still needs to add those exclusions. Existing rules already skip most of `android/` and `ios/`; see TOOLCHAIN. In Claude Code's shell, run `export NVM_DIR="$HOME/.nvm" && nvm use` before pnpm (Node 22 is the default; `engineStrict` refuses installs on it). Turbo and Expo CLI anonymous telemetry are still enabled by default for the user. Assistants set `TURBO_TELEMETRY_DISABLED=1` and `EXPO_NO_TELEMETRY=1` (plus `CI=1` for Expo) only in their own commands; disabling telemetry globally is the user's choice. Run Expo only from `apps/mobile`.
- Next concrete step: when the user asks, run one deferred verification pass covering TOOLCHAIN-001-A and UI-001-A.
  - **Commands:** `pnpm test:mobile`, typecheck, lint, both exports, then Android and iOS rebuilds from clean native directories (the TOOLCHAIN commands).
  - **Shell flows:** recheck navigation, swipe and back, links, inert routes, safe-area gaps, and permissions (DEVELOPMENT procedures).
  - **Fonts:** inspect each Manrope weight on both platforms. Headings must not clip at default and enlarged text, and there must be no startup font error.
  - **After it passes:** mark both cards and their parents `Completed`.
  - **Otherwise:** UI-001-C is next, only when requested.
  - Keep per-step checks minimal; the user prefers heavy verification in one later pass.
- Before any takeover, inspect current files and latest task handoff. Use one writer at a time in this directory; ownership notes do not synchronize separate checkouts.

## Planned stack and boundaries

- pnpm workspaces, Turborepo, TypeScript; Expo/React Native development builds; Expo Router. Exact versions: [TOOLCHAIN.md](TOOLCHAIN.md) (Node 24.17.0, pnpm 11.28.2, Expo SDK 57 / React Native 0.86.3 / React 19.2.3, TypeScript 6.0.3, Turbo 2.11.6, ESLint 9.39.5, Jest 29.7.0).
- `react-native-maps`: Apple Maps on iOS, Google Maps on Android; verify local coverage and native configuration early.
- TanStack Query for remote-like state; local React state/reducers for presentation. No Redux/Zustand by default.
- One `AppDataSource` boundary: feature hooks -> typed operations/events -> in-memory mocks now, HTTP/Socket.IO later.
- Only shared package: `packages/contracts`, with Zod schemas and inferred DTOs. No UI, database types, services, or backend-only algorithms.
- Native boundaries: foreground location, SecureStore, local notifications, Yandex Go link, typed vendor-neutral analytics.

## Planned structure

- `apps/mobile/app/`: thin routes/layouts.
- `apps/mobile/src/features/`: auth, map, destinations, rides, groups, chat, safety.
- `apps/mobile/src/data/`: boundary, query keys, event synchronization, simulator/scenarios.
- `apps/mobile/src/platform/`: location, storage, notifications, taxi.
- `apps/mobile/src/analytics/`: event schema and in-memory/no-op sink.
- `packages/contracts/src/`: transport schemas and types.
- See [ARCHITECTURE.md](ARCHITECTURE.md) and [api/overview.md](api/overview.md).

## Domain decisions to validate

- Anonymous browsing; authenticate create, join, and send actions. Mock phone/OTP only.
- One live request and one group per user; one user occupies one seat; group capacity four.
- Request: `active | grouped | expired | cancelled | completed`; active lifetime 15 minutes; departure Now/+5/+10 minutes.
- Group: `forming | ready | completed | cancelled`; proposed lifetime 30 minutes. Coordinator marks ready with at least two members and a meeting point.
- Solo-to-group join is atomic. Last-seat conflict must yield one success; retries are idempotent.
- Grouped requests follow group lifetime. Leaving cancels the leaver's request; fewer than two members cancels the group. Never silently recreate a request.
- Terminal group history is read-only for one hour; former members lose access immediately on leaving.
- REST snapshots are authoritative; events synchronize/invalidate queries with ID/version deduplication and reconnect resync.
- Matching and walking estimates are supplied mock results, not client routing algorithms.

## Privacy and safety

- Separate sensitive `ExactLocationInput`, approximate `PublicLocationDto`, and authorized shared `MeetingPointDto`.
- Public ride/group responses contain neither exact rider origin nor private destination coordinates; no phone/session/chat details.
- Markers are intentions, not live person tracking. No background GPS.
- No credentials or sensitive content in logs, docs, tests, analytics, or URLs. Taxi links necessarily carry only user-reviewed trip coordinates and must not be logged.
- Refresh credentials use SecureStore; access token stays in memory. Public Expo variables are not secrets.
- Block/report are mocked but enforce observable membership/filtering effects. No actual moderation service.
- Never fake activity in an empty scenario; identify demo data visibly.

## Configuration and checks

- Planned: `EXPO_PUBLIC_DATA_SOURCE=mock`, `EXPO_PUBLIC_MOCK_SCENARIO=active-neighborhood`, `EXPO_PUBLIC_APP_ENV=development`.
- Future API URL is documented only; `api` mode must fail clearly until implemented, never fall back to mocks.
- Google Maps native build configuration will be required. No values have been configured.
- Checks: typecheck/lint (MONO-001) and Jest/React Native Testing Library mobile tests (MOBILE-001-F; 18 since MOBILE-001-H) exist. The Android (MOBILE-001-G, rerun in H) and iOS (MOBILE-001-H) development builds were checked manually on an emulator and a simulator. Vitest contracts and targeted Maestro/native checks are planned.
- Mocks reset on cold reload/scenario reset; foreground resume catches up against timestamps. No persistent fake database.

## Rules for future work

- Read applicable `AGENTS.md`, this handoff, README, roadmap, architecture, shared workflow/latest relevant work-log handoff, affected docs, and any editor/assistant rules before non-trivial changes. Claude's root entry imports the same rules.
- Implement only the requested task; preserve existing behavior; no speculative layers or new packages.
- No backend, database, production matching, mobile routing, payments, AI, social features, background tracking, or multiple taxi providers in this milestone.
- Screens/components must not import mock fixtures. Select transport centrally.
- Add useful JSDoc/TSDoc to reusable logic, lifecycle rules, and integration boundaries; avoid comments that repeat types.
- Update affected specs, [WORK_LOG.md](WORK_LOG.md), roadmap status, and this handoff after meaningful work. Attribute entries to tool/session, record changed files and actual verification, and preserve unfinished criteria plus an exact resume point.
- Final reports: changes, intentionally excluded work, checks/results, documentation, JSDoc/TSDoc, remaining risks/next step.
