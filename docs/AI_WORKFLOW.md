# Shared workflow for Codex and Claude Code

Last updated: 2026-10-03. Applies to either assistant and to human contributors.

## Purpose and entry points

An assistant should be able to continue a task from repository files without the previous conversation. Use one shared workflow, current-state summary, roadmap, and work log rather than tool-specific project histories.

- [AGENTS.md](../AGENTS.md) is the canonical shared instruction file.
- [CLAUDE.md](../CLAUDE.md) imports it using `@AGENTS.md` and adds only Claude-specific handoff identification.
- Codex uses the root `AGENTS.md`; start from this project root, especially before a Git root exists. [Official Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Claude Code supports importing shared instructions from `CLAUDE.md`. This explicit import avoids depending on version-specific direct discovery of `AGENTS.md`. [Official Claude Code memory/import guidance](https://code.claude.com/docs/en/memory)

Both tools then read current state and task-specific docs. Shared project memory must not exist only in a chat, a private auto-memory file, `CLAUDE.local.md`, or a tool-specific todo list. Private notes may supplement these files but cannot replace them.

## Where each fact belongs

| File | Authority / contents |
| --- | --- |
| `AGENTS.md` | Shared working rules and reading order; not frequently changing task state |
| `CLAUDE.md` | Thin Claude Code entry point; no duplicated rules or status |
| `docs/AI_CONTEXT.md` | Current implemented capabilities, active task/owner, limitations, exact next continuation |
| `docs/ROADMAP.md` | Planned scope, dependencies, acceptance criteria, task status |
| `docs/WORK_LOG.md` | Dated and attributed history/handoffs with files, decisions, verification, unfinished work |
| Product/architecture/API/development docs | Current intended behavior and operational specifications |
| Actual code and checks | Evidence of what is implemented and verified |

If actual files differ from a handoff, investigate and document the discrepancy. Do not overwrite existing work to make it match a stale summary. Code may contain a bug; its existence alone does not supersede an explicit requirement. Read the user's current request and applicable instructions to decide the intended behavior.

## Starting or resuming a task

1. Read the guidance listed in `AGENTS.md`, current AI context, requested roadmap task, and latest relevant work-log entries.
2. Inspect the working directory. If Git exists, inspect status/diff and record branch/revision where useful. Otherwise record that Git is not initialized; do not initialize it for this workflow alone.
3. Check task dependencies and active ownership. Preserve pre-existing edits; distinguish them from your own work.
4. Identify the requested task and exact acceptance criteria still unfinished. A continuation inherits the original scope, accepted decisions, and constraints.
5. Before editing, add/update a concise active-work entry in `AI_CONTEXT.md`: task ID, owner (`Codex` or `Claude Code` plus a short session label), status, working copy, intended files, and continuation point. Use a local task ID such as `DOC-001` for meaningful work outside the implementation DAG; do not invent a new product milestone.
6. Mark the relevant roadmap row `In progress` when implementation actually starts. Documentation-only tasks can live in the work log without changing the 25-task DAG.
7. Perform the authorized work. Do not implement the next task merely because it is listed as next.

Do not require a second user confirmation for work already authorized. If an active owner or ambiguous overlapping edits create a real conflict, continue independent safe work and clarify only the conflicting scope.

## While working

- Keep specs aligned when a decision changes observable behavior. Record the decision and reason rather than hiding it in a chat.
- Make small focused edits; preserve other contributors' changes and avoid unrelated formatting/reorganization.
- Checkpoint meaningful partial progress before an intentional handoff or when a blocker prevents completion.
- Record exact verification commands and outcomes, including failures and checks unavailable on the current machine.
- Use paths relative to the repository in portable documentation. Include branch/worktree/commit references if available; use a working-copy description when Git does not exist.
- Do not assume the next assistant can reuse your process IDs, simulator, plugin, shell session, credentials, approvals, or private tools. Document necessary reproducible setup without secrets.

## Finishing and handing off

1. Inspect the resulting files and run checks appropriate to the change.
2. Update affected specs with actual capabilities, contract/env changes, and limitations.
3. Append an attributed work-log entry using the template below. Summarize work; do not paste private reasoning or entire transcripts.
4. Update roadmap status according to actual acceptance criteria.
5. Replace the active-work entry with an accurate current-state summary. Release ownership when done or intentionally handing off; preserve task status and the next unfinished step if work remains.
6. Update `AI_CONTEXT.md` with current capabilities/limitations, latest handoff pointer, and next concrete task or continuation.
7. Report changes and verification to the user, including anything incomplete.

An intentional handoff is complete only when the next assistant can find the changed files, understand the decisions, reproduce relevant checks, and identify what remains. It does not require an automatic commit or push; follow the user's Git instructions. When separate checkouts are used, share/integrate the corresponding code **and** documentation through the normal authorized workflow.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Planned | Work has not started |
| In progress | An identified owner is actively working |
| Paused | Incomplete and intentionally stopped/handed off; next step and released ownership recorded |
| Blocked | Cannot continue that task without a named dependency, decision, permission, or environment change |
| Completed | All required scope/acceptance criteria verified; documentation is current |

These are documentation task statuses, not commands to a tool's separate goal/scheduler system. A partially implemented feature is not completed merely because a turn ended. A missing required check must remain visible; do not report it as passing. If a previous run was interrupted without a checkpoint, inspect its existing files and record recovered state before proceeding.

## Handoff entry template

Append to `WORK_LOG.md`, preserving older entries. Use a session label to distinguish entries on the same date; include a timestamp/timezone if timing matters.

```markdown
## YYYY-MM-DD — TASK-ID: Short outcome

- Actor/session: Codex or Claude Code / short session label
- Status: Planned | In progress | Paused | Blocked | Completed
- Working copy: Branch/worktree and relevant revision, or "shared directory; Git not initialized"
- Request/scope: What the user asked for; relevant constraints
- Changes: Actual behavior and changed files/modules
- Decisions: Choice, reason, and affected specification
- Excluded: Intentionally untouched scope
- Verification: Exact command or manual check -> actual result; checks not run and why
- Documentation: Specs, roadmap, and AI context updated
- JSDoc/TSDoc: Added/updated, or why not applicable
- Remaining/blockers: Unfinished acceptance criteria, risks, environment limitations
- Resume from: Concrete first unfinished step, or the next suggested task if complete
- Ownership: Released for handoff, or active owner and scope
```

For minor documentation work, keep the entry compact but retain attribution, actual changes/checks, status, and next step. Historical entries are not rewritten to imply newer verification; append a correction or follow-up when necessary.

## Safe use of both tools

Default to one writer at a time in the same working directory. Finish/checkpoint one assistant's work before asking the other to continue it. A Markdown ownership entry is a coordination aid, not an atomic lock.

If the user requests parallel work, choose independent tasks from the DAG and separate files. With Git available, prefer isolated branches/worktrees and integrate both code and docs before dependent work. A task marked complete on one unmerged branch is not evidence that the dependency exists in another working copy. Serialize edits to shared contracts, composition, lockfiles, roadmap/context/log, or designate an integration owner. Reread shared documents immediately before updating them and preserve both contributions.

Updating docs in one checkout does not automatically synchronize another checkout, and an already-running conversation may hold stale context. At every handoff, reread the shared files from the actual current working copy. On another machine, transfer the relevant code/docs before continuing; avoid overlapping writes through a cloud-synced folder.

## Prompts usable in either assistant

Start a bounded task:

> Read AGENTS.md, docs/AI_CONTEXT.md, docs/AI_WORKFLOW.md, the latest relevant WORK_LOG.md entry, and the MONO-001 task in docs/ROADMAP.md. Implement only MONO-001, respecting dependencies and existing changes. Verify it and update the shared documentation before finishing.

Continue another assistant's work:

> Continue task RIDE-001 from the latest shared handoff. Inspect actual files and unfinished acceptance criteria before editing. Preserve completed work, run relevant checks, and update the specs, roadmap, AI context, and work log with your changes and remaining work.

Inspect the handoff without changing files:

> Read AGENTS.md and the shared docs. Report the current task status, latest actor, changed files, verified checks, unresolved work, and next concrete step. Do not edit files or start implementation.

Replace example task IDs with the task actually requested. These examples are not active instructions to start those tasks.

## Entry-point verification

- Static check: `CLAUDE.md` has the standalone `@AGENTS.md` import and all local references exist.
- In a new Claude Code session, inspect `/context` for loaded memory files, then use the read-only handoff prompt above. [Claude Code verification guidance](https://code.claude.com/docs/en/memory)
- In a new Codex session rooted here, ask it to list active instruction sources and summarize the shared handoff without editing. Discovery is rebuilt for a new run/session. [Codex guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Confirm both report the same project state and next step. If they differ, inspect actual files and tool-specific overrides rather than create a second roadmap.

No automatic tool-to-tool messaging, hooks, plugins, permission changes, or external memory service are required by this workflow.
