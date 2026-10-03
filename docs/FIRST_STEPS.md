# First steps: small assignments for Terra

Last updated: 2026-10-03. Current child statuses are in [Execution order and progress](#execution-order-and-progress); this plan does not authorize implementation by itself.

## Target and limits

First establish a reproducible workspace, then a minimal Expo development app that opens on Android and iOS. Its home screen is a clearly labeled map placeholder; authentication screens only demonstrate navigation. Subsequent contracts and features will have a verified foundation.

This document decomposes **MONO-001** and **MOBILE-001** from [ROADMAP.md](ROADMAP.md). It does not replace their acceptance criteria or authorize implementation. MOBILE-001 depends only on MONO-001, so building the shell before CONTRACT-001 is consistent with the existing DAG. No domain implementation is needed for this shell.

Small scope, fixed decisions, observable checks, and review checkpoints reduce ambiguity. They cannot guarantee bug-free work by Terra or any other model.

Terra is a model used through Codex. It follows the shared Codex workflow and records its actor as `Codex (Terra)` plus a session label in `AI_CONTEXT.md` and `WORK_LOG.md`. Claude Code records `Claude Code`.

## How to assign work

1. Assign **one child task per request**, using its full ID. Avoid broad requests such as “build the foundation.”
2. Read shared guidance and the task, inspect actual files, verify dependencies, and record ownership before editing. Reuse completed work from the latest handoff.
3. Follow the task's file scope. Shared status/handoff docs are also allowed. Generated files and lockfile updates belong only to tasks configuring/installing the relevant dependencies.
4. Run listed checks plus existing root typecheck/lint for code changes. Fix failures within scope. Do not suppress diagnostics, skip tests, remove assertions, use `--force`, or weaken types to obtain a pass.
5. If a fix needs a different architecture, incompatible version changes, another task's implementation, or unavailable native tools, record the exact issue and unfinished criterion. Request a focused decision/environment fix instead of silently broadening the assignment. Routine installation permissions follow the host's approval mechanism.
6. Update this child-task table, parent roadmap status, `AI_CONTEXT.md`, and `WORK_LOG.md`. Record commands/results, not just “tested.” Stop after the assigned task; the next row is not automatic authorization.
7. Review the diff at both checkpoints. A human or a separately requested Codex/Claude review can do this; no extra agent is required. Commit verified work when requested.

One assistant writes to this checkout at a time. A new chat may help isolate an assignment but is optional; repository documentation remains authoritative.

**Status ownership:** This table owns child statuses; the roadmap owns parent statuses. A parent becomes `In progress` when its first child starts and `Completed` only when every required child and parent criterion passes. Use shared `Paused`/`Blocked` statuses for unfinished handoffs. Missing Android/iOS verification leaves MOBILE-001 incomplete even if exports and tests pass.

## Execution order and progress

| Child ID | One outcome | Depends on | Status |
| --- | --- | --- | --- |
| MONO-001-A | Record compatible versions and local prerequisites | None | Completed |
| MONO-001-B | Create the root pnpm workspace | MONO-001-A | Completed |
| MONO-001-C | Compile an empty contracts package | MONO-001-B | Completed |
| MONO-001-D | Make typecheck and lint real checks | MONO-001-C | Completed |
| MONO-001-E | Wire Turbo and verify the workspace checkpoint | MONO-001-D | Planned |
| MOBILE-001-A | Create the smallest Expo Router app | MONO-001-E | Planned |
| MOBILE-001-B | Connect development commands and the shared package | MOBILE-001-A | Planned |
| MOBILE-001-C | Add two small shared UI components | MOBILE-001-B | Planned |
| MOBILE-001-D | Add dismissible auth placeholder navigation | MOBILE-001-C | Planned |
| MOBILE-001-E | Add inert shells for other planned routes | MOBILE-001-D | Planned |
| MOBILE-001-F | Verify behavior with the mobile test harness | MOBILE-001-E | Planned |
| MOBILE-001-G | Build and verify Android | MOBILE-001-F | Planned |
| MOBILE-001-H | Build and verify iOS and the final checkpoint | MOBILE-001-G | Planned |

This is the recommended serial order. If one native platform is unavailable, record its blocker; the user may assign the other platform check independently after MOBILE-001-F. Do not infer that permission or mark the blocked check passed.

## Fixed decisions for this batch

- Package names: private root `ride-match`, private `@ride-match/contracts`, private `@ride-match/mobile`.
- One root `pnpm-lock.yaml`; workspace globs `apps/*` and `packages/*`. Empty `apps/api/` has no manifest and is not a package. Git does not track that empty directory; do not add a placeholder file to it. Contracts is the only shared package.
- Contracts emits JavaScript and declarations into `dist/`. Initial `src/index.ts` contains only `export {};` and a short explanation that schemas come later. No fake DTOs, sample exports, or business functions.
- Prefer ESM contracts with one explicit `exports` entry: `types` -> `dist/index.d.ts` and `default` -> `dist/index.js`. Do not use an `import`-only condition; Jest's CommonJS resolution would not match it. Node (MONO-001-C), Metro (MOBILE-001-B), and the selected Jest runtime (MOBILE-001-F) must all load the same emitted file without source aliases, test mocks, or a second build. MONO-001-A resolves compiler/module options and confirms the format; if a selected tool cannot load ESM, record the evidence and choose one format all three load. No dual ESM/CommonJS build.
- Mobile uses Expo's TypeScript configuration with strict checking; do not impose the contracts package's Node-oriented resolution options on React Native.
- Routes live in `apps/mobile/app/`; tests stay outside it. Use `app.config.ts` as the single app configuration source.
- Use minimal manual Expo Router setup from official guidance, not a large starter application. Development builds include `expo-dev-client`.
- App name `Ride Match`, slug/scheme `ride-match`, Android/iOS development identifiers `com.ridematch.dev`. These are provisional local development values, not registered release identities.
- Start with default Expo monorepo Metro configuration and pnpm isolated installation. Resolution/hoisting changes require a reproduced failure and documented justification.
- No EAS project, hosted build, store submission, account creation, release credentials, remote cache, or CI in this batch.
- No Query, Zod, Vitest, map SDK, location, SecureStore, notifications, or business environment configuration yet. Their existing roadmap tasks introduce them.
- No empty providers, fake sessions/groups/messages, fixture screens, services, extra shared packages, or speculative abstractions. Preserve unrelated `.idea/` files and other edits.

## Task cards

Every card inherits [AGENTS.md](../AGENTS.md), [AI_WORKFLOW.md](AI_WORKFLOW.md), the rules above, and its parent roadmap task. Read current AI context and the latest relevant work-log handoff each time. From MONO-001-B onward, also read `docs/TOOLCHAIN.md` (created by MONO-001-A); use its versions, commands, and recorded decisions instead of choosing new ones. File scopes below additionally permit concise status updates here and in the roadmap, AI context, work log, and affected setup docs.

### MONO-001-A — Record the toolchain

**Outcome:** The next assistant has exact compatible versions and commands instead of choosing a stack while scaffolding.

**Read:** Architecture technology/structure sections, development commands, and official sources below.

**Files:** Create `docs/TOOLCHAIN.md`; setup documentation/handoff only.

**Work:** Inspect Git/files, Node/pnpm/Corepack versions, Android SDK/emulator/JDK and SDK location, plus Xcode/simulator/CocoaPods availability and locale, without installing or reconfiguring the machine. Record useful versions/availability, not environment dumps. Select a supported Node LTS and one stable Expo SDK with its compatible React/React Native/Router/TypeScript versions. Select exact pnpm/Turbo and compatible lint/test tools from official guidance and published package metadata; never choose independent latest React and React Native.

Record exact direct dependency versions, owner (root/contracts/mobile), purpose, source links, date, and engine/peer compatibility. Include Router's peers, development client, TypeScript types, lint tools, Jest/jest-expo/Testing Library, and pinned `expo-doctor`; exclude future domain dependencies. Record exact setup/install commands for B–F, ESM compiler options/exports, mobile lint/test config choices, and one Node version-file convention.

**Known local hazards** (read-only observation by Claude Code on 2026-10-03; re-verify, then record the current state):

- The home directory above this checkout has a `package.json` declaring `packageManager: yarn@4.x`, plus `yarn.lock` and `node_modules/@types` (including `jest`, `mocha`, and `node`). The Corepack `pnpm` shim refuses to run inside this repository until a root manifest declares pnpm. TypeScript automatically includes `@types` from every ancestor `node_modules`; `jest` and `mocha` declare conflicting globals. Node, Jest, and Metro resolution can also fall back to that ancestor `node_modules` and hide undeclared dependencies.
- The checkout lives inside a MEGAsync-synced folder. Dependency symlinks, caches, and native build output would be synced, and AI_WORKFLOW warns against overlapping writes through cloud-synced folders.
- CocoaPods warns without a UTF-8 locale. `LANG`, `ANDROID_HOME`, and `JAVA_HOME` were unset in the assistant's non-interactive shell even though `adb`, `emulator`, and JDK 17 were on `PATH`. The user's interactive shell may differ.

**Also resolve and record:**

- How pnpm is provisioned at the exact version: Corepack or another method, whether Corepack ships with the selected Node line, and how B runs its first pnpm command despite the ancestor manifest. Enabling global shims or installing global tools is a user-approved step, not routine scaffolding.
- An explicit `types` setting for every tsconfig, so ancestor `@types` never enter compilation, and a check that compiler file lists contain no ancestor `node_modules` paths. Note whether Metro/Jest can resolve packages from the ancestor directory and which guard or user action prevents it.
- The MEGAsync handling: sync exclusions for generated paths, or a non-synced checkout. This is the user's decision; name it as open until recorded.
- pnpm's dependency build-script policy for the selected version: which packages, if any, may run install scripts. Warnings are resolved, not suppressed.
- The contracts module format and `exports` entry that satisfy the fixed decision above for Node, Metro, and the selected Jest runtime. Jest's CommonJS runtime may reject `.js` files from a `type: module` package; confirm from official documentation or metadata, or mark it for verification in MOBILE-001-B/F.
- Expo-generated paths and their ignore convention: `.expo/`, export `dist/`, `android/`, `ios/`, `expo-env.d.ts`, and compiler build-info files.
- How `pnpm dev` keeps Expo's interactive terminal keys usable under the selected Turbo version and how interrupt reaches both processes; otherwise record the documented alternative.
- Native prerequisites per platform, including CocoaPods, UTF-8 locale, Android SDK location, and JDK, with the task each missing item blocks.

**Pass when:** Workspace/mobile setup has no unresolved version or command placeholders; metadata supports the selected combination. Every known hazard has a recorded mitigation or a named open user decision with the task it blocks. Distinguish this from installation/native checks, which come later. Name missing native prerequisites and the platform tasks they block; these do not block workspace work.

**Check:** Read-only local version and published metadata commands, source-link review, `git diff --check`. Record exact commands/results.

**Stop/defer:** Unresolved compatibility leaves this task incomplete. No dependency installation, scaffolding, system upgrade, or architecture change. Do not modify files outside the repository, shell profiles, sync settings, or global tools; record those as user decisions.

### MONO-001-B — Create the root workspace

**Outcome:** pnpm reproducibly installs the selected workspace tools.

**Files:** Root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, chosen Node version file, root `README.md`.

**Work:** Before installing anything, confirm `docs/TOOLCHAIN.md` records the pnpm bootstrap method and the user's MEGAsync decision; if either is open, mark B `Blocked` on it. Create private root manifest with exact `packageManager` and supported Node engines, plus workspace globs. Install only A's root foundation tools, including Turbo and selected TypeScript/lint tooling. Generate the root lockfile with pnpm. Add narrow dependency/build/cache/local-env ignores; do not hide IDE files as cleanup. README covers actual setup and links to docs.

**Pass when:** One lockfile; no app manifest, nested lockfile, backend scaffold, or pretend build/test command. Runtime and package manager requirements are documented.

**Check:** `pnpm --version`, `pnpm install --frozen-lockfile`, manifest/workspace/ignore inspection, `git diff --check`. Root lint/typecheck do not exist until D.

**Stop/defer:** No Expo files, contracts source, product dependencies, global tool replacement, CI, or remote cache.

### MONO-001-C — Compile the contracts shell

**Outcome:** A compiled shared package exists before anything consumes it.

**Files:** `packages/contracts/{package.json,tsconfig.json,src/index.ts}`; root scripts/lockfile if required by A's dependency ownership.

**Work:** Use the fixed name and the exports entry recorded in A. Strictly compile only `src/` into `dist/` with declarations, with an explicit `types` setting so ancestor `@types` packages stay out. Declare TypeScript where package scripts resolve it. Add package `build`, `dev` (compiler watch), and `typecheck`; add a direct root `build:contracts` wrapper to be routed through Turbo in E. Keep runtime dependencies empty.

**Pass when:** `dist/index.js` and `dist/index.d.ts` exist, match manifest exports, and emitted JavaScript imports in Node. Compilation includes no files from an ancestor `node_modules`. Source has no domain definitions; outputs are ignored.

**Check:** `pnpm build:contracts`; `pnpm --filter @ride-match/contracts typecheck`; from root, `node --input-type=module -e "await import('./packages/contracts/dist/index.js')"`; A's recorded compiler file-list check for ancestor paths; artifact/export inspection; `git diff --check`.

**Stop/defer:** No Zod, schema tests, sample data, bundler, publishing, mobile import, or meaningless empty-module test.

### MONO-001-D — Make static checks effective

**Outcome:** Root lint/typecheck examine real source and fail for real errors.

**Files:** Root scripts and `eslint.config.mjs`; contracts scripts/config; lockfile only for dependencies identified in A.

**Work:** Configure the chosen TypeScript-aware lint setup for actual source, ignoring generated artifacts. Add package lint and root lint/typecheck wrappers. Keep rules focused on correctness and no explicit `any`; defer formatting migrations and future mock-import rules.

**Pass when:** Valid source passes. An assistant-created temporary type error fails typecheck; an explicit `any` fixture fails lint. Restore only those temporary changes and obtain final passes. Do not use Git reset or overwrite existing work.

**Check:** `pnpm typecheck`, `pnpm lint`; record expected nonzero negative probes separately from restored passing results; `git diff --check`.

**Stop/defer:** No blanket exclusions, disabled strictness, `@ts-ignore`, success-only scripts, or test runner.

### MONO-001-E — Wire Turbo and finish the workspace checkpoint

**Outcome:** Root commands orchestrate contracts and setup documentation matches reality.

**Files:** `turbo.json`, root/package scripts, README and development/toolchain docs.

**Work:** Route root build/typecheck/lint through Turbo without recursive root-task calls. Declare build outputs `dist/**`, dependency ordering, and persistent uncached dev tasks for later watch use. Keep lint/typecheck non-emitting. Distinguish implemented and future commands in setup docs.

**Pass when:** Graph contains contracts and no mobile/API package; build output restoration works; no recursion or dependency on a never-ending watcher. All MONO-001 parent criteria hold.

**Check:** `pnpm install --frozen-lockfile`, `pnpm build:contracts`, `pnpm typecheck`, `pnpm lint`, `pnpm exec turbo run build --dry-run=json`. After a build, move only generated contracts `dist/` to a temporary backup, rebuild, and verify restored artifacts via cache or compilation. Review diff; `git diff --check`.

**Checkpoint review:** Real scripts, correct exports, narrow dependencies, empty app directories, no tracked build artifacts, accurate docs. Mark MONO-001 complete only after all checks/review pass.

**Stop/defer:** No Expo initialization. Next suggested assignment: MOBILE-001-A.

### MOBILE-001-A — Create the minimal Expo Router shell

**Outcome:** A valid mobile package has one anonymous home route.

**Read:** Recorded toolchain, product navigation, architecture route boundaries.

**Files:** Mobile manifest, `app.config.ts`, `tsconfig.json`, Expo type declarations handled per A's convention (Expo generates `expo-env.d.ts`; do not hand-write it), `app/{_layout,index}.tsx`, `src/features/map/MapPlaceholderScreen.tsx`; `.gitignore` entries for A's recorded Expo-generated paths; root lockfile and necessary mobile lint config.

**Work:** Install A's compatible Expo/React/React Native/Router peers, development client, and types. Use `expo-router/entry`, strict Expo TypeScript with A's explicit `types` setting, a root stack, and a thin `/` route rendering the feature placeholder. Show “Ride Match” and “Map coming soon,” with no activity. Configure provisional identifiers. Add mobile start/typecheck/lint scripts and include mobile in root static checks.

**Pass when:** Expo reads config, static checks cover mobile, and Android/iOS JavaScript exports resolve entry/routes. After the exports, `git status` shows no generated Expo output. No permission prompt, auth gate, network request, or domain behavior.

**Check:** `pnpm typecheck`, `pnpm lint`; in `apps/mobile`, `pnpm exec expo install --check`, `pnpm exec expo export --platform android`, `pnpm exec expo export --platform ios`; `git status --short`. Exports do not prove native startup.

**Stop/defer:** No auth route yet, native map, tabs, branding project, Query/provider placeholders, starter demos, or parallel `src/app/` tree.

### MOBILE-001-B — Connect the package and development commands

**Outcome:** Root commands prepare contracts; development runs its watch process alongside Expo; exports resolve the shared package.

**Files:** Root/mobile scripts, lockfile, Turbo tasks; `src/bootstrap/checkContractsPackage.ts` and layout import; setup docs.

**Work:** Add mobile dependency `@ride-match/contracts: workspace:*`. Add a temporary side-effect import of that package in the bootstrap smoke module, imported by the layout, so Metro resolves the public runtime entry. Comment its temporary purpose; remove when a real contract consumer is implemented. No fake export or runtime banner.

Implement root `dev`, `dev:mobile`, `doctor`, `export:android`, `export:ios`, `mobile:android`, `mobile:ios`. Dev commands build contracts once then run compiler watch alongside Expo `--dev-client`. Native/export commands prepare contracts too. Use A's pinned doctor tool. Never make a task wait for a watcher to finish.

**Pass when:** Exports resolve public package entry without source aliases. Startup prepares missing artifacts; watch emits a controlled source change; Expo's interactive keys work under Turbo (or A's documented alternative is used); interrupt stops both processes. Restore the temporary probe. No unresolved doctor/dependency failure.

**Check:** Root static checks, `pnpm doctor`, both exports; start/stop `pnpm dev` and inspect emission from an assistant-created temporary source file. Inspect Turbo dry-run ordering. Record outcomes; native launch is G/H.

**Stop/defer:** No speculative Metro/hoisting patches, dual builds, schemas, device permissions, or lingering background processes.

### MOBILE-001-C — Add only needed UI primitives

**Outcome:** Screens can share spacing and accessible buttons.

**Files:** `src/ui/{Screen,Button}.tsx`, map placeholder; root layout only if a safe-area provider is required.

**Work:** Add one safe-area screen container and one text button with label, press handler, disabled state, and optional accessibility label. Use existing dependencies and React Native styles. Use Screen immediately; Button is consumed in D. Add useful TSDoc for inset ownership and disabled/accessibility behavior.

**Pass when:** Insets apply once; props are small and typed; no domain imports, arbitrary variants, theme machinery, or new dependencies.

**Check:** Root static checks; inspect inset/disabled/accessibility handling. Executable button assertions are grouped into F's test harness.

**Stop/defer:** No design system, animation/sheet library, global store, theme provider, or unused component family.

### MOBILE-001-D — Add auth navigation placeholders

**Outcome:** Home -> phone -> OTP -> back/close works predictably.

**Files:** Root layout, `app/auth/{_layout,phone,otp}.tsx`, small auth placeholder components, map placeholder.

**Work:** Home gets “Sign in.” This entry is a temporary placeholder: [PRODUCT.md](PRODUCT.md) shows authentication only for protected actions, so AUTH-001 replaces it with protected-action gating. Present auth navigator modally, starting at phone. A clearly labeled preview action advances to OTP; OTP Back returns to phone. Close from either returns to `/`. Direct entry without history has a safe home fallback. Keep route modules thin.

**Pass when:** Browsing never requires auth; close preserves existing home when present. Copy says authentication is unimplemented. No phone/code collection, session mutation, validation, or simulated sign-in success.

**Check:** Static checks and both exports; inspect stack/dismiss/fallback. Automated transitions are required in F; native modal/back behavior in G/H.

**Stop/defer:** No OTP service, fake signed-in state, credential storage, protected-action continuation, or data source.

### MOBILE-001-E — Add inert remaining route shells

**Outcome:** Planned URLs have explicit placeholders without implying private features work.

**Files:** `app/groups/[groupId]/{index,chat}.tsx`, `app/settings.tsx`, `app/dev/scenarios.tsx`, `src/config/isDevelopmentMode.ts`, layout registration if needed; a shared placeholder component only if it removes actual repetition.

**Work:** Group/chat display only “Not available yet” plus home/back, regardless of ID. Settings has no fake session/permission controls. Scenario route is available only in React Native development mode (`__DEV__`); otherwise it renders an unavailable state with a home action, not a redirect. Read the flag only through a small `isDevelopmentMode()` function so F can override that flag without mocking navigation. Record its replacement by real environment/data-source gating in DATA-001.

**Pass when:** No synthetic private data, nonfunctional mutation controls, route-param membership trust, or active scenarios. Malformed/missing IDs cannot crash placeholders. Non-development scenario entry is unavailable.

**Check:** Static checks, exports, route audit against PRODUCT.md. Direct-entry/unavailable/non-development behavior is tested in F.

**Stop/defer:** No authorization framework, UUID schema, fixture groups/chat, settings state, scenario engine, or home links promoting unfinished private features.

### MOBILE-001-F — Add the behavior test harness

**Outcome:** Tests catch broken navigation and basic interactive behavior.

**Files:** Mobile Jest config/setup, `tests/{navigation,ui}.test.tsx`, minimal helpers; root/mobile scripts and lockfile; local fixes in C–E files for defects exposed by tests.

**Work:** Install A's compatible Jest/jest-expo/Testing Library setup. Use Expo Router testing utilities against actual route components/configuration, not a duplicate fake app. Tests stay outside `app/`. Add `test:mobile` with argument forwarding and a non-watch root `test` for available suites.

**Required assertions:** Anonymous initial home; Sign in -> phone -> OTP -> Back to phone; Close from either auth screen -> home; direct auth entry Close -> home fallback; arbitrary group/chat ID -> unavailable; non-development scenario route -> unavailable state (override only `isDevelopmentMode()`; Jest runs with `__DEV__` true); disabled Button ignores press and reports disabled state, enabled Button invokes once.

**Pass when:** Assertions pass without mocking away the navigation under test or aliasing/mocking `@ride-match/contracts`; the bootstrap import loads the built package through its `exports` entry. No pending test timers/listeners. Record native/mock limits. No snapshot-only suite or `passWithNoTests`.

**Check:** `pnpm test:mobile`, `pnpm test:mobile --runTestsByPath tests/navigation.test.tsx`, `pnpm test`, root static checks. For runtime fixes rerun affected exports/doctor.

**Stop/defer:** No empty-module contracts tests, Vitest, Maestro, business tests, or broad coverage target. `test:contracts` remains planned until CONTRACT-001.

### MOBILE-001-G — Verify Android

**Outcome:** A local Android development build runs the shell/navigation.

**Files:** Normally docs only; narrow app-config fixes if needed. Generated `android/` follows Expo's generated-native workflow and stays untracked; no handwritten native patch.

**Work:** Use A's recorded prerequisites and run `pnpm mobile:android` on emulator/device. Check cold launch, anonymous home, phone/OTP transitions, Android back, close/home fallback, and no unsolicited permissions. Record OS/API level, command/result, and observed interactions, omitting device identifiers/sensitive logs.

**Pass when:** Native build, installation, launch, and listed interactions succeed. Exports or Expo Go do not substitute.

**Check:** Native command/manual flow; if config/code changes, rerun doctor, static checks, and affected tests/exports. Record missing tools as unresolved checks.

**Stop/defer:** No cloud build, release signing, machine cleanup/reconfiguration without required authorization, or guessed package downgrades to conceal toolchain blockers.

### MOBILE-001-H — Verify iOS and finish the shell checkpoint

**Outcome:** The shell works in an iOS development build and the first batch has complete evidence.

**Files:** Normally docs only; narrow app-config fixes if needed. Generated `ios/` stays untracked under the same policy as Android.

**Work:** Run `pnpm mobile:ios` on a local simulator. Check cold launch, anonymous home, auth navigation, close/native dismissal where supported, safe areas, and direct-entry fallback. Record simulator OS/runtime and results. Compare parent criteria to child evidence.

**Pass when:** iOS checks pass, Android evidence applies to final files, and all required children are complete. Cross-platform changes require affected Android rechecks.

**Check:** Native flow; final checkpoint `pnpm install --frozen-lockfile`, `pnpm build:contracts`, `pnpm typecheck`, `pnpm lint`, `pnpm test:mobile`, `pnpm doctor`, both root exports, `git diff --check`. Review for unintended generated files/later features.

**Checkpoint review:** Commands match docs; compatible pinned dependencies/one lockfile; route/test boundaries; no fake product functionality/backend; native evidence covers both platforms. Mark MOBILE-001 complete only after all checks/review pass.

**Stop/defer:** End this batch. Next suggested planning step: split CONTRACT-001 into common/errors, location/privacy, user projections, and auth DTO assignments against existing API specs before Terra implements them. LOCATION-001/MAP-001 can be planned separately once MOBILE-001 passes. Do not start them automatically.

## Copyable assignment prompt

Replace the task ID for each subsequent assignment; keep the other boundaries.

```text
Read AGENTS.md and shared guidance in its required order.
Read docs/FIRST_STEPS.md and the latest relevant WORK_LOG.md handoff.
Execute only MONO-001-A. Do not implement all of MONO-001.

Verify dependencies/current files, then record ownership.
Attribute handoffs to your tool and model (Terra: "Codex (Terra)").
Follow the task card's file scope, fixed decisions, pass criteria, and exclusions.
Run applicable specified checks and record exact outcomes.
Do not weaken checks or silently change architecture to bypass failures.
If blocked, preserve useful work and document the unfinished criterion.

Update child/parent status, AI_CONTEXT.md, WORK_LOG.md, and affected docs.
Report changes, checks, exclusions, remaining work, and next suggested ID.
Stop after this assignment. Do not commit or start the next task.
```

For a started child, use “Continue only” and resume the first unfinished criterion after checking actual files.

Optional checkpoint review prompt:

```text
Review completed MONO-001 children against docs/FIRST_STEPS.md,
docs/ROADMAP.md, and current files/diff. Do not implement later tasks.
Verify recorded checks and report concrete discrepancies, missing evidence,
or regressions with file references. Do not edit code in this review.
```

## Official references

Checked while preparing this plan on 2026-10-03. These support the approach, not a claim this repository is installed/tested. MONO-001-A verifies and records exact versions at execution time.

- [pnpm workspaces](https://pnpm.io/workspaces): workspace configuration and local dependencies.
- [Expo monorepos](https://docs.expo.dev/guides/monorepos/): workspace support and isolated-install considerations.
- [Expo Router installation](https://docs.expo.dev/router/installation/): entry point and compatible peers.
- [TypeScript module reference](https://www.typescriptlang.org/docs/handbook/modules/reference): ESM/module-resolution alignment.
- [Turborepo task configuration](https://turborepo.dev/docs/reference/configuration): outputs, ordering, persistent-task restrictions.
- [Expo unit testing](https://docs.expo.dev/develop/unit-testing/): Expo-aware Jest setup.
- [Expo Router testing](https://docs.expo.dev/router/reference/testing/): route behavior tests and placement.
- [Expo local development builds](https://docs.expo.dev/guides/local-app-development/): Android/iOS native runs.
