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
