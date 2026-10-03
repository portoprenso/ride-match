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
