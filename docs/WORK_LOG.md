# Work log

Record actual work here after each meaningful task by Codex, Claude Code, or a human contributor. Keep current behavior in the relevant specification and only a concise operational summary in `AI_CONTEXT.md`. Preserve older entries and append a new attributed handoff when another assistant continues a task.

## Entry format

- Date, task ID, actor/tool, and short session label.
- Status and working-copy/branch/revision context, if available.
- Goal and actual changes.
- Decisions and intentionally excluded work.
- Checks actually run and observed results; distinguish planned checks from executed checks.
- Documentation/JSDoc changes.
- Remaining limitations, unfinished criteria, exact resume step, and whether ownership is active or released.

Use the [shared handoff template](AI_WORKFLOW.md#handoff-entry-template). Actual verification belongs to the entry that performed it; do not imply a prior assistant's passing check covers later edits.

Never record credentials, phone numbers, exact rider locations, private messages, or sensitive command output.

## 2026-10-03 — DOC-000: Documentation baseline

- **Actor/session:** Codex / documentation-baseline.
- **Status:** Completed; ownership released.
- **Goal:** Persist the mobile-first architecture and implementation plan in `docs/` and establish documentation maintenance for future work.
- **Changes:** Added a documentation index, AI handoff, architecture, product behavior, development/testing/analytics plan, mock scenarios, detailed 25-task roadmap/DAG, future REST/realtime specifications, and this work log.
- **Decisions:** Mobile MVP uses mocks first. API behavior is a future contract, not an implemented service. Existing empty mobile/API directories remain untouched.
- **Excluded:** Repository initialization, application/backend code, dependency installation, native configuration, and package/build/test scaffolding.
- **Verification:** Read-only repository inventory confirmed there were no existing project docs or application files. A read-only Python check passed for all 13 Markdown documents: 34 local links/heading anchors, balanced fenced blocks, 25 unique tasks with all seven required fields and planned statuses, 33 dependency edges matching the acyclic Mermaid DAG, and scenarios A–N (14 total). A final inventory confirmed both application directories remain empty. No application tests or builds ran because no application or tooling exists.
- **JSDoc/TSDoc:** No source code changed; guidelines for future reusable and integration logic are documented.
- **Limitations:** All implementation tasks remain planned. Native compatibility, map coverage, credentials, product timing defaults, and Yandex handoff require verification during implementation.
- **Next:** MONO-001 when requested; do not begin it automatically.

## 2026-10-03 — DOC-001: Shared Codex and Claude Code workflow

- **Actor/session:** Codex / shared-ai-docs.
- **Status:** Completed; ownership released.
- **Working copy:** Shared project directory, Git branch `main`, observed HEAD `2770e17`. Changes from this task are uncommitted; no commit/push or application implementation performed. Unrelated untracked `.idea/` files were left untouched.
- **Request/scope:** Adapt documentation so either assistant can understand and continue the other's documented work.
- **Changes:** Added root `AGENTS.md` as shared guidance, root `CLAUDE.md` importing it, and `docs/AI_WORKFLOW.md` with ownership/status rules, attributed handoff template, takeover procedure, and prompts usable in either tool.
- **Documentation:** Updated `docs/README.md`, `docs/AI_CONTEXT.md`, `docs/ROADMAP.md`, `docs/DEVELOPMENT.md`, `docs/ARCHITECTURE.md`, and this log to use the shared workflow. Added actor/status metadata to the prior documentation entry without changing its historical verification results.
- **Decisions:** One shared rule set and one project history; no duplicate Claude roadmap or private-memory dependency. Single writer in a shared directory; separate checkouts need both code and documentation integration.
- **Excluded:** Application/API code, domain/API contract changes, dependency installation, tool configuration/hooks, tool-to-tool messaging, and starting MONO-001.
- **Verification:** Official Codex instruction-discovery and Claude Code memory/import documentation checked. A read-only Python validation passed across 16 Markdown files: 58 local links/anchors, balanced fences, the single `@AGENTS.md` import with no import cycle, 25 unchanged planned implementation tasks, 33 matching acyclic dependency edges, and 14 mock scenarios. Application directories remain empty and package/tooling files were not created. Git status/diff inspected; `git diff --check` and final link/import/handoff-ownership/Markdown-whitespace checks passed. No application tests/builds apply to this documentation-only change.
- **JSDoc/TSDoc:** No code changed; existing documentation requirements preserved in shared instructions.
- **Remaining:** Fresh Codex/Claude Code session loading has not been executed; the Claude CLI is not available on the current shell PATH. The shared workflow includes a read-only startup check. All 25 implementation tasks remain planned.
- **Resume from:** Use the read-only context check in either tool if desired; implement MONO-001 only when requested.
- **Ownership:** Released; no active task.

## 2026-10-03 — DOC-002: First-step child assignments for MONO-001 and MOBILE-001

- **Actor/session:** Codex / terra-first-steps (drafting); Claude Code / first-steps-review (review, patch, closure).
- **Status:** Completed; ownership released.
- **Working copy:** `main`. The user committed Codex's draft as `9566405`. At the user's request, Claude Code committed its patch and this closure on top of it, without pushing. Untracked `.idea/` files left untouched.
- **Request/scope:** Split MONO-001 and MOBILE-001 into small assignments for Terra (a model used through Codex) or either assistant. The user then asked Claude Code to review the plan, patch it, and close DOC-002 without starting implementation.
- **Changes (Codex draft, recovered from `9566405`; no Codex handoff entry was written):** Added `docs/FIRST_STEPS.md` with 13 child cards (MONO-001-A–E, MOBILE-001-A–H), fixed decisions, status ownership, and prompts. Linked it from `docs/README.md`, `docs/ROADMAP.md`, `docs/AI_WORKFLOW.md`, `docs/DEVELOPMENT.md`, and `docs/AI_CONTEXT.md`. The parent DAG is unchanged.
- **Changes (Claude Code patch):** In `docs/FIRST_STEPS.md`: defined Terra and its `Codex (Terra)` attribution; replaced the stale "none started" header with a pointer to the status table; required `docs/TOOLCHAIN.md` reading from B onward. MONO-001-A now lists known local hazards and the decisions it must record: pnpm provisioning, explicit tsconfig `types`, the MEGAsync decision, pnpm build-script policy, contracts module format, Expo-generated ignores, Expo interactivity under Turbo, and CocoaPods/locale/Android SDK prerequisites. B is gated on the pnpm bootstrap method and the MEGAsync decision. C requires explicit `types` and an ancestor-path check. The contracts `exports` entry is `types`/`default`, not `import`-only, and must load in Node, Metro, and Jest without aliases, mocks, or dual builds. MOBILE-001-A owns Expo-generated ignores and `expo-env.d.ts` handling. The D "Sign in" entry is temporary until AUTH-001. E/F now agree that a non-development scenario entry renders an unavailable state, using an overridable `src/config/isDevelopmentMode.ts`. F forbids aliasing or mocking contracts. In `docs/AI_WORKFLOW.md`: actor labels may name the model, e.g. `Codex (Terra)`. In `docs/AI_CONTEXT.md`: DOC-002 is closed, ownership released, and the next step is MONO-001-A.
- **Decisions:** Terra records its actor as `Codex (Terra)` (user instruction). The scenario route shows an unavailable state rather than redirecting, matching PRODUCT.md's unavailable-target behavior. Machine-level changes (home-directory files, sync settings, global shims, shell profiles) are user decisions that A records, not changes it performs.
- **Excluded:** All implementation, dependency installation, `docs/TOOLCHAIN.md`, changes outside the repository, commits, and the remaining child tasks.
- **Verification:** Read-only environment probe (not a substitute for MONO-001-A), run in the assistant's non-interactive shell. Node `v22.23.2` and Corepack `0.34.6` are present. `pnpm --version` inside the repository is refused because an ancestor home-directory `package.json` declares `yarn@4.18.0`; the home directory also has `yarn.lock` and `node_modules/@types`. Also present: Watchman, OpenJDK 17, adb 1.0.41, Android emulator 36.3.10, Xcode 26.6, and CocoaPods 1.17.0, which warns without a UTF-8 locale. `LANG`, `ANDROID_HOME`, and `JAVA_HOME` were unset. `apps/mobile/` and `apps/api/` are empty and untracked. Document checks: a scratch Python validation over 17 Markdown files passed (72 local links/anchors resolved, balanced fences, 13 child rows matching 13 cards in order, all `Planned`, 25 parent tasks all `Planned`). `git diff --check` passed. No application checks apply.
- **JSDoc/TSDoc:** Not applicable; documentation only.
- **Remaining/blockers:** Codex's original verification for the draft is unknown because no entry was recorded. The environment hazards are unresolved. MONO-001-A must record mitigations or open user decisions, and MONO-001-B stays blocked until the pnpm bootstrap method and the MEGAsync decision are recorded. Claims about Jest's handling of `type: module` and Corepack's distribution are flagged for verification in A, not asserted as verified.
- **Resume from:** Assign MONO-001-A when requested, using the prompt in `docs/FIRST_STEPS.md`.
- **Ownership:** Released; no active task.

## 2026-10-03 — MONO-001-A: Toolchain recorded

- **Actor/session:** Claude Code / toolchain-record.
- **Status:** Completed; ownership released. Parent MONO-001 stays `In progress`.
- **Working copy:** `main` at `0a01d3c`. Changes are uncommitted, with no commit or push. Untracked `.idea/` files were left untouched.
- **Request/scope:** The user asked to start the first steps one child at a time; only MONO-001-A was executed. Scope: create `docs/TOOLCHAIN.md` from read-only probes and published metadata, plus status and handoff updates.
- **Changes:** Added `docs/TOOLCHAIN.md`, which covers:
  - Selected versions with owner, purpose, and compatibility evidence: Node 24.17.0, pnpm 11.28.2 through Corepack, Expo SDK 57 (`expo` 57.0.26, React Native 0.86.3, React 19.2.3), TypeScript 6.0.3, Turbo 2.11.6, ESLint 9.39.5, `typescript-eslint` 8.71.0, `eslint-config-expo` 57.0.2, Jest 29.7.0, `jest-expo` 57.0.5, Testing Library 14.0.1 with `test-renderer` 1.3.0, `expo-doctor` 1.20.4.
  - The Corepack bootstrap order and pnpm 11 defaults.
  - The build-script policy.
  - Contracts and mobile tsconfigs with explicit `types`.
  - The contracts ESM `exports` evidence for Node, Metro, and Jest.
  - Lint, test, and Turbo choices, with the documented alternative for interactive dev.
  - Exact install commands for B, C, D, MOBILE-001-A, B, and F.
  - The Expo-generated ignore convention and the MEGAsync exclusion list.
  - Ancestor guards, native prerequisites, verify-later items, and sources.

  Updated statuses and pointers in `FIRST_STEPS.md` (A `Completed`), `ROADMAP.md` (MONO-001 `In progress`), `AI_CONTEXT.md`, `DEVELOPMENT.md`, and `docs/README.md`.
- **Decisions:**
  - **User, via questions in this session:**
    - Node 24; B may run `corepack enable pnpm` under Node 24.17.0.
    - The checkout stays in MEGAsync, and the user adds exclusions for generated paths.
    - Ancestor home-folder packages stay, guarded in the repository.
  - **Assistant, with evidence in `TOOLCHAIN.md`:**
    - pnpm 11, not 12: Corepack's `>=11` entry expects `bin/pnpm.mjs`, and 12 is a new native-binary distribution.
    - Turbo 2.11.6, not 2.11.7: pnpm 11's default `minimumReleaseAge` is one day.
    - TypeScript 6.0.3, not 7: `typescript-eslint` peer range and Expo SDK 57's `~6.0.3`.
    - ESLint 9: Expo's lint plugins lack ESLint 10 peers, and Expo CLI 57 installs `^9`; npm marks 9.39.5 deprecated, which is accepted and recorded.
    - Jest 29: `jest-expo` 57 is built on it.
    - Testing Library 14: required by Expo Router testing.
    - Typed routes off for this batch: Expo CLI rewrites `tsconfig.json` and `.gitignore` around `expo-env.d.ts`.
    - Native and test wrappers run outside Turbo to avoid its strict env filtering.
    - `allowBuilds` defaults to deny; `unrs-resolver: false` is expected in MOBILE-001-A.
- **Excluded:** No installation, `corepack enable`, scaffolding, manifests, lockfile, or config files. No changes outside the repository, to shell profiles, to MEGAsync settings, or to home-folder files. MONO-001-B and later children were not started.
- **Verification (all read-only):**
  - Local probes (exact results are in `TOOLCHAIN.md`):
    - `node --version`, `npm --version`, `corepack --version` (both Node lines), `pnpm --version` (refused because of the ancestor yarn manifest)
    - `ls ~/.nvm/versions/node`, Corepack's bundled pnpm definitions and README
    - `watchman --version`, `java -version`, `/usr/libexec/java_home -V`, Android SDK directory listings
    - `adb --version` (PATH and SDK), `emulator -version`, `emulator -list-avds`, AVD `config.ini`
    - `xcodebuild -version`, `xcrun simctl list runtimes`, `pod --version` (warns without UTF-8; works with `LANG=en_US.UTF-8`)
    - Ancestor directory inventory and the sync-root `.megaignore`
  - Registry and source checks:
    - `npm view` for dist-tags, publish times, peers, engines, dependencies, install scripts, and deprecation of every selected package
    - Expo versions API, and `bundledNativeModules.json` / `tsconfig.base.json` for `expo@57.0.26`
    - `@expo/cli` 57.0.27 sources (lint prerequisite; `expo-env.d.ts` and tsconfig type generation), Expo's SDK 57 template `gitignore`
    - Node release index, pnpm v11 settings docs, TypeScript 6.0 notes, Turbo 2.11.6 configuration docs, React Native 0.86.3 Gradle versions and `__DEV__` types
    - `jest-resolve` and `jest-runtime` 29.7.0 ESM-loading source
  - Document checks:
    - A scratch Python validation passed over 18 Markdown files: 86 local links and anchors resolved with 0 errors, fences were balanced, and 13 child rows matched 13 cards (1 `Completed`, 12 `Planned`). Of the 25 roadmap tasks, MONO-001 is `In progress` and the rest are `Planned`.
    - `git diff --check` passed on tracked files, and a trailing-whitespace scan of the new untracked `TOOLCHAIN.md` found none.
  - No application checks apply, because no code or tooling exists.
- **JSDoc/TSDoc:** Not applicable; documentation only.
- **Remaining/blockers:**
  - Expectations listed under "Verify later" in `TOOLCHAIN.md` must be confirmed by their tasks: Corepack under Node 24, Metro and Jest loading of contracts `exports`, Turbo terminal-UI interactivity and env pass-through, peer warnings, the `unrs-resolver` decision, the `babel.config.js` need, and `types: ["jest"]`.
  - The user still needs to add the MEGAsync exclusions, before MONO-001-C creates `dist/`.
  - Native runs need per-command `ANDROID_HOME`, `JAVA_HOME` (JDK 17), the SDK adb first on `PATH`, and a UTF-8 locale for CocoaPods; the commands are recorded. Nothing is missing.
- **Resume from:** Assign MONO-001-B when requested. Follow the bootstrap order in `TOOLCHAIN.md`: activate Node 24.17.0, enable the pnpm shim (user-approved), write the root `package.json` before the first pnpm command, then run `corepack install`.
- **Ownership:** Released; no active task.

## 2026-10-03 — MONO-001-B: Root pnpm workspace

- **Actor/session:** Claude Code / root-workspace.
- **Status:** Completed; ownership released. Parent MONO-001 stays `In progress`.
- **Working copy:** `main`. The user asked to commit MONO-001-A first, which became `2f35ea5`. At the user's request, MONO-001-B was committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "commit this and continue with MONO-001-B". Only the B card was executed.
- **Changes:**
  - Root `package.json`: private `ride-match`, `packageManager: pnpm@11.28.2`, `engines.node: ^24.17.0`, and exact devDependencies `turbo` 2.11.6, `typescript` 6.0.3, `eslint` 9.39.5, `@eslint/js` 9.39.5, `typescript-eslint` 8.71.0. There are no scripts yet.
  - `pnpm-workspace.yaml`: `apps/*` and `packages/*`, `savePrefix: ''`, `engineStrict: true`.
  - `.nvmrc` with `24.17.0`.
  - `.gitignore`: `node_modules/`, `packages/*/dist/`, `.turbo/`, `*.tsbuildinfo`, `.env*.local`, `.DS_Store`.
  - Generated `pnpm-lock.yaml` (lockfile v9; 110 packages).
  - Root `README.md` with requirements, setup, the command status, layout, and documentation links.
  - **Machine change, user-approved in MONO-001-A:** `corepack enable pnpm` with Node 24.17.0 active. This added `pnpm` and `pnpx` symlinks in `~/.nvm/versions/node/v24.17.0/bin`. `corepack install` cached pnpm 11.28.2. Nothing else outside the repository changed; the pnpm store at `~/Library/pnpm/store/v11` is pnpm's default.
- **Decisions:**
  - Added `engineStrict: true`. The pnpm v11 docs say a project's own `engines` mismatch always fails, but under pnpm 11.28.2 with Node 22.23.2 a frozen install only warned and exited 0. With `engineStrict` it fails with `ERR_PNPM_UNSUPPORTED_ENGINE`.
  - Recorded that Claude Code's shell needs `export NVM_DIR="$HOME/.nvm"` before `nvm use`.
  - Ignored pnpm's update notice for 12.8.1 and its `curl | sh` suggestion.
  - The README documents only implemented commands.
  - `TOOLCHAIN.md` was updated with these corrections and the results.
- **Excluded:** No contracts or mobile packages, scripts, Turbo config, lint or TypeScript configs, Expo files, product dependencies, CI, or remote cache. `.idea/` was not hidden. No changes to MEGAsync settings, shell profiles, or home-folder files.
- **Verification:**
  - `corepack install` → `Adding pnpm@11.28.2 to the cache...`; `pnpm --version` → `11.28.2` under Node 24.17.0.
  - `pnpm add -w -D …` → exit 0. It printed `[WARN] deprecated eslint@9.39.5` (expected) and the update notice, with no peer or build warnings.
  - After `rm -rf node_modules`, `pnpm install --frozen-lockfile` → exit 0 (resolution skipped). This was repeated after adding `engineStrict`, and passed again.
  - Under Node 22.23.2: before `engineStrict`, the install gave a warning and exit 0; after, it failed with `ERR_PNPM_UNSUPPORTED_ENGINE` and exit 1.
  - A scan of `node_modules/.pnpm` found 0 packages with install hooks.
  - `pnpm exec tsc --version` → 6.0.3; `eslint --version` → v9.39.5; `turbo --version` → 2.11.6 (with `TURBO_TELEMETRY_DISABLED=1` for that command only).
  - `require.resolve` for `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`, and `turbo` → all inside `<repo>/node_modules/.pnpm`.
  - Inventory: exactly one `package.json` and one `pnpm-lock.yaml` outside `node_modules`, with no nested lockfile. `pnpm ls -r --depth -1` lists only the root.
  - `git check-ignore -v` confirmed the six ignore patterns. `.idea/vcs.xml`, `.env`, `.nvmrc`, `pnpm-lock.yaml`, and contracts `src` are not ignored.
  - The scratch doc validation (now excluding `node_modules`) passed over 19 Markdown files: 101 local links and anchors with 0 errors, and 13 child rows matching 13 cards (2 `Completed`). `git diff --check` passed.
  - Root lint and typecheck do not exist until MONO-001-D, so they were not run.
- **JSDoc/TSDoc:** Not applicable; no source code.
- **Remaining/blockers:**
  - The user's MEGAsync exclusion for `packages/contracts/dist/` should be in place before MONO-001-C builds.
  - `engineStrict` may reject a future dependency whose `engines` excludes Node 24; record and decide if that happens.
  - Turbo has no `turbo.json` yet (MONO-001-E).
- **Resume from:** Assign MONO-001-C when requested, using the C commands in `TOOLCHAIN.md`.
- **Ownership:** Released; no active task.

## 2026-10-03 — MONO-001-C: Empty contracts package compiles

- **Actor/session:** Claude Code / contracts-shell.
- **Status:** Completed; ownership released. Parent MONO-001 stays `In progress`.
- **Working copy:** `main` at `87bb91c`. At the user's request, the changes were committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "continue with MONO-001-C". Only the C card was executed.
- **Changes:**
  - Added `packages/contracts/package.json`: private `@ride-match/contracts` 0.0.0, `"type": "module"`, a single `exports["."]` with `types` → `./dist/index.d.ts` and `default` → `./dist/index.js`. Scripts: `build` (`tsc -p tsconfig.json`), `dev` (`--watch --preserveWatchOutput`), `typecheck` (`--noEmit`). The only dev dependency is `typescript` 6.0.3; there are no runtime dependencies.
  - Added `packages/contracts/tsconfig.json`, exactly as in `TOOLCHAIN.md`: es2022 target and lib, `nodenext`, `types: []`, strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, declarations, `src` → `dist`, `noEmitOnError`.
  - Added `packages/contracts/src/index.ts` with only `export {};` and a TSDoc note that schemas arrive with CONTRACT-001.
  - Added the root script `build:contracts` = `pnpm --filter @ride-match/contracts build`; MONO-001-E routes it through Turbo.
  - The lockfile gained the `packages/contracts` importer, which reuses the same TypeScript 6.0.3.
  - Updated the root `README.md` (commands table, layout), `TOOLCHAIN.md` (C results), `DEVELOPMENT.md`, `docs/README.md`, `ROADMAP.md`, `FIRST_STEPS.md` (C `Completed`), and `AI_CONTEXT.md`.
- **Decisions:** Added `"version": "0.0.0"` to the contracts manifest so it has an explicit workspace version. Recorded in `TOOLCHAIN.md`.
- **Excluded:** No Zod, schemas, sample data, tests, bundler, publishing setup, or mobile import. No ESLint in contracts (MONO-001-D) and no Turbo config (MONO-001-E). MEGAsync settings were not touched.
- **Verification:**
  - `pnpm --filter @ride-match/contracts add -D typescript@6.0.3` → exit 0.
  - `pnpm build:contracts` → exit 0. `dist/` holds exactly `index.js` and `index.d.ts`, each containing the doc comment and `export {};`.
  - `pnpm --filter @ride-match/contracts typecheck` → exit 0.
  - `node --input-type=module -e "await import('./packages/contracts/dist/index.js')"` → exit 0.
  - Importing by package name from `packages/contracts` → `import.meta.resolve('@ride-match/contracts')` is `<contracts>/dist/index.js`, and the import succeeds with 0 exports.
  - File-list check (`pnpm --filter @ride-match/contracts exec tsc -p tsconfig.json --listFilesOnly | grep -v "^<repo>/"`) → no output, grep exit 1. The list holds only TypeScript 6.0.3 lib files under `<repo>/node_modules/.pnpm` plus `packages/contracts/src/index.ts`; there are no `@types` packages.
  - Both `exports` targets exist; `dependencies` is none.
  - `git check-ignore` → both `dist` files are ignored by `packages/*/dist/`.
  - `pnpm install --frozen-lockfile` → exit 0.
  - Scratch doc validation passed over 19 Markdown files: 101 local links and anchors with 0 errors, and 13 child rows matching 13 cards (3 `Completed`). `git diff --check` passed, and the new contracts files have no trailing whitespace.
  - Root lint and typecheck do not exist until MONO-001-D. The `dev` watch script was not started; MOBILE-001-B verifies watch emission.
- **JSDoc/TSDoc:** Added a module-level TSDoc comment on `src/index.ts` explaining why the entry is empty and what belongs in the package.
- **Remaining/blockers:**
  - `packages/contracts/dist/` now exists. On 2026-10-03, the sync-root `.megaignore` did not yet exclude it, and MEGAsync was not running. The user still needs to add the exclusion.
  - Stale files in `dist/` are not cleaned by `build` (no source has been removed yet). Revisit if outputs drift, for example in MONO-001-E's cache-restoration check.
- **Resume from:** Assign MONO-001-D when requested, using the D commands and lint choices in `TOOLCHAIN.md`.
- **Ownership:** Released; no active task.

## 2026-10-03 — MONO-001-D: Typecheck and lint are real checks

- **Actor/session:** Claude Code / static-checks.
- **Status:** Completed; ownership released. Parent MONO-001 stays `In progress`.
- **Working copy:** `main` at `46a6865` (MONO-001-C, committed at the user's request). At the user's request, MONO-001-D was committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "commit and continue with MONO-001-D". Only the D card was executed.
- **Changes:**
  - Added root `eslint.config.mjs`. It uses `defineConfig` and `globalIgnores` from `eslint/config` and ignores `**/dist/`, `**/node_modules/`, and `apps/`, because mobile gets its own Expo config in MOBILE-001-A. For `packages/contracts/**/*.ts` it applies `@eslint/js` recommended plus `typescript-eslint` `recommendedTypeChecked`, with `projectService` and `tsconfigRootDir: import.meta.dirname`, and sets `@typescript-eslint/no-explicit-any` to `error`.
  - Contracts gained `lint` (`eslint .`) and the dev dependency `eslint` 9.39.5; the lockfile importer was updated.
  - Root scripts: `typecheck` = `pnpm -r run typecheck` and `lint` = `pnpm -r run lint` (direct wrappers until MONO-001-E routes them through Turbo).
  - Updated the root `README.md` commands, `TOOLCHAIN.md` (implementation and probe results), `DEVELOPMENT.md`, `docs/README.md`, `ROADMAP.md`, `FIRST_STEPS.md` (D `Completed`), and `AI_CONTEXT.md`.
- **Decisions:**
  - Type-aware `recommendedTypeChecked` rather than plain `recommended`, so async and promise correctness rules apply to contracts. A third probe confirmed this.
  - No formatting rules and no mock-import boundary rules; those are deferred.
- **Excluded:** No test runner, no Turbo config (MONO-001-E), and no mobile lint config (MOBILE-001-A). No `@ts-ignore`, blanket exclusions, disabled strictness, or success-only scripts.
- **Verification:**
  - `pnpm --filter @ride-match/contracts add -D eslint@9.39.5` → exit 0, with the expected deprecation warning. Contracts' `eslint` links to the same `.pnpm/eslint@9.39.5_supports-color@7.2.0` directory as the root's.
  - `pnpm typecheck` → exit 0; `pnpm lint` → exit 0.
  - `eslint . --debug` from `packages/contracts` → it used the root `eslint.config.mjs` with the repo root as base path, and linted only `src/index.ts`.
  - **Negative probes,** each a temporary file in `packages/contracts/src/`, deleted right after its run:
    - `__probe_type_error.ts` (`const probe: number = 'not a number'`) → `pnpm typecheck` failed with TS2322, exit 2.
    - `__probe_explicit_any.ts` (`(value: any)`) → `pnpm typecheck` exit 0, and `pnpm lint` failed with `@typescript-eslint/no-explicit-any`, exit 1.
    - `__probe_floating_promise.ts` (unawaited async call) → `pnpm lint` failed with `@typescript-eslint/no-floating-promises`, exit 1.
  - After the deletions, `src/` contains only `index.ts`.
  - **Final passes after cleanup:** `pnpm typecheck` 0, `pnpm lint` 0, `pnpm build:contracts` 0, `pnpm install --frozen-lockfile` ok. `git diff --check` passed. Scratch doc validation passed over 19 Markdown files: 102 local links and anchors with 0 errors, and 13 child rows matching 13 cards (4 `Completed`).
  - No Git reset or restore was used.
- **JSDoc/TSDoc:** Not applicable; config only. `eslint.config.mjs` has a short comment on why `apps/` is ignored.
- **Remaining/blockers:**
  - The MEGAsync exclusion for `packages/contracts/dist/` is still a pending user action.
  - Root lint does not lint root-level config files (none are TypeScript). Revisit if root scripts are added.
- **Resume from:** Assign MONO-001-E when requested; it ends with the MONO-001 checkpoint review.
- **Ownership:** Released; no active task.

## 2026-10-03 — MONO-001-E: Turbo wired; MONO-001 checkpoint passed

- **Actor/session:** Claude Code / turbo-checkpoint.
- **Status:** Completed; ownership released. Parent MONO-001 is now `Completed`.
- **Working copy:** `main` at `f5a6c93` (MONO-001-D, committed at the user's request). At the user's request, MONO-001-E was committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "commit and continue with MONO-001-E". Only the E card and its checkpoint review were executed.
- **Changes:**
  - Added root `turbo.json`:
    - `$schema` points to `./node_modules/turbo/schema.json`.
    - `ui: "tui"` and `agentGuidance: false`.
    - `build`: `dependsOn: ["^build"]`, `outputs: ["dist/**"]`.
    - `typecheck`: `dependsOn: ["^build"]`, no outputs.
    - `lint`: `dependsOn: ["^build"]`, `inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/eslint.config.mjs"]`, no outputs.
    - `dev`: `cache: false`, `persistent: true`.
  - Root scripts: `build:contracts` = `turbo run build --filter=@ride-match/contracts`, `typecheck` = `turbo run typecheck`, `lint` = `turbo run lint`. No root `build` or `dev` script; `dev` arrives in MOBILE-001-B.
  - Updated the root `README.md` (status, Turbo-backed commands, cache and telemetry notes) and `DEVELOPMENT.md` (Status column marking implemented and planned commands, with the owning task; the turbo.json summary). Updated `TOOLCHAIN.md` (implemented config, observed behavior, scripts table, E commands, E verification), `docs/README.md`, `ROADMAP.md` (MONO-001 `Completed`), `FIRST_STEPS.md` (E `Completed`), and `AI_CONTEXT.md`.
- **Decisions:**
  - `agentGuidance: false`: Turbo 2.11.6 otherwise maintains a managed block in the root `AGENTS.md` whenever it detects an AI coding agent. `AGENTS.md` is the curated shared rule file, so tools must not inject blocks into it. The block was never written: `AGENTS.md` was unchanged after every Turbo run. Turbo's version-matched docs are at `node_modules/turbo/docs/`.
  - Lint hashes the root `eslint.config.mjs`, because contracts lint depends on a file outside the package. `globalDependencies` was not used, because it would also invalidate `build` and `typecheck`.
  - The local schema path keeps editor validation matched to the installed Turbo version.
  - Telemetry was left at the user's default. Assistant commands set `TURBO_TELEMETRY_DISABLED=1` in their own environment only. `README.md` and `TOOLCHAIN.md` document the opt-out.
- **Excluded:** No Expo initialization, no root `dev`, mobile, native, test, or doctor scripts, no remote cache, no CI, and no package-level `turbo.json`.
- **Verification** (Node 24.17.0, pnpm 11.28.2, Turbo 2.11.6; `TURBO_TELEMETRY_DISABLED=1` in assistant commands):
  - `pnpm exec turbo run build --dry-run=json` → exit 0.
    - `packages` is `["@ride-match/contracts"]`.
    - There is one task, `@ride-match/contracts#build`, with outputs `dist/**`, command `tsc -p tsconfig.json`, and no dependencies.
  - `pnpm exec turbo run build typecheck lint dev --dry-run=json` → exit 0.
    - `monorepo: true`, `envMode: strict`.
    - All four contracts tasks have no dependencies or dependents.
    - `dev` is `cache: false`, `persistent: true`. No task depends on `dev`.
    - The lint input files include `../../eslint.config.mjs`.
    - No root (`//#`) task is present, so the root scripts cannot recurse.
  - `pnpm install --frozen-lockfile` → "Already up to date", exit 0.
  - `pnpm build:contracts`, `pnpm typecheck`, `pnpm lint` → each a cache miss and then success, exit 0. Without a terminal, Turbo streamed its output.
  - **Cache restoration:**
    - `dist/` held `index.js` and `index.d.ts`, with equal SHA-1 hashes, because both contain only the comment and `export {}`.
    - After moving `dist/` to a scratch backup, `pnpm build:contracts` reported "cache hit, replaying logs" and `FULL TURBO`.
    - `diff -r` between the backup and the restored `dist/` showed no differences.
    - Importing `@ride-match/contracts` in Node from the package resolved to `dist/index.js`.
  - Repeated `pnpm typecheck` and `pnpm lint` → cache hits.
  - **Lint hash probe:** appending a comment to `eslint.config.mjs` changed the lint hash from `0a3568a4c3dcf735` to `f08961d7b063d19b`. Restoring the file from a byte copy returned the hash to `0a3568a4c3dcf735`, and `git diff` showed no change.
  - **Negative probes through Turbo** (temporary files, deleted after each run; `src/` again contains only `index.ts`):
    - Type error → `pnpm typecheck` exit 2 (TS2322, `Failed: @ride-match/contracts#typecheck`).
    - Explicit `any` → `pnpm lint` exit 1 (`@typescript-eslint/no-explicit-any`).
    - Afterwards, typecheck and lint were cache hits again, so the failures were not cached.
  - `pnpm typecheck` under `script` (a pseudo-terminal, stdin from `/dev/null`) → exit 0 within 1 second. The captured output does not show whether the `tui` interface was used. Interactive TUI key handling was not verified; MOBILE-001-B checks it with the persistent `dev` task.
  - Turbo wrote only `.turbo/cache/` and `packages/contracts/.turbo/turbo-{build,typecheck,lint}.log`, all ignored by `.turbo/`. No `~/Library/Application Support/turborepo` or `~/Library/Caches/turborepo` directory was created.
  - **Checkpoint review:**
    - **Real scripts:** root scripts call `turbo run`; package scripts call `tsc` and `eslint`; there are no success-only placeholders.
    - **Exports:** `types` and `default` both exist after a build.
    - **Narrow dependencies:** `pnpm ls -r --depth 0` shows root dev dependencies only (`@eslint/js`, `eslint`, `turbo`, `typescript`, `typescript-eslint`) and contracts dev dependencies only (`eslint`, `typescript`). Neither has runtime or peer dependencies.
    - **Empty app directories:** `apps/mobile/` and `apps/api/` are empty and have no manifests.
    - **No tracked artifacts:** `git ls-files` has no `dist/`, `.turbo/`, `node_modules/`, or `*.tsbuildinfo` entries.
    - **Ancestor guard:** the compiler file-list check printed nothing outside the repo.
    - **Docs:** a grep for pre-E wording ("until MONO-001-E", "do not exist yet", "MONO-001 is in progress") found only intentional history.
    - **MONO-001 parent criteria:** contracts build from the root; package boundaries and script behavior are documented in `README.md`, `DEVELOPMENT.md`, and `TOOLCHAIN.md`; no mobile or API package was invented.
  - `git diff --check` passed. Scratch doc validation passed over 19 Markdown files: 104 local links and anchors with 0 errors, 13 child rows matching 13 cards (5 `Completed`), and 25 roadmap tasks (`Completed`, `Planned`).
  - No Git reset or restore was used.
- **JSDoc/TSDoc:** Not applicable; configuration and documentation only. JSON cannot hold comments, so the reasons for `turbo.json` choices are recorded in `TOOLCHAIN.md`.
- **Remaining/blockers:**
  - The MEGAsync exclusion for `packages/contracts/dist/` is still a pending user action. On 2026-10-03, the sync-root `.megaignore` was unchanged (dated 2025-12-05) and MEGAsync was not running.
  - Interactive TUI behavior is unverified until MOBILE-001-B.
  - Turbo telemetry remains at the user's default.
  - `build` does not clean stale files in `dist/`, and cache restoration does not delete extra files either. Revisit when source files are removed.
- **Resume from:** Assign MOBILE-001-A when requested.
- **Ownership:** Released; no active task.

## 2026-10-03 — MOBILE-001-A: Minimal Expo Router shell

- **Actor/session:** Claude Code / expo-shell.
- **Status:** Completed; ownership released. Parent MOBILE-001 is now `In progress`.
- **Working copy:** `main` at `2e93390` (MONO-001-E, committed at the user's request). At the user's request, MOBILE-001-A was committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "commit and continue with MOBILE-001-A". Only the A card was executed.
- **Changes:**
  - **`apps/mobile/package.json`:** `@ride-match/mobile`, private, version `0.0.0`, `main: "expo-router/entry"`. Scripts: `start` (`expo start --dev-client`), `typecheck` (`tsc --noEmit -p tsconfig.json`), `lint` (`eslint .`).
  - **Exact dependencies:**
    - Runtime: `expo` 57.0.26, `react` 19.2.3, `react-native` 0.86.3, `expo-router` 57.0.24, `react-native-safe-area-context` 5.7.0, `react-native-screens` 4.26.2, `expo-linking` 57.0.11, `expo-constants` 57.0.20, `expo-status-bar` 57.0.1, and `expo-dev-client` 57.0.19.
    - Peer pins: `react-native-reanimated` 4.5.1, `react-native-worklets` 0.10.1, and `react-dom` 19.2.3.
    - Dev: `typescript` 6.0.3, `@types/react` 19.2.18, `eslint` 9.39.5, `eslint-config-expo` 57.0.2, and `@react-native/metro-config` 0.86.3.
  - **`app.config.ts`:** typed `ExpoConfig` with name `Ride Match`, slug and scheme `ride-match`, and iOS `bundleIdentifier` / Android `package` `com.ridematch.dev`, commented as provisional. No plugins, typed routes, icons, or extra settings.
  - **`tsconfig.json`:** extends `expo/tsconfig.base` with `strict: true`, `types: []`, and includes `**/*.ts` and `**/*.tsx`.
  - **`eslint.config.js`:** `eslint-config-expo/flat`; ignores `dist/*`, `.expo/*`, `android/*`, `ios/*`; and `no-explicit-any` as an error for `**/*.ts`, `**/*.tsx`, and `**/*.d.ts`.
  - **`.gitignore`:** the TOOLCHAIN entries, anchored to `apps/mobile`.
  - **Routes:**
    - `app/_layout.tsx` is a root `Stack`, with the `index` header hidden.
    - `app/index.tsx` is a thin route rendering `MapPlaceholderScreen`.
    - `src/features/map/MapPlaceholderScreen.tsx` shows static “Ride Match” (accessibility header) and “Map coming soon”, with a TSDoc comment.
  - `pnpm-workspace.yaml`: `allowBuilds: { unrs-resolver: false }`, with a comment. `pnpm-lock.yaml` gained the mobile importer.
  - Docs updated: `TOOLCHAIN.md`, the root `README.md`, `DEVELOPMENT.md`, `ARCHITECTURE.md` (which parts of the structure exist), `docs/README.md`, `ROADMAP.md`, `FIRST_STEPS.md`, and `AI_CONTEXT.md`.
- **Decisions:**
  - **Peer pins (correcting TOOLCHAIN).** `expo-router` 57.0.24 depends on `react-native-drawer-layout`, which requires `react-native-reanimated`, and on `vaul` and Radix, which require `react-dom`. pnpm auto-installed the highest matching versions, and `pnpm peers check` exited 1 with three unmet peers:
    - worklets 0.13.0 for `expo-modules-core`'s `^0.7.4` … `^0.10.0`;
    - `@react-native/metro-config` 0.87.1 for `community-cli-plugin`'s `0.86.3` (it also added Metro 0.87.1);
    - `react` 19.2.3 for `react-dom` 19.3.0's `^19.3.0`.

    Following TOOLCHAIN's rule to add mismatched peers at Expo versions, I declared Expo SDK 57's `bundledNativeModules.json` versions (reanimated 4.5.1, worklets 0.10.1, `react-dom` 19.2.3) and React Native's matching `@react-native/metro-config` 0.86.3. No `overrides` or `peerDependencyRules` were used. All four were published between 2025-12-11 and 2026-08-24, well beyond pnpm's one-day minimum.
  - **`unrs-resolver` build denied.** Its postinstall only downloads a missing native binding, and pnpm installed `@unrs/resolver-binding-darwin-arm64`.
  - **Lint `files` scope.** `eslint-config-expo` registers `@typescript-eslint` only for TS globs, so the extra rule block needs `files`.
  - **No Babel or Metro config, and no `expo-router` plugin entry.** The current manual-install docs require only `main` and `scheme`; the Babel config is optional.
  - **Explicit placeholder colors**, so the text stays readable in any system theme; no theming system.
- **Excluded:**
  - No auth routes, tabs, native map, providers, Query, branding or icons, `@ride-match/contracts` dependency, or root `dev`/export/native/doctor scripts (B).
  - No tests (F). No `expo start`, prebuild, or native build (G/H).
- **Verification** (Node 24.17.0, pnpm 11.28.2; `TURBO_TELEMETRY_DISABLED=1`, `EXPO_NO_TELEMETRY=1`, and `CI=1` in assistant commands only):
  - **Installs:**
    - The first `pnpm --filter @ride-match/mobile add …` (runtime) exited 0, warning about deprecated `eslint` 9.39.5 and `uuid` 7.0.3 and about peer issues.
    - `add -D …` exited 1 with `ERR_PNPM_IGNORED_BUILDS` for `unrs-resolver@1.12.2`. After adding `allowBuilds`, `pnpm install` exited 0.
    - `pnpm peers check` exited 1 (three unmet peers, above) until the pins were added. It then reported "No peer dependency issues found".
    - After deleting all `node_modules` directories (generated), `pnpm install --frozen-lockfile` exited 0, and `pnpm peers check` passed again. The tree had one reanimated (4.5.1), one worklets (0.10.1), one `react-dom` (19.2.3), one `@react-native/metro-config` (0.86.3), Metro 0.84.5 and 0.84.6, and no Metro 0.87.
  - **Ancestor guards:**
    - `require.resolve` for `react`, `react-native`, `expo`, `expo-router`, reanimated, worklets, and `react-dom` resolved inside the repository's `node_modules/.pnpm`.
    - The mobile `tsc --listFilesOnly` check printed nothing outside the repo: 605 files, 4 app sources, and `@types/react` as the only `@types` package.
  - **Static checks:**
    - `pnpm typecheck` → exit 0 for contracts and mobile.
    - The first `pnpm lint` → exit 2, because `@typescript-eslint` was not found while linting `eslint.config.js`. After scoping the rule, `pnpm lint` → exit 0.
    - `eslint . --debug` in `apps/mobile` used `apps/mobile/eslint.config.js` (base path `apps/mobile`) and linted `app.config.ts`, `app/_layout.tsx`, `app/index.tsx`, `src/features/map/MapPlaceholderScreen.tsx`, and `eslint.config.js`.
  - **Negative probes** (temporary `apps/mobile/src/__probe_mobile.tsx`, deleted; `src/` again holds only `features/map/MapPlaceholderScreen.tsx`):
    - Type error → `pnpm typecheck` exit 2 (TS2322).
    - Explicit `any` → `pnpm lint` exit 1 (`@typescript-eslint/no-explicit-any`).
    - Missing import → `eslint` exit 1 (`import/no-unresolved`).
  - **Expo checks:**
    - In `apps/mobile`, `pnpm exec expo config --type public --json` → exit 0, showing name `Ride Match`, slug and scheme `ride-match`, `sdkVersion` 57.0.0, `version` 0.0.0, and iOS and Android `com.ridematch.dev`. There are no plugins and no experiments; `platforms` defaults to ios, android, and web.
    - `pnpm exec expo install --check` → "Dependencies are up to date", exit 0.
    - `pnpm exec expo export --platform android` → exit 0: a 2.7 MB Hermes bundle and 27 assets.
    - `pnpm exec expo export --platform ios` → exit 0: a 2.3 MB Hermes bundle and 23 assets.
    - Both export logs contain no warnings or errors and print "Expo Autolinking module resolution enabled".
  - **Bundle contents:** an extra Android export with `--source-maps --output-dir` into the session scratch directory (outside the synced checkout) listed 1,230 sources.
    - All were under the repository root, with 0 from `/Users/home/node_modules`.
    - App sources: the `app` route context, `app/_layout.tsx`, `app/index.tsx`, and `src/features/map/MapPlaceholderScreen.tsx`.
    - `react-native-worklets` is bundled; reanimated and `react-dom` are not.
    - The Hermes bundle contains "Ride Match" and "Map coming soon".
  - **Git status after the exports:** only the 8 authored `apps/mobile` files are untracked. `apps/mobile/{.expo,.turbo,dist,node_modules}/` are ignored (`git check-ignore` matched `.gitignore` lines 2 and 3). `tsconfig.json` was unchanged, and no `expo-env.d.ts` was created.
  - `apps/mobile/dist/` (generated) and the scratch exports were then deleted, because the MEGAsync exclusion is still pending.
  - **Turbo graph:** the `--dry-run=json` graph lists `@ride-match/contracts` and `@ride-match/mobile`. Mobile has `typecheck` and `lint`; its `build` and `dev` are `<NONEXISTENT>` and skipped. No API package. `apps/api/` has 0 entries.
  - **Final passes after the doc updates:** `pnpm install --frozen-lockfile` 0, `pnpm peers check` 0, `pnpm build:contracts` 0, `pnpm typecheck` 0 and `pnpm lint` 0 (both packages), and `git diff --check` ok; `AGENTS.md` and `CLAUDE.md` are unchanged. Scratch doc validation passed over 19 Markdown files: 104 local links and anchors with 0 errors, 13 child rows matching 13 cards (6 `Completed`), and roadmap statuses `Completed`, `In progress`, `Planned`.
  - **Not run:** `expo start` (interactive; B), native builds (G/H), and tests (F). Exports do not prove native startup.
- **JSDoc/TSDoc:**
  - Added TSDoc to `MapPlaceholderScreen`: its temporary purpose, that it does no location, network, or auth work, and that MAP-001 replaces it.
  - The route files are thin defaults without comments.
  - `app.config.ts` notes that the identifiers are provisional, and `eslint.config.js` explains the `files` scope.
- **Remaining/blockers:**
  - The MEGAsync exclusions for `packages/contracts/dist/` and `apps/mobile/dist/` are pending user actions.
  - Expo's default `platforms` includes web, so exports must always pass `--platform`.
  - Metro 0.84.5 and 0.84.6 coexist, with no failure observed.
  - Native startup, `expo start`, and the dev client are unverified until B, G, and H.
- **Resume from:** Assign MOBILE-001-B when requested.
- **Ownership:** Released; no active task.

## 2026-10-03 — MOBILE-001-B: Shared package and development commands

- **Actor/session:** Claude Code / dev-commands.
- **Status:** Completed; ownership released. Parent MOBILE-001 stays `In progress`.
- **Working copy:** `main` at `c924bf1` (MOBILE-001-A, committed at the user's request). At the user's request, MOBILE-001-B was committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "commit and continue with MOBILE-001-B". Only the B card was executed.
- **Changes:**
  - **Mobile dependencies:** `@ride-match/contracts: workspace:*` (linked to `packages/contracts`) and dev dependency `expo-doctor` 1.20.4. The lockfile was updated.
  - **`apps/mobile/src/bootstrap/checkContractsPackage.ts`:** a temporary side-effect `import '@ride-match/contracts'`. Its TSDoc gives the purpose and the removal condition. `app/_layout.tsx` imports it, with a one-line "Temporary" comment.
  - **Mobile scripts:** `dev` (`expo start --dev-client`), `android` (`expo run:android`), `ios` (`expo run:ios`), `export:android`, `export:ios`, and `doctor` (`expo-doctor`).
  - **Root scripts:**
    - `dev` = `turbo run dev --filter=@ride-match/mobile`.
    - `dev:mobile` = `pnpm build:contracts && pnpm --filter @ride-match/mobile start`.
    - `doctor:mobile` = `pnpm --filter @ride-match/mobile run doctor`.
    - `export:android`/`export:ios` and `mobile:android`/`mobile:ios` = `pnpm build:contracts && pnpm --filter @ride-match/mobile <script>`.
  - **`turbo.json`:** `@ride-match/mobile#dev` with `dependsOn: ["^build"]`, `with: ["@ride-match/contracts#dev"]`, `cache: false`, `persistent: true`, and `passThroughEnv` set to `EXPO_*`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `REACT_NATIVE_PACKAGER_HOSTNAME`, `RCT_METRO_PORT`, `EDITOR`, `VISUAL`, `HTTP_PROXY`, and `TMPDIR`.
  - **Docs:** `TOOLCHAIN.md` (dev task evidence, the doctor naming, Metro resolution, B commands and results), the root `README.md` (new commands), `DEVELOPMENT.md` (statuses), `FIRST_STEPS.md` (B `Completed`; B's work and check lines and H's check line now say `doctor:mobile`), `ROADMAP.md` (progress, and `pnpm doctor:mobile` in the MOBILE-001 and QA-001 verification lines), `ARCHITECTURE.md`, `docs/README.md`, and `AI_CONTEXT.md`.
- **Decisions:**
  - **`doctor:mobile` instead of `doctor`.** pnpm 11.28.2's built-in `pnpm doctor` shadows a root `doctor` script. The first `pnpm doctor` run printed pnpm's own installation checks ("All checks passed with 1 warning(s)", exit 0) without checking the app. `pnpm --filter @ride-match/mobile doctor` also printed the built-in's usage. The roadmap verification lines were updated, so a plain `pnpm doctor` can no longer look like an app check.
  - **The doctor wrapper does not build contracts**, because `expo-doctor` does not load package output. TOOLCHAIN's prose was corrected to match its table.
  - **`passThroughEnv` from evidence:**
    - The list comes from `@expo/cli` 57.0.27's `build/` sources, plus `TMPDIR`. Metro's default cache is `os.tmpdir()/metro-cache`, and Turbo filtered `TMPDIR`, so dev would otherwise use `/tmp/metro-cache` while exports use the user's temp directory.
    - `NODE_ENV`, `BABEL_ENV`, web-only `BROWSER*`, and HTTPS certificate variables are deliberately not passed.
  - **Package-specific `@ride-match/mobile#dev` in the root `turbo.json`**, not a package `turbo.json`, to keep one Turbo file.
- **Excluded:** No schemas, fake exports, runtime banners, Metro/Babel config, resolver or hoisting changes, native builds, device permissions, or tests.
- **Verification** (Node 24.17.0, pnpm 11.28.2; `TURBO_TELEMETRY_DISABLED=1`, `EXPO_NO_TELEMETRY=1`, and `CI=1` for non-interactive Expo runs, in assistant commands only):
  - **Installs:** both `pnpm --filter @ride-match/mobile add …` commands exited 0. `pnpm peers check` reported "No peer dependency issues found". The final `pnpm install --frozen-lockfile` exited 0.
  - **Turbo ordering:**
    - `pnpm exec turbo run dev --filter=@ride-match/mobile --dry-run=json` lists `contracts#build` (dependent: `mobile#dev`), `contracts#dev` (persistent, uncached, no dependencies), and `mobile#dev` (depends on `contracts#build`, persistent, uncached, with the pass-through list).
    - `turbo run build typecheck lint --dry-run=json` shows mobile `build`, `typecheck`, and `lint` each depending on `contracts#build`.
  - **Static checks:** `pnpm typecheck` and `pnpm lint` → 3 tasks each (including `contracts#build`), exit 0.
  - **Exports:** `pnpm export:android` and `pnpm export:ios` → exit 0, each restoring contracts from the cache (`FULL TURBO`).
    - Android: a 2.7 MB Hermes bundle and 27 assets. iOS: 2.3 MB and 23 assets.
    - Neither log has warnings or errors; the only match is the `error.png` asset name.
  - **Metro resolution:**
    - Production source maps in scratch (Android: 1,231 sources; iOS: 1,097) include `src/bootstrap/checkContractsPackage.ts` and no sources from outside the repository. They omit the empty contracts module.
    - An unminified `--dev --no-bytecode --no-minify` Android export in scratch shows module 1395 (`src/bootstrap/checkContractsPackage.ts`) requiring module 1396, `../../packages/contracts/dist/index.js`.
    - With contracts `dist/` moved to scratch, `pnpm --filter @ride-match/mobile export:android` exited 1 with "While trying to resolve module `@ride-match/contracts` … specifies a `main` module field that could not be resolved". `pnpm export:android` then restored `dist/` from cache and exited 0, and `diff -r` against the backup showed no differences.
  - **`pnpm doctor:mobile`** → `expo-doctor` 1.20.4 (`--version`): "Running 21 checks on your project... 21/21 checks passed. No issues detected!", exit 0.
  - **`pnpm dev` in a pseudo-terminal** (Python `pty`, 220×50, `TERM=xterm-256color`):
    - **Startup:** contracts `dist/` was moved away first. Metro `/status` answered `packager-status:running`, and `dist/` was recreated identically.
    - **Processes:** turbo, `pnpm run dev` ×2, `tsc -p tsconfig.json --watch --preserveWatchOutput`, and `expo/bin/cli start --dev-client`.
    - **Watcher:** creating `packages/contracts/src/__probe_watch.ts` emitted `dist/__probe_watch.js` and `.d.ts` within about 1 second.
    - **Keys:** the TUI listed `contracts#build`, `contracts#dev`, and `mobile#dev`. After `j`, `i`, and `?`, Expo printed its verbose-only lines ("shift+a … select an Android device or emulator", "c │ show project QR"), which per `commandsTable.js` appear only after `?`.
    - **Interrupt:** `Ctrl+z` then `Ctrl+C` exited Turbo, and no process remained.
    - **Cleanup:** probe source and outputs were deleted. `dist/` again holds `index.d.ts` and `index.js`; `src/` holds only `index.ts`.
  - **Environment probe (second and third `pnpm dev` runs, `ps eww` on the Expo process):**
    - Present: `EXPO_NO_TELEMETRY`, `ANDROID_HOME` (set only for the probe), `PATH`, `HOME`, `TERM`, `TURBO_TELEMETRY_DISABLED`.
    - `TMPDIR` was missing until it was added to the list; then it was present.
    - The undeclared `RIDE_MATCH_PROBE_NOT_DECLARED` was absent, and the `tsc` watcher received none of the mobile variables.
    - `Ctrl+C` alone stopped everything.
    - One check printed a false "leftover" match (my own shell command line). `pgrep -fl "expo/bin/cli start|typescript/bin/tsc|turbo run|darwin-arm64/bin/turbo"` found nothing, and port 8081 was free.
  - **`pnpm dev:mobile` in a pseudo-terminal:** contracts built first, Metro started, and `Ctrl+C` stopped it with nothing left.
  - **Help probe:** `pnpm <script> --help` for `dev`, `export:android`, `mobile:ios`, and `dev:mobile` printed only tool help; no build ran, and no `android/`/`ios/` directories were created.
  - `apps/mobile/dist/` (generated) was deleted after the checks, because the MEGAsync exclusion is still pending.
  - **Final passes after the doc updates:** `pnpm install --frozen-lockfile` 0, `pnpm peers check` 0, `pnpm build:contracts` 0, `pnpm typecheck` 0, `pnpm lint` 0, and `git diff --check` ok. `AGENTS.md` and `CLAUDE.md` are unchanged, and no `expo`, `tsc`, or `turbo` process is running. Scratch doc validation found 0 errors in 106 local links and anchors across 20 Markdown files: the 19 project files plus Expo's generated, ignored `apps/mobile/.expo/README.md`. It also found 13 child rows matching 13 cards (7 `Completed`).
  - **Not run:** `pnpm mobile:android`/`mobile:ios` (native builds; G/H) and tests (F).
- **JSDoc/TSDoc:** Added TSDoc to `checkContractsPackage.ts` covering its purpose, why it is safe (no exports, no runtime behavior), and when to remove it. There is a one-line comment at its import in `_layout.tsx`. JSON configs cannot hold comments, so the `turbo.json` reasons are in `TOOLCHAIN.md`.
- **Remaining/blockers:**
  - MEGAsync exclusions for `packages/contracts/dist/` and `apps/mobile/dist/` are still pending user actions.
  - Native development builds, dev-client startup, and opening apps with `a`/`i` are unverified until MOBILE-001-G/H.
  - `LANG` pass-through is untested (unset in the probing shell). It matters only for CocoaPods, which runs outside Turbo.
  - Remove the bootstrap smoke import once a real contract consumer exists.
- **Resume from:** Assign MOBILE-001-C when requested.
- **Ownership:** Released; no active task.

## 2026-10-03 — MOBILE-001-C: Screen and Button primitives

- **Actor/session:** Claude Code / ui-primitives.
- **Status:** Completed; ownership released. Parent MOBILE-001 stays `In progress`.
- **Working copy:** `main` at `2a4906a` (MOBILE-001-B, committed at the user's request). At the user's request, MOBILE-001-C was committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "commit and continue with MOBILE-001-C". Only the C card was executed.
- **Changes:**
  - **`apps/mobile/src/ui/Screen.tsx`:** a `SafeAreaView` from `react-native-safe-area-context` with `flex: 1`, a white background, and 24-point padding. Insets for the requested edges are added on top of the padding (the library's default `additive` mode). It has a typed `edges?: readonly Edge[]` prop, defaulting to all four.
  - **`apps/mobile/src/ui/Button.tsx`:** a `Pressable` with `accessibilityRole="button"` and props `label`, `onPress`, `disabled` (default `false`), and `accessibilityLabel` (optional). It has a 48-point minimum height, 0.8 opacity while pressed, and 0.4 when disabled.
  - **`MapPlaceholderScreen`:** now renders inside `Screen`. Its own padding and background moved into `Screen`; the text and TSDoc are unchanged.
  - **Docs:** `FIRST_STEPS.md` (C `Completed`), `ROADMAP.md`, `ARCHITECTURE.md`, `docs/README.md`, and `AI_CONTEXT.md`.
- **Decisions:**
  - **No root layout change.** Expo Router 57.0.24's `ExpoRoot` already wraps the app in `SafeAreaProvider`.
  - **`edges` prop, so insets apply once.** Native code in `react-native-safe-area-context` 5.7.0:
    - **iOS:** `RNCSafeAreaView.m` applies the nearest provider's `safeAreaInsets` unchanged.
    - **Android:** `SafeAreaUtils.kt` subtracts the view's position.

    So on iOS, a top inset under a visible native header or inside a modal sheet would double the gap. Screens without chrome use the default; D's header or modal screens omit `'top'`. The TSDoc records this ownership rule.
  - **Button disabled state.** React Native 0.86.3's `Pressable` merges `disabled` into `accessibilityState` (`Pressable.js`), so no explicit `accessibilityState` is needed. Without `accessibilityLabel`, the accessible name comes from the visible label text.
  - Fixed neutral colors (`#111111` and `#ffffff`). No theme, variants, icons, or animation.
- **Excluded:** No design system, theme provider, variants, sheets or animation, global store, domain imports, or new dependencies. `package.json` and `pnpm-lock.yaml` are unchanged. Button has no consumer yet (D) and no tests (F).
- **Verification:**
  - `pnpm typecheck` → 3 tasks, exit 0. `pnpm lint` → 3 tasks, exit 0. Mobile ESLint now also lints `src/ui/Button.tsx` and `src/ui/Screen.tsx`.
  - **Type probe** (temporary `apps/mobile/src/__probe_ui.tsx`, deleted): mobile `tsc --noEmit` reported:
    - TS2322 for `edges={['middle']}`.
    - TS2741 for a `Button` without `onPress`.
    - TS2322 for a numeric `label`.
    - TS2322 for an unknown `variant` prop.
  - **Inset inspection:** `grep` for `SafeAreaView`, `useSafeAreaInsets`, and `SafeAreaProvider` in `apps/mobile/app` and `src` matches only `src/ui/Screen.tsx`. The home route hides the stack header, and `Screen` uses all edges, so each inset is applied once on home.
  - **Disabled and accessibility inspection:** the role is `button`; `disabled` reaches `Pressable` (presses blocked, state announced); the label is the accessible name unless overridden.
  - **Export check:** after `pnpm build:contracts`, `expo export --platform android --source-maps --output-dir <session scratch>` (in `apps/mobile`) exited 0.
    - App sources: the route context, `_layout.tsx`, `checkContractsPackage.ts`, `index.tsx`, `MapPlaceholderScreen.tsx`, and `src/ui/Screen.tsx`, plus the library's `src/SafeAreaView.tsx`.
    - `Button.tsx` is not bundled yet, because nothing uses it.
    - The scratch output was deleted, and no `apps/mobile/dist/` was created.
  - **Final passes after the doc updates:** `pnpm install --frozen-lockfile` 0, `pnpm typecheck` 0, `pnpm lint` 0, and `git diff --check` ok. Scratch doc validation found 0 errors in 106 local links across 20 Markdown files: the 19 project files plus Expo's ignored `.expo/README.md`. It also found 13 child rows matching 13 cards (8 `Completed`).
  - **Not run:** executable Button assertions (grouped into MOBILE-001-F) and on-device inset checks (G/H).
- **JSDoc/TSDoc:**
  - `Screen`: inset ownership, the iOS doubling caveat, additive padding, and the provider source.
  - `Button`: disabled behavior, including the screen-reader announcement; when to use `accessibilityLabel`; the touch-target size.
- **Remaining/blockers:**
  - On-device inset rendering, especially iOS headers and modals in D, is unverified until G/H.
  - The MEGAsync exclusions for `packages/contracts/dist/` and `apps/mobile/dist/` are still pending.
- **Resume from:** Assign MOBILE-001-D when requested.
- **Ownership:** Released; no active task.

## 2026-10-03 — MOBILE-001-D: Auth navigation placeholders

- **Actor/session:** Claude Code / auth-placeholders.
- **Status:** Completed; ownership released. Parent MOBILE-001 stays `In progress`.
- **Working copy:** `main` at `76c8477` (MOBILE-001-C, committed at the user's request). At the user's request, MOBILE-001-D was committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "commit and continue with MOBILE-001-D". Only the D card was executed.
- **Changes:**
  - **`app/_layout.tsx`:** `export const unstable_settings = { anchor: 'index' }`. The root `Stack` has `index` (no header) and `auth` (`presentation: 'modal'`, no header). The bootstrap import is unchanged.
  - **`app/auth/_layout.tsx`:** a headerless `Stack` with `unstable_settings = { anchor: 'phone' }`.
  - **Thin routes:**
    - `app/auth/phone.tsx` renders `PhonePlaceholder`, with `onPreviewCode` = `router.push('/auth/otp')` and `onClose` = `router.dismissTo('/')`.
    - `app/auth/otp.tsx` renders `OtpPlaceholder`, with `onBack` = `router.dismissTo('/auth/phone')` and `onClose` = `router.dismissTo('/')`.
  - **`src/features/auth/AuthPlaceholderScreens.tsx`:**
    - An internal layout: `Screen` with platform edges, a header title, and the notice "Sign-in is not available yet. This preview only shows navigation; no phone number or code is collected."
    - `PhonePlaceholder`: "Preview code step" and "Close" (spoken as "Close sign-in").
    - `OtpPlaceholder`: "Back" (spoken as "Back to phone step") and "Close".
  - **Home:** `MapPlaceholderScreen` takes `onSignIn` and shows a "Sign in" `Button`; `app/index.tsx` wires `router.push('/auth/phone')`.
  - **Docs:** `PRODUCT.md` (a current-shell note under Navigation), the root `README.md`, `ARCHITECTURE.md`, `docs/README.md`, `ROADMAP.md`, `FIRST_STEPS.md` (D `Completed`), and `AI_CONTEXT.md`.
- **Decisions:**
  - **Navigation calls.** Close uses `dismissTo('/')`, which Expo Router 57.0.24 implements as `linkTo(href, { event: 'POP_TO' })`. It returns to the existing home instead of pushing a new one, and its documented fallback replaces the current screen when home is absent. OTP Back uses `dismissTo('/auth/phone')` for the same reason, so a directly opened OTP screen still reaches the phone step.
  - **Anchors** make deep links into `/auth/...` build home (and phone) beneath. `getRoutesCore.js` reads `unstable_settings.anchor ?? initialRouteName`.
  - **Headers hidden** in the auth stack. Explicit Back and Close buttons use C's `Button`. Android hardware back and iOS swipe gestures still follow the stack.
  - **Auth `Screen` edges by platform.** On iOS, the vendored native stack treats `modal` as a sheet: `NativeStackView.native.js` sets the header `topInset` to 0 for iOS modals. Fabric's `RNCSafeAreaViewComponentView.mm` applies the provider's window insets unchanged, so iOS omits `'top'`. Android presents the modal full screen and keeps all edges.
  - The routes stay thin: they only map callbacks to router calls. The components are presentational, for F's tests.
- **Excluded:** No phone or code inputs, validation, OTP service, session or signed-in state, credential storage, protected-action continuation, data source, or new dependencies. `package.json` and the lockfile are unchanged.
- **Verification:**
  - **Static checks:** `pnpm typecheck` → 3 tasks, exit 0. `pnpm lint` → 3 tasks, exit 0.
  - **Exports:** `pnpm export:android` → exit 0, 2.7 MB Hermes bundle. `pnpm export:ios` → exit 0, 2.3 MB. The logs have no warnings or errors apart from the `error.png` asset name.
  - **Bundled sources:** an iOS `--source-maps` export into the session scratch directory listed these app sources: the route context, `app/_layout.tsx`, `checkContractsPackage.ts`, `app/auth/_layout.tsx`, `app/auth/otp.tsx`, `src/features/auth/AuthPlaceholderScreens.tsx`, `src/ui/Button.tsx`, `src/ui/Screen.tsx`, `app/auth/phone.tsx`, `app/index.tsx`, and `MapPlaceholderScreen.tsx`. The scratch output and `apps/mobile/dist/` were deleted afterwards.
  - **Route-tree probe:** in Node, Expo Router's `getRoutesCore.getRoutes` ran on a stand-in context with the same five files and the same `unstable_settings`. It printed `(root)` with `initialRouteName=index` (children `index` and `auth`), and `auth` with `initialRouteName=phone` (children `phone` and `otp`).
    - Computing deep-link state needs `getReactNavigationConfig`, which imports `react-native` (Flow source; `SyntaxError` in plain Node), so it was not run. MOBILE-001-F's Jest harness covers it.
  - **Inspection:**
    - Browsing has no gate.
    - `grep` for `TextInput`, `useState`, `useReducer`, `SecureStore`, `fetch(`, and `AsyncStorage` in `apps/mobile/app` and `src` found nothing.
    - The stack is home → modal auth (phone → otp). Close returns to home through POP_TO; Back returns to phone through POP_TO, with a replace fallback; anchors cover direct entry.
  - **Final passes after the doc updates:** `pnpm install --frozen-lockfile` 0, `pnpm typecheck` 0, `pnpm lint` 0, and `git diff --check` ok. Scratch doc validation found 0 errors in 106 local links across 20 Markdown files: the 19 project files plus Expo's ignored `.expo/README.md`. It also found 13 child rows matching 13 cards (9 `Completed`).
  - **Not run:** automated transitions (MOBILE-001-F), and native modal, back, and swipe behavior with on-device insets (G/H).
- **JSDoc/TSDoc:**
  - `PhonePlaceholder` and `OtpPlaceholder`: what they do not do, the AUTH-001 replacement, and the callback parameters.
  - `MapPlaceholderScreen`: the `onSignIn` entry is temporary and AUTH-001 gates sign-in instead.
  - Comments on the anchors and on the platform `Screen` edges.
- **Remaining/blockers:**
  - Unverified until F, G, and H:
    - deep-link state for `/auth/otp`;
    - iOS sheet insets;
    - Android full-screen modal insets;
    - hardware back and swipe dismissal.
  - The MEGAsync exclusions for `packages/contracts/dist/` and `apps/mobile/dist/` are still pending.
- **Resume from:** Assign MOBILE-001-E when requested.
- **Ownership:** Released; no active task.

## 2026-10-03 — MOBILE-001-E: Inert remaining route shells

- **Actor/session:** Claude Code / route-shells.
- **Status:** Completed; ownership released. Parent MOBILE-001 stays `In progress`.
- **Working copy:** `main` at `99d3572` (MOBILE-001-D, committed at the user's request). At the user's request, MOBILE-001-E was committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "commit and continue with MOBILE-001-E". MOBILE-001-D was committed first; only the E card was executed.
- **Changes:**
  - **`src/ui/UnavailableScreen.tsx`:** a full-screen unavailable state: header-role title, message, and one “Go to map” `Button` (`onGoHome`). It renders only the given text. It replaces what would otherwise be five copies of the same layout.
  - **`src/config/isDevelopmentMode.ts`:** `isDevelopmentMode()` returns `__DEV__`. It is the only place the flag is read.
  - **Thin routes,** each rendering `UnavailableScreen` with `onGoHome` = `router.dismissTo('/')`:
    - `app/groups/[groupId]/index.tsx`: “Group” / “Group details are not available yet.”
    - `app/groups/[groupId]/chat.tsx`: “Group chat” / “Group chat is not available yet.”
    - `app/settings.tsx`: “Settings” / “Settings are not available yet.”
    - `app/dev/scenarios.tsx`: calls `isDevelopmentMode()` during render. Development builds show “Mock scenarios” / “Scenario switching is not available yet, and no scenario is running.” Other builds show “Not available” / “This page is only available in development builds.” Neither redirects.
  - **`app/_layout.tsx`:** `<Stack screenOptions={{ headerShown: false }}>` replaces the per-screen `headerShown: false`; `index` stays registered first and `auth` keeps `presentation: 'modal'`. The anchor comment now covers every direct entry.
  - **Docs:** `PRODUCT.md` (current-shell note), `DEVELOPMENT.md` (scenario gating), the root `README.md`, `docs/README.md`, `ARCHITECTURE.md` (existing files; also restored a missing comma in that sentence), `ROADMAP.md`, `FIRST_STEPS.md` (E `Completed`), and `AI_CONTEXT.md`.
- **Decisions:**
  - **No native headers.** Without registration, Expo Router would show headers titled with raw route names such as `groups/[groupId]/index`, and iOS back labels would read `index`. Headerless screens match the auth placeholders, keep all four `Screen` edges, and need no per-route options.
  - **One home action.** “Go to map” uses `dismissTo('/')`: it pops to the existing home, which the root anchor always places beneath a directly opened route, and replaces the screen if home is somehow absent. Android back and the iOS edge swipe still follow the stack. Nothing links between group and chat, so a separate Back button would duplicate the same action.
  - **Group ID never read.** No `useLocalSearchParams`, so any ID shows the same state and membership is never inferred from the URL.
  - **Gate read at render time,** not at import, so MOBILE-001-F can switch it per test by overriding only `isDevelopmentMode()`.
  - **No home links** to the new routes, and no `+not-found` route; `/groups` alone is not a planned URL and falls to Expo Router's built-in unmatched screen.
- **Excluded:** No authorization framework, UUID schema, fixture groups or chat, settings state, session or permission controls, scenario engine, data source, or new dependencies. `package.json` and the lockfile are unchanged.
- **Verification:**
  - **Static checks:** `pnpm typecheck` → 3 tasks, exit 0. `pnpm lint` → 3 tasks, exit 0. `tsc --listFilesOnly -p tsconfig.json` in `apps/mobile` lists all six new files.
  - **Exports:** `pnpm export:android` → exit 0, 2.7 MB Hermes bundle (1251 modules). `pnpm export:ios` → exit 0, 2.4 MB (1116 modules). No warnings apart from the `error.png` asset line. Each export replaces `apps/mobile/dist/`, so only the iOS bundle was inspected: `strings` found every new message and “Go to map”. Both scenario messages are present because the gate is evaluated at runtime, not stripped.
  - **Bundled sources:** an iOS `--source-maps` export into the session scratch directory listed `app/dev/scenarios.tsx`, `src/config/isDevelopmentMode.ts`, `src/ui/UnavailableScreen.tsx`, `app/groups/[groupId]/chat.tsx`, `app/groups/[groupId]/index.tsx`, and `app/settings.tsx` alongside the earlier sources. The scratch output and `apps/mobile/dist/` were deleted afterwards.
  - **Route audit (scratch Node script):** Expo Router's `getRoutesCore.getRoutes` ran on a stand-in context built from the real `app/` file list, with `unstable_settings` read from the sources. Its URL patterns `/`, `/auth/phone`, `/auth/otp`, `/groups/[groupId]`, `/groups/[groupId]/chat`, `/settings`, and `/dev/scenarios` exactly match the PRODUCT.md navigation table (none missing, none extra).
  - **Direct-entry state:** with only `react-native` stubbed (a `Platform` object, because its Flow source cannot load in Node), `getReactNavigationConfig(tree, true)` plus Expo Router's forked `getStateFromPath` produced:
    - `/` → `index`; `/auth/otp` → `index, auth[phone, otp]` (the deep-link check MOBILE-001-D deferred);
    - `/groups/abc-123` → `index, groups/[groupId]/index`; `/groups/not%20a%20uuid/chat` → `index, groups/[groupId]/chat` with `groupId` `not a uuid`;
    - `/groups/%E0%A4%A/chat` (malformed encoding) → the same chat state with the raw `groupId`, no exception;
    - `/settings` → `index, settings`; `/dev/scenarios` → `index, dev/scenarios`; `/groups` → no match.
    - Expo Router also copies the group ID onto the anchored `index` entry's params; home ignores params.
  - **Inspection:** `grep` in `apps/mobile/app` and `src` found no `useLocalSearchParams`, `useGlobalSearchParams`, `useSegments`, `TextInput`, `Switch`, `useState`, `useReducer`, `SecureStore`, `AsyncStorage`, or `fetch(`; no source links to `/groups`, `/settings`, or `/dev/`; `__DEV__` is read only in `isDevelopmentMode.ts`.
  - **Final passes after the doc updates:** `pnpm install --frozen-lockfile` 0, `pnpm typecheck` 0, `pnpm lint` 0, and `git diff --check` ok. Scratch doc validation found 0 errors in 106 local links across 20 Markdown files: the 19 project files plus Expo's ignored `.expo/README.md`. It also found 13 child rows matching 13 cards (10 `Completed`).
  - **Not run:** rendering and interaction tests (MOBILE-001-F), native back/swipe and on-device appearance (G/H). `pnpm doctor:mobile` was not rerun because dependencies and app configuration are unchanged.
- **JSDoc/TSDoc:**
  - `UnavailableScreen`: purpose, that it renders no parameters, private data, or working-looking controls, and per-prop notes.
  - `isDevelopmentMode`: what it gates, why it must be read only through the function at render time, the Jest `__DEV__` note, and the DATA-001 replacement.
  - Route comments on why the group ID is not read, the settings exclusions, the scenario gating, and the headerless root stack.
- **Remaining/blockers:**
  - Rendering, “Go to map”, and the non-development scenario state are tested only in MOBILE-001-F; native presentation in G/H.
  - The MEGAsync exclusions for `packages/contracts/dist/` and `apps/mobile/dist/` are still pending.
- **Resume from:** Assign MOBILE-001-F when requested.
- **Ownership:** Released; no active task.

## 2026-10-03 — MOBILE-001-F: Behavior test harness

- **Actor/session:** Claude Code / test-harness.
- **Status:** Completed; ownership released. Parent MOBILE-001 stays `In progress` until Android and iOS (G/H) pass.
- **Working copy:** `main` at `243a715` (MOBILE-001-E, committed at the user's request). At the user's request, MOBILE-001-F was committed on top of it, without pushing. Untracked `.idea/` files were left untouched.
- **Request/scope:** "commit and continue with MOBILE-001-F". MOBILE-001-E was committed first; only the F card was executed.
- **Changes:**
  - **Dependencies (mobile dev, exact):** `jest` 29.7.0, `jest-expo` 57.0.5, `@types/jest` 29.5.14, `@testing-library/react-native` 14.0.1, `test-renderer` 1.2.0, `@react-native/jest-preset` 0.86.3, `@babel/runtime` 7.29.7. `pnpm-lock.yaml` updated.
  - **`apps/mobile/jest.config.js`:** `preset: 'jest-expo'` and `testMatch: ['<rootDir>/tests/**/*.test.ts?(x)']`.
  - **`apps/mobile/tsconfig.json`:** `types: ["jest"]`.
  - **Scripts:** mobile `test` = `jest`; root `test:mobile` = `pnpm build:contracts && pnpm --filter @ride-match/mobile test`; root `test` = `turbo run test`. `turbo.json` gains `test` with `dependsOn: ["^build"]`.
  - **`tests/helpers/renderApp.ts`:** `renderApp(initialUrl)` wraps `renderRouter('./app', …)`, awaits Testing Library 14's async render, and returns `getPathname()` and `getRootStack()` (the root layout's stack, nested under Expo Router's `__root`). `flushTimersAndRestore()` runs pending timers inside `act`, runs fake microtasks, asserts `jest.getTimerCount()` is 0, and restores real timers.
  - **`tests/navigation.test.tsx` (14 tests):**
    - Anonymous home at `/`: header, “Map coming soon”, “Sign in”, no auth screen.
    - Sign in → `/auth/phone` → Preview code step → `/auth/otp` → “Back to phone step” → `/auth/phone`.
    - Close from the phone step and from the code step → `/` with the root stack exactly `['index']` (the existing home, no duplicate).
    - Direct `/auth/otp`: Close → `/` (fallback); Back → `/auth/phone`.
    - `/groups/abc-123`, `/groups/not%20a%20uuid`, `/groups/%E0%A4%A`, `/groups/abc-123/chat`, `/groups/%E0%A4%A/chat`, and `/settings`: the unavailable message, no ID text, exactly one button, and “Go to map” → `/`.
    - `/dev/scenarios`: the “Mock scenarios” placeholder by default; with only `isDevelopmentMode()` overridden to false (`jest.spyOn`), the pathname stays `/dev/scenarios`, the unavailable message shows, and “Go to map” → `/`.
  - **`tests/ui.test.tsx` (2 tests):** an enabled `Button` is enabled and calls `onPress` exactly once per `userEvent.press`; a disabled one reports `toBeDisabled()` and ignores the press.
  - No C–E source files changed; the tests exposed no defect in them.
  - **Docs:** `TOOLCHAIN.md` (versions, dependency rows, corrections, test configuration, tsconfig outcome, install commands, guard result), `DEVELOPMENT.md` (command statuses, Turbo `test`, current harness), the root `README.md` (status and commands), `docs/README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `FIRST_STEPS.md` (F `Completed`), and `AI_CONTEXT.md`.
- **Decisions and corrections:**
  - **`test-renderer` 1.2.0, not the planned 1.3.0.** The first install made `pnpm peers check` report `react-reconciler@0.34.0` wanting `react ^19.3.0`; 1.3.0 depends on `react-reconciler ~0.34.0`. 1.2.0 depends on `~0.33.0` (0.33.0 is the only stable 0.33, peer `react ^19.2.0`) and is within Testing Library's `^1.0.0` peer. Expo's `bundledNativeModules.json` pins only `jest-expo` among these packages. A stale 1.3.0 copy stayed in `node_modules` until a clean `pnpm install --frozen-lockfile` (root, mobile, and contracts `node_modules` removed first, as in MOBILE-001-A).
  - **`@babel/runtime` declared.** The first run's stack traces showed `asyncToGenerator` loading from `/Users/home/node_modules/@babel/runtime` (7.29.7). `babel-preset-expo` enables Babel's runtime transform, and Jest's non-Hermes profile emits helper imports that resolve from each test or source file; pnpm does not hoist `@babel/runtime`, so lookup left the repository. This is the TOOLCHAIN ancestor-folder hazard; the documented guard is to declare the import, not to add a resolver override. 7.29.7 is the version `expo` already resolved. A Metro iOS export has no `@babel/runtime` source before or after the change.
  - **No `transformIgnorePatterns` override and no `babel.config.js`.** `jest-expo` 57.0.5 already handles `.pnpm` paths and keeps two exclusions that the planned pattern would have lost; it loads `expo/internal/babel-preset` from `process.cwd()`.
  - **App directory `'./app'` relative to the working directory**, not `__dirname`, so the mobile tsconfig needs no Node types; jest-expo already requires `apps/mobile` as the working directory.
  - **Pathname checks use `getPathname()` with ordinary matchers**, because Expo Router's matchers (`toHavePathname`) ship no type declarations.
  - **The one leftover fake “timer”** after flushing was a microtask from React's `act()` (`queueSeveralMicrotasks` in `react.development.js`), queued through the `queueMicrotask` that Jest's modern fake timers replace. `jest.runAllTicks()` clears it; no app or navigation timer persists after unmount.
- **Verification:**
  - **Dependency checks:** `pnpm peers check` → "No peer dependency issues found" after the clean install. `pnpm doctor:mobile` → "21/21 checks passed. No issues detected!". From `apps/mobile`, `require.resolve` puts `jest`, `jest-expo`, Testing Library, `test-renderer` (1.2.0), `@react-native/jest-preset`, `@babel/runtime`, `@types/jest`, and `expo-router/testing-library` inside the repository; Testing Library resolves to the same copy from `expo-router`.
  - **Tests:** `pnpm test:mobile` → 2 suites, 16 tests passed, exit 0. `pnpm test:mobile --runTestsByPath tests/navigation.test.tsx` → runs `jest --runTestsByPath tests/navigation.test.tsx`, 1 suite, 14 tests, exit 0. `pnpm test` → Turbo built contracts (cached) and ran `@ride-match/mobile:test`, 16 passed, 2 tasks successful, exit 0. `jest --detectOpenHandles` → 16 passed, no open-handle report. No console warnings, errors, or `act` warnings in the output.
  - **Resolution:** an uncached run (`--no-cache`) through a scratch resolver wrapping React Native's Jest resolver logged no resolution outside the repository, and `@ride-match/contracts` → `packages/contracts/dist/index.js`. `jest --showConfig`'s `moduleNameMapper` has only the preset's `react-native` and vector-icons entries; no test or config references contracts.
  - **Contracts negative probe:** with `packages/contracts/dist` removed, `jest tests/navigation.test.tsx` failed with "Cannot find module '@ride-match/contracts' from 'src/bootstrap/checkContractsPackage.ts'". `pnpm build:contracts` restored it and all 16 passed.
  - **Mutation probes (each reverted with `git checkout`):** Close using `router.push('/')` → 1 failure (root stack); the scenario gate reading `__DEV__` instead of `isDevelopmentMode()` → 1 failure; `Button` without `disabled` → 1 failure; the group route rendering its ID → 3 failures. `git diff` on `app/` and `src/` was empty afterwards.
  - **Static checks:** `pnpm typecheck` → 3 tasks, exit 0 (the first attempt failed on `node:path`/`__dirname` in the helper, which led to the `'./app'` decision). `pnpm lint` → 3 tasks, exit 0; mobile ESLint checks 22 files, including `jest.config.js` and all three test files. `tsc --listFilesOnly` lists the three test files and `@types/jest` from the repository, no `@types/node`, and nothing outside the repository.
  - **Exports:** `pnpm export:android` → exit 0, 2.7 MB, 1251 modules; `pnpm export:ios` → exit 0, 2.4 MB, 1116 modules (both unchanged from E). An iOS `--source-maps` export into scratch had 1109 sources, none from Jest, Testing Library, `test-renderer`, `react-reconciler`, `@babel/runtime`, or `tests/`, and none outside the repository. The scratch output and `apps/mobile/dist/` were deleted.
  - **Final passes after the doc updates:** `pnpm install --frozen-lockfile` 0, `pnpm typecheck` 0, `pnpm lint` 0, `pnpm test:mobile` 16 passed, `pnpm test` 16 passed (2 Turbo tasks), and `git diff --check` ok. Scratch doc validation found 0 errors in 106 local links across 20 Markdown files (the 19 project files plus Expo's ignored `.expo/README.md`), after restoring a TOOLCHAIN heading whose anchor another link uses. It also found 13 child rows matching 13 cards (11 `Completed`). `apps/mobile/dist/` is absent.
  - **Not run:** native builds and on-device interactions (MOBILE-001-G/H). Jest cannot show native modal presentation, Android hardware back, iOS swipe dismissal, or real safe-area insets.
- **JSDoc/TSDoc:**
  - `renderApp`: what it renders, why it awaits and re-exposes Expo Router's helpers, and the fake-timer handoff.
  - `flushTimersAndRestore`: when to call it and why fake microtasks are run before the zero-timer assertion.
  - Comments on the app-directory path and on `jest.config.js`'s preset defaults and `testMatch`.
- **Remaining/blockers:**
  - MOBILE-001-G (Android) and MOBILE-001-H (iOS and the final checkpoint) are still required before MOBILE-001 can be `Completed`.
  - The MEGAsync exclusions for `packages/contracts/dist/` and `apps/mobile/dist/` are still pending, and G/H will add `apps/mobile/android/` and `apps/mobile/ios/`.
- **Resume from:** Assign MOBILE-001-G when requested.
- **Ownership:** Released; no active task.

## 2026-10-03 — DESIGN-001: Along full-MVP concept; native Figma delivery blocked

- Actor/session: Codex / along-mvp-design.
- Status: **Blocked** on Figma Starter MCP quota; local screen inventory is available. This is not a completed implementation task.
- Working copy: shared `main`; preserved the existing MOBILE-001-G modifications and unrelated `.idea/` files. No app source, dependencies, backend or native setup changed.
- Request/scope: Full mobile MVP design in a new Figma file; user delegated visual choices and requested provisional naming/logo.
- Changes: Created [Along Figma draft](https://www.figma.com/design/y6N9BYkaqf4gOZlBUiJfvA), with three pages, 40 variables, eight text styles, 17 components across three variant sets plus map/logo, a brand sheet, and 20 native journey frames with 73 navigation links. Added `docs/design/along/`: 55-screen local HTML review, individual text/vector SVGs, SVG ZIP, static review panels, source construction scripts, and remote ID ledger.
- Decisions: Provisional Along name and merging-path symbol; Wayly/Sameway alternative name/icon sketches; teal/lime/warm-neutral palette. Manrope in Figma; reproducible Arial SVG fallback. Preserve map-first anonymous browsing, synthetic demo labels, approximate public locations, member-only meeting point, explicit readiness, and external taxi booking/payment.
- Verification: Native Figma returned component/screen IDs and asserted Manrope for all 20 journey screens. Screenshots found horizontal rows with incorrect height; targeted Figma fixes succeeded. Quota then prevented post-fix screenshots and further native creation. Local `ALONG_NODE_MODULES=<bundled node_modules> node docs/design/along/source/render.cjs` generated 55 SVGs and zero body/sheet-bound warnings. Reviewed all 11 static screen panels and brand image; local fit corrections are not yet applied remotely. `node --check` passed for `render.cjs`, `export-svg.cjs`, and `preview-runtime.js`; `AsyncFunction` parsing passed for helper + kit/journey/states snippets. A Python standard-library check parsed all 55 SVGs, confirmed all local screen targets resolve, checked changed-document local references, and created the SVG ZIP. `git diff --check` passed.
- Not run: App tests/builds (no app changes). Browser interaction verification (in-app browser security policy disallowed local file navigation; no workaround attempted). Native final fitting/prototype validation and SVG import validation (Figma quota).
- Documentation: Added design README/source ledger; updated PRODUCT, ROADMAP, docs README, AI_CONTEXT, and this log. Implementation DAG/statuses unchanged.
- JSDoc/TSDoc: Added focused comments to the design construction boundary, local drawing adapter, and SVG layout/export logic. No application API changed.
- Remaining: Figma has drafts 01–20 only. Apply the local sheet/map-dot corrections to existing nodes, populate states 21–55, then visually verify native typography/layout and prototype. Local HTML/SVG rendering is not proof of native Figma correctness. No quota reset time was supplied.
- Resume from: `docs/design/along/README.md` → native Figma continuation; inspect the actual file and saved IDs before mutations. MOBILE-001-H remains the next separately authorized implementation task.
- Ownership: Released while the external quota blocks delivery.

## 2026-10-03 — DESIGN-001 continuation retry: quota still active

- Actor/session: Codex / along-mvp-design; shared working copy, existing changes preserved.
- Request: Check the saved stopping point and try to continue the Figma design.
- Checks: Read the local design handoff and remote ID ledger. Figma account inspection succeeded and reported Starter; a read-only canvas call was rejected by the MCP tool-call limit. The open Figma browser tab showed signed-out viewing controls. No reset time was supplied, and the remote frame count could not be freshly verified.
- Changes: Recorded the retry in `AI_CONTEXT.md`, the design README, and this log. No design, app, dependency or roadmap-status change; DESIGN-001 remains blocked. No code changed, so application tests/builds and JSDoc/TSDoc were not applicable. `git diff --check` passed.
- Resume from: Restore MCP availability, inspect saved remote IDs, apply pending local corrections, create states 21–55 and complete native visual/prototype verification. Ownership remains released while blocked.

## 2026-10-03 — DESIGN-001: Offline Figma importer packaged; native run pending

- Actor/session: Codex / along-local-importer; shared `main`, existing MOBILE-001-G and unrelated files preserved. User authorized the recommended plugin alternative.
- Scope/changes: Added `docs/design/along/plugin/` with an offline manifest, generated `code.js`, small UI, documented runtime, deterministic bundler and lifecycle checks. Added `along-figma-importer.zip` with ready-to-run manifest/code/UI/instructions. No app, backend, dependencies, or native setup changes.
- Behavior: Six-screen sample or full 55-screen import; creates 40 variables, eight Manrope styles and 17 components; binds 192 navigation actions on one current page. Adds an independent revised copy beside existing content, preserves existing nodes/flows, refuses duplicate imports, checks font availability before writes, and rolls back exact owned IDs on failure. Sample cleanup is limited to the current plugin session. No network/MCP calls, credentials, external conversion service or dynamic code evaluation.
- Adaptation: Converted MCP-only auto-layout helpers and placeholder fields to standard Plugin API calls; corrected unsupported per-child center alignment by centering the sheet container; retained native text/component instances. Local source corrections are included. All screens share one page to connect journey/recovery links without adding Starter pages. Geometry checks adjust sheet bottoms and report body/footer collisions; they do not replace visual review.
- Checks: `node docs/design/along/plugin/build.cjs`, `node docs/design/along/plugin/check.cjs`, and `node --check docs/design/along/plugin/code.js` passed. API-double checks cover six-screen sample, exact-ID cleanup, 55 screens, 17 components, 192 resolved same-page links, user-content/flow preservation, duplicate refusal, missing-font preflight, injected construction-failure rollback, offline manifest, and UI script parsing. Python ZIP integrity/content comparison and updated-document local-link validation passed; `git diff --check` passed.
- Native attempt: Figma desktop was installed/open. Opening its file browser produced a blank page; reload did not recover it. The browser clipboard was separate from the desktop clipboard, so the desktop URL command rejected it. A subsequent native interaction reported `noWindowsAvailable`. No plugin was installed/run and no design edits were made. Asked the user to open the Along file in Figma desktop; native sample, screenshots and prototype checks remain pending. No app tests/builds (no app changes).
- Documentation/JSDoc: Updated design README, plugin README, source ledger, PRODUCT, ROADMAP, AI_CONTEXT and this log. Added useful JSDoc to the bundler, native import boundary, font preflight, ownership cleanup, geometry audit and lifecycle test double.
- Resume from: Open Along in desktop with editing access; import `docs/design/along/plugin/manifest.json`; review sample 01/02/13/17/21/40, remove it with the plugin, then import/review all screens and download native report. Inspect actual rendering and repair scoped defects before marking DESIGN-001 complete. Original MCP IDs remain in `source/state.json`; plugin-native IDs do not exist yet.
- Ownership: Released pending desktop access. The importer is packaged; the original Figma delivery is still incomplete.

## 2026-10-04 — DESIGN-001: Importer flow and cleanup repair

- Actor/session: Codex / along-importer-repair; shared `main`. Ownership released; DESIGN-001 paused for the user's chosen native retest.
- Request: Fix the desktop plugin failure `set_flowStartingPoints: Found duplicate input nodeIds` and subsequent removal errors.
- Changes: Importer build 1.0.1 replaces only this invocation's automatic prototype entry points and merges by node ID, preserving unrelated flows. Rollback removes outermost owned containers instead of individual descendants. Sample pruning now drops removed subtree IDs from the ownership ledger. UI/report identify build 1.0.1; regenerated `code.js` and `along-figma-importer.zip`. Existing version/mode duplicate detection remains compatible with earlier imports.
- Verification: `node docs/design/along/plugin/check.cjs` first reproduced the duplicate-ID failure with the old bundle. After repair, `node docs/design/along/plugin/build.cjs` and the lifecycle checks passed: 6-screen sample/removal, live ownership IDs, 55 screens/17 components/192 links, unique entry points, user content/renamed flow preservation, font preflight, duplicate-import refusal, construction/late-flow failure rollback and retry. In-memory mutation probes independently rejected descendant-first removal and stale sample-pruning IDs. `node --check` for runtime/build/check/generated code passed; UI script parses in lifecycle checks. Python ZIP integrity/four-file byte comparison and 43 local documentation-link checks passed; `git diff --check` passed.
- Native attempt: Along was accessible in Figma desktop, and the reported old error was visible. Its states page layer list appeared empty after rollback, but exact native inventory was not read. Closed the failed plugin window and opened the manifest chooser; automated path input did not take effect and one action reported no available window. User explicitly chose to test the updated package themselves. Repaired native execution, sample cleanup, rendering and prototype acceptance are not yet verified.
- Documentation/JSDoc: Updated plugin recovery instructions, design README, source ledger, PRODUCT, ROADMAP, AI_CONTEXT and this log. Added useful comments for deduplicated flow registration, parent-container cleanup and pruning-ledger lifecycle.
- Excluded: No app/backend, dependencies, product lifecycle rules or original design source artwork changes; no original Figma nodes deliberately edited/deleted by this repair session. No application tests/builds because app code is unchanged. Preserved MOBILE-001-G and unrelated changes; no commit.
- Resume from: Close/reopen the updated development plugin (or replace the extracted ZIP folder), verify header 1.0.1, run/review the six-screen sample and remove it, then run/review all 55 screens and save native report. If an earlier import remains, inspect it first; do not erase a page or name-matched foundations. Only use Undo when the import is the latest document action with no later work to lose.
