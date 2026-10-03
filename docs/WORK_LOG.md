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
