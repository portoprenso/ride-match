# Ride Match documentation

Last updated: 2026-10-03

Ride Match helps nearby people travelling in compatible directions form a small group and share a taxi. The first milestone is a complete React Native mobile MVP using realistic mocks. Taxi booking and payment happen outside the application.

## Current state

- Documentation baseline is complete. MONO-001 is in progress: [TOOLCHAIN.md](TOOLCHAIN.md) records the selected versions, commands, and local prerequisites, and the root pnpm workspace exists with its tools (Turbo, TypeScript, ESLint). The empty `@ride-match/contracts` package compiles with `pnpm build:contracts`. There is no application, and no root lint, typecheck, or test script yet.
- `apps/mobile/` and `apps/api/` already exist as empty directories. No backend package is planned for the mobile milestone.
- No Expo app, contract schemas, or tests have been initialized. Root setup is in the repository [README](../README.md). A Git repository is present.
- The next planned assignment is **MONO-001-D**, making root typecheck and lint real checks, when requested. [First steps](FIRST_STEPS.md) splits workspace and Expo shell work into 13 small assignments for Terra or either assistant.
- Architecture and lifecycle choices below are proposed defaults to validate during the mock MVP, not evidence of production capabilities.

## Using Codex and Claude Code

Both assistants share [AGENTS.md](../AGENTS.md). [CLAUDE.md](../CLAUDE.md) imports those instructions for Claude Code. Start either tool in this project root and give it a bounded task ID or ask it to continue the latest handoff.

Read [AI_WORKFLOW.md](AI_WORKFLOW.md) for the start/resume/finish procedure, ownership rules, handoff template, and copyable prompts. Each meaningful task records its actor, changed files, decisions, verification results, unfinished work, and next concrete step in the shared docs. This makes work portable between tools without copying chat histories.

For the first implementation batch, assign one child from [FIRST_STEPS.md](FIRST_STEPS.md) per request. It defines file scope, fixed decisions, checks, exclusions, and two review checkpoints. Its child statuses complement the parent statuses in the roadmap.

Use one writer at a time in a shared directory. Separate checkouts must receive both code and documentation updates before continuation; shared docs are not automatic cross-tool synchronization.

## Reading order

Read applicable root instructions first, then use this map (the workflow and relevant handoff are required before starting/resuming work):

1. [AI context](AI_CONTEXT.md): concise current state and active ownership for either assistant.
2. [Roadmap](ROADMAP.md): bounded tasks, dependencies, acceptance criteria, verification, and progress.
3. [Architecture](ARCHITECTURE.md): stack choices, boundaries, contracts package, and planned structure.
4. [Shared AI workflow](AI_WORKFLOW.md): task ownership, resuming work, and handoff requirements.
5. [Work log](WORK_LOG.md): attributed actions, actual verification, and unfinished work; read the latest relevant entry.
6. [Product](PRODUCT.md): map UX, routes, flows, privacy presentation, and edge states.
7. [Development](DEVELOPMENT.md): proposed commands, configuration, testing, and completion criteria. [Toolchain](TOOLCHAIN.md) pins versions, install commands, and local prerequisites for the first batch.
8. [Mock scenarios](MOCK_SCENARIOS.md): simulator behavior and reproducible demonstrations.
9. [API overview](api/overview.md): future transport conventions, errors, privacy, and authority.

## Future API specification

| Document | Coverage |
| --- | --- |
| [Overview](api/overview.md) | Contracts inventory, privacy, errors, idempotency, pagination, backend handoff |
| [Authentication](api/authentication.md) | Phone/OTP, sessions, refresh, logout, current user, auth gating |
| [Rides](api/rides.md) | Places, discovery, requests, matching, expiration |
| [Groups](api/groups.md) | Atomic joining, membership, lifecycle, meeting points, chat, block/report |
| [Realtime](api/realtime.md) | Events, subscriptions, recovery, notifications, device registration |

These are specifications for mocked operations now and a future backend later. They do not describe an existing API.

## Development sequence

```text
Mobile MVP using mocks
  -> Review and stabilize contracts
  -> Implement the real backend against the reviewed specification
  -> Replace mobile mock transport with HTTP and Socket.IO
```

The roadmap contains only mobile MVP tasks and its contract-review handoff. Do not begin a subsequent milestone automatically.

## Keeping work documented

For every meaningful task:

1. Read project guidance, `AI_CONTEXT.md`, the shared workflow, and the latest relevant work-log handoff before making changes.
2. Identify the bounded task, record tool/session ownership and file scope, and mark the roadmap task in progress when implementation begins.
3. Update the affected specification with the actual resulting behavior, including limitations.
4. Record actor/session, working copy, changed modules, decisions, checks actually run, their results, and unfinished work in `WORK_LOG.md`.
5. Update the roadmap status and concise AI handoff with an exact next step. Release ownership on completion or intentional handoff. Mark a task complete only when its acceptance criteria hold.
6. Keep proposed commands and planned capabilities distinguishable from implemented ones.

The work log is a history of actual work, not a replacement for current specifications. Never put secrets, tokens, phone numbers, exact rider coordinates, message content, or other sensitive personal data in documentation or verification output.

## Plan coverage

The original planning request is preserved across these documents: architecture/monorepo/features/contracts in `ARCHITECTURE.md`; REST and realtime in `api/`; simulation in `MOCK_SCENARIOS.md`; navigation/map/location/flows/errors in `PRODUCT.md`; analytics/testing/workflow/completion in `DEVELOPMENT.md`; all 25 implementation tasks and the DAG in `ROADMAP.md`; backend readiness in `api/overview.md`. `FIRST_STEPS.md` provides a more detailed execution breakdown for the first two parent tasks without changing the DAG.
