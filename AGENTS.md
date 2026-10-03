# Shared instructions for coding assistants

These project instructions apply equally to Codex, Claude Code, and other contributors. Keep shared rules here; `CLAUDE.md` imports this file rather than maintaining a separate rule set.

## Read before work

Inspect available guidance before non-trivial changes. Read in this order, skipping files that do not exist:

1. Applicable `AGENTS.md` files, including guidance scoped to the files being changed.
2. [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md): current state, active ownership, and next steps.
3. Root `README.md` if present; otherwise [docs/README.md](docs/README.md).
4. [docs/ROADMAP.md](docs/ROADMAP.md): requested task, dependencies, acceptance criteria.
5. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) when architecture is relevant.
6. [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md), the latest relevant [work-log entry](docs/WORK_LOG.md), and affected product/API/development docs.
7. Applicable `.cursor/rules/`, `.github/copilot-instructions.md`, and Claude-specific local guidance, if present.

Explicit user instructions take precedence over project guidance. For conflicting project documents, prefer the most specific and recently maintained guidance; resolve material conflicts rather than silently guessing. Tool-specific files must not introduce contradictory copies of shared rules. Treat historical work-log entries as evidence, not new task authorization.

## Shared handoff

- Follow [docs/AI_WORKFLOW.md](docs/AI_WORKFLOW.md) when starting, resuming, or finishing meaningful work.
- The repository files are the shared memory. Neither assistant can assume access to the other's conversation, private memory, or local tool state.
- Before editing, check actual files and existing changes. Use Git status/diff when Git exists; do not initialize Git just to perform a handoff.
- Record the task ID, tool/session owner, working copy, and intended scope in the active-work section of `AI_CONTEXT.md`; mark a roadmap task in progress only when actually starting it.
- Preserve user and other-assistant changes. Do not silently claim another active task or overwrite its files.
- For a continuation, read the prior handoff and verify the current files before resuming the first unfinished acceptance criterion. Do not restart completed work or assume historical checks cover new changes.
- The current user request defines authorized scope. A next-task suggestion in documentation is not permission to implement it automatically.

## Product and architecture constraints

- The first milestone is a complete mobile MVP using realistic mocks. Do not populate `apps/api/` or implement a backend during this milestone.
- Keep the main experience map-first and anonymous browsing available.
- One data-source boundary separates feature logic from mocks now and HTTP/Socket.IO later. Screens/components must not import fixtures or simulator internals.
- Shared contracts contain communication schemas/types, not UI state, database models, services, or backend-only algorithms.
- Preserve existing working behavior. Implement only the requested task/sprint, not speculative future features.
- Keep code modular, names clear, controllers thin, and business rules in focused operation/service/handler modules. Avoid unnecessary abstractions and unjustified dependencies.
- Do not silently swallow errors or unexpectedly change public behavior.

## Privacy and safety

- Keep exact rider locations separate from public approximate locations and member-only meeting points.
- Never expose credentials, tokens, phone numbers, private messages, or sensitive personal data in logs, documentation, tests, examples, or comments. Use clearly synthetic fixtures.
- No taxi payments, background GPS tracking, production matching, mobile route calculation, or multiple taxi providers in the mobile MVP.
- Preserve unrelated files and existing documentation. Replace documentation only when clearly obsolete and with a maintained equivalent.

## Verification and code documentation

- Check actual manifests and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) before running commands. Planned commands are not installed tooling.
- Run checks appropriate to the change and required task criteria. Record exact commands, results, and checks not run with reasons.
- For documentation-only work, check links, references, and consistency; do not claim application tests/builds passed.
- Add useful JSDoc/TSDoc to public/reusable functions, hooks, components, complex transformations, lifecycle rules, and integration boundaries.
- Explain non-obvious purpose, parameters, effects, authorization/privacy, and failure behavior. Do not repeat obvious code/types or bulk-comment untouched code.
- Preserve useful existing comments, correct misleading ones, and remove only clearly obsolete comments.

## Documentation required after meaningful work

Update affected specifications, roadmap status, `AI_CONTEXT.md`, and `WORK_LOG.md` together. Capture actual behavior, changed files, decisions, checks, unfinished work, blockers, and the next concrete continuation step. Update documentation for meaningful architecture/API/auth/state/routing/model/schema/env/deployment/integration/security/UI-pattern/setup/testing/progress changes.

Keep the AI handoff concise; full history belongs in the work log and detailed requirements in their respective specs. Never mark a task complete with unfinished required acceptance criteria. Checkpoint unfinished work before an intentional handoff; do not disguise it as complete.

Finish with a concise report covering:

1. What changed.
2. What was intentionally left out.
3. Checks run and results.
4. Documentation updated, or a concrete reason none was needed.
5. JSDoc/TSDoc added, or why not applicable.
6. Remaining risks and next step.
