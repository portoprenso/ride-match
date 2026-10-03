# Ride Match documentation

Last updated: 2026-10-03

Ride Match helps nearby people travelling in compatible directions form a small group and share a taxi. The first milestone is a complete React Native mobile MVP using realistic mocks. Taxi booking and payment happen outside the application.

## Current state

- Documentation baseline is complete; application implementation has not started.
- `apps/mobile/` and `apps/api/` already exist as empty directories. No backend package is planned for the mobile milestone.
- No workspace, Expo app, contracts package, dependencies, tests, or build scripts have been initialized.
- The next planned implementation task is **MONO-001**, when implementation is requested.
- Architecture and lifecycle choices below are proposed defaults to validate during the mock MVP, not evidence of production capabilities.

## Reading order

1. [AI context](AI_CONTEXT.md): concise operational handoff for a new agent or developer.
2. [Roadmap](ROADMAP.md): bounded tasks, dependencies, acceptance criteria, verification, and progress.
3. [Architecture](ARCHITECTURE.md): stack choices, boundaries, contracts package, and planned structure.
4. [Product](PRODUCT.md): map UX, routes, flows, privacy presentation, and edge states.
5. [Development](DEVELOPMENT.md): proposed commands, configuration, testing, and completion criteria.
6. [Mock scenarios](MOCK_SCENARIOS.md): simulator behavior and reproducible demonstrations.
7. [API overview](api/overview.md): future transport conventions, errors, privacy, and authority.
8. [Work log](WORK_LOG.md): completed work, verification results, decisions, and follow-up.

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

1. Read project guidance and `AI_CONTEXT.md` before making changes.
2. Identify the bounded roadmap task and mark it in progress when implementation begins.
3. Update the affected specification with the actual resulting behavior, including limitations.
4. Record changed modules, checks actually run, their results, and unfinished work in `WORK_LOG.md`.
5. Update the roadmap status and concise AI handoff. Mark a task complete only when its acceptance criteria hold.
6. Keep proposed commands and planned capabilities distinguishable from implemented ones.

The work log is a history of actual work, not a replacement for current specifications. Never put secrets, tokens, phone numbers, exact rider coordinates, message content, or other sensitive personal data in documentation or verification output.

## Plan coverage

The original planning request is preserved across these documents: architecture/monorepo/features/contracts in `ARCHITECTURE.md`; REST and realtime in `api/`; simulation in `MOCK_SCENARIOS.md`; navigation/map/location/flows/errors in `PRODUCT.md`; analytics/testing/workflow/completion in `DEVELOPMENT.md`; all 25 implementation tasks and the DAG in `ROADMAP.md`; backend readiness in `api/overview.md`.
