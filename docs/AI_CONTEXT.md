# AI context

Last updated: 2026-10-03

## Purpose and state

- Ride Match: map-first discovery of nearby compatible ride intentions, groups of up to four, temporary text chat, shared meeting point, external Yandex Go handoff.
- **Implemented:** Documentation baseline, shared Codex/Claude Code instructions, the toolchain record [TOOLCHAIN.md](TOOLCHAIN.md) (MONO-001-A), and the root pnpm workspace (MONO-001-B): root `package.json` (`packageManager` pnpm 11.28.2, `engines` Node `^24.17.0`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`, exact saves, `engineStrict`), `.nvmrc`, `.gitignore`, root `README.md`, and `pnpm-lock.yaml` with root dev tools (Turbo 2.11.6, TypeScript 6.0.3, ESLint 9.39.5, `@eslint/js`, `typescript-eslint`). MONO-001-C added `packages/contracts` (`@ride-match/contracts`, private ESM, `exports` `types`/`default` to `dist/`, scripts `build`/`dev`/`typecheck`, TypeScript 6.0.3 only, empty `export {}` entry) and root `pnpm build:contracts`. MONO-001-D added root `eslint.config.mjs` (`@eslint/js` recommended plus `typescript-eslint` `recommendedTypeChecked` for `packages/contracts/**/*.ts`, `no-explicit-any` error; ignores `dist`, `node_modules`, `apps/`), contracts `lint` (`eslint .`, ESLint 9.39.5), and root `typecheck`/`lint`. MONO-001-E added root `turbo.json` (`build` → `dist/**` after `^build`; non-emitting `typecheck`/`lint` after `^build`, lint also hashing the root ESLint config; persistent uncached `dev`; `ui: tui`; `agentGuidance: false` so Turbo never edits `AGENTS.md`; local cache only) and routed `build:contracts`, `typecheck`, and `lint` through `turbo run`. MOBILE-001-A added `apps/mobile`. It is `@ride-match/mobile`, with `main: expo-router/entry` and scripts `start`/`typecheck`/`lint`. Its exact Expo SDK 57 dependencies include four pins that make transitive peers resolve at Expo versions: reanimated 4.5.1, worklets 0.10.1, `react-dom` 19.2.3, and `@react-native/metro-config` 0.86.3. It also has `app.config.ts` (provisional `com.ridematch.dev`, scheme `ride-match`, typed routes off), the TOOLCHAIN tsconfig, Expo flat lint with `no-explicit-any` for TS files, an anchored `.gitignore`, a root `Stack`, and `/` rendering `MapPlaceholderScreen` (static “Ride Match” / “Map coming soon”). `pnpm-workspace.yaml` has `allowBuilds: { unrs-resolver: false }`. MOBILE-001-B added:
  - The mobile dependencies `@ride-match/contracts: workspace:*` and `expo-doctor` 1.20.4 (dev).
  - A temporary `src/bootstrap/checkContractsPackage.ts` (side-effect import, imported by `app/_layout.tsx`; remove it when real code imports a contract).
  - Mobile scripts `dev`, `android`, `ios`, `export:android`, `export:ios`, and `doctor`.
  - Root scripts `dev` (`turbo run dev --filter=@ride-match/mobile`), `dev:mobile`, `doctor:mobile`, `export:android`/`export:ios`, and `mobile:android`/`mobile:ios`. The doctor script is `doctor:mobile` because pnpm 11's built-in `pnpm doctor` shadows a root `doctor` script.
  - In `turbo.json`, `@ride-match/mobile#dev` with `dependsOn: ["^build"]`, `with: ["@ride-match/contracts#dev"]`, and an evidence-based `passThroughEnv`: `EXPO_*`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `REACT_NATIVE_PACKAGER_HOSTNAME`, `RCT_METRO_PORT`, `EDITOR`, `VISUAL`, `HTTP_PROXY`, `TMPDIR`.
  - MOBILE-001-C added `src/ui/Screen.tsx` and `src/ui/Button.tsx`, and the map placeholder now renders inside `Screen`.
    - `Screen` is a `SafeAreaView` with a typed `edges` prop (default: all four) and 24-point padding on top of the insets. Callers omit edges owned by a visible native header or an iOS modal sheet; on iOS the insets come from the app-level provider and are not reduced for position.
    - `Button` has `label`, `onPress`, optional `disabled` (Pressable reports it to screen readers), and optional `accessibilityLabel`, with a 48-point minimum height. It has no consumer until MOBILE-001-D.
  - MOBILE-001-D added the auth placeholders.
    - The root `Stack` has `unstable_settings.anchor: 'index'`, and `auth` is presented as a `modal` without a header.
    - `app/auth/_layout.tsx` is a headerless `Stack` with `anchor: 'phone'`. The `phone` and `otp` routes are thin and wire `router.push('/auth/otp')`, `router.dismissTo('/auth/phone')` (Back), and `router.dismissTo('/')` (Close).
    - `src/features/auth/AuthPlaceholderScreens.tsx` has `PhonePlaceholder`/`OtpPlaceholder` with “not available yet” copy and `Screen` edges that omit `'top'` on iOS.
    - Home has a temporary “Sign in” `Button` (`onSignIn` prop) that AUTH-001 replaces with protected-action gating.
- No contract schemas, domain or backend code, or tests.
- `apps/api/` is empty. Preserve unrelated files; do not populate `apps/api/` during the mobile milestone.
- MONO-001 is `Completed` and MOBILE-001 is `In progress` in [ROADMAP.md](ROADMAP.md). MONO-001-A to E and MOBILE-001-A to D are `Completed`. Next planned assignment: **MOBILE-001-E** (inert shells for the other planned routes) from [FIRST_STEPS.md](FIRST_STEPS.md), only when requested.
- Sequence: mock mobile MVP -> contract review -> future backend -> future HTTP/Socket.IO adapter.

## Shared handoff and active work

- Entry points: [AGENTS.md](../AGENTS.md) contains shared rules; [CLAUDE.md](../CLAUDE.md) imports them for Claude Code.
- Both assistants use [AI_WORKFLOW.md](AI_WORKFLOW.md), this file, the roadmap, relevant specs, and [WORK_LOG.md](WORK_LOG.md) as shared project memory. Private chat/memory is not a substitute.
- Active task/owner: **None**. MOBILE-001-D (Claude Code / auth-placeholders) is completed; ownership released.
- Latest handoff: MOBILE-001-D in `WORK_LOG.md`. `FIRST_STEPS.md` splits MONO-001/MOBILE-001 into 13 child assignments; MONO-001-A to E and MOBILE-001-A to D are `Completed`; MOBILE-001-E to H are `Planned`. Terra is a model used through Codex; it records its actor as `Codex (Terra)`.
- Working copy: `main`; MONO-001-A is `2f35ea5`, MONO-001-B is `87bb91c`, MONO-001-C is `46a6865`, MONO-001-D is `f5a6c93`, MONO-001-E is `2e93390`, MOBILE-001-A is `c924bf1`, MOBILE-001-B is `2a4906a`, MOBILE-001-C is `76c8477`, and MOBILE-001-D is the following commit (none pushed). Preserve unrelated untracked `.idea/` files.
- Local environment decisions (user, 2026-10-03; details in `TOOLCHAIN.md`): Node 24.17.0; the user-approved `corepack enable pnpm` ran in the Node 24.17.0 installation during MONO-001-B. The checkout stays in MEGAsync; the user adds exclusions for generated `dist/`, `android/`, and `ios/` paths. Ancestor home-folder packages stay; the repository relies on guards (explicit tsconfig `types`, compiler file-list check, `require.resolve` check). Reminder: `packages/contracts/dist/` now exists, and on 2026-10-03 the sync-root rules did not yet exclude it (MEGAsync was not running); the user still needs to add that exclusion. In Claude Code's shell, run `export NVM_DIR="$HOME/.nvm" && nvm use` before pnpm (Node 22 is the default; `engineStrict` refuses installs on it). Turbo and Expo CLI anonymous telemetry are still enabled by default for the user. Assistants set `TURBO_TELEMETRY_DISABLED=1` and `EXPO_NO_TELEMETRY=1` (plus `CI=1` for Expo) only in their own commands; disabling telemetry globally is the user's choice. Run Expo only from `apps/mobile`.
- Next concrete step: assign **MOBILE-001-E** using the prompt in `FIRST_STEPS.md`. Keep its routes inert, and use `Screen` edges that omit `'top'` under visible native headers. Do not start it automatically. Exports (`pnpm export:*`) recreate `apps/mobile/dist/`, so remind the user about that MEGAsync exclusion. To exercise `pnpm dev` from an assistant shell, use a pseudo-terminal and always confirm no `expo`/`tsc --watch` process is left running.
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
- Planned checks: typecheck/lint, Vitest contracts, Jest/React Native Testing Library mobile, targeted Maestro/native checks. None exist or have run yet.
- Mocks reset on cold reload/scenario reset; foreground resume catches up against timestamps. No persistent fake database.

## Rules for future work

- Read applicable `AGENTS.md`, this handoff, README, roadmap, architecture, shared workflow/latest relevant work-log handoff, affected docs, and any editor/assistant rules before non-trivial changes. Claude's root entry imports the same rules.
- Implement only the requested task; preserve existing behavior; no speculative layers or new packages.
- No backend, database, production matching, mobile routing, payments, AI, social features, background tracking, or multiple taxi providers in this milestone.
- Screens/components must not import mock fixtures. Select transport centrally.
- Add useful JSDoc/TSDoc to reusable logic, lifecycle rules, and integration boundaries; avoid comments that repeat types.
- Update affected specs, [WORK_LOG.md](WORK_LOG.md), roadmap status, and this handoff after meaningful work. Attribute entries to tool/session, record changed files and actual verification, and preserve unfinished criteria plus an exact resume point.
- Final reports: changes, intentionally excluded work, checks/results, documentation, JSDoc/TSDoc, remaining risks/next step.
