# AI context

Last updated: 2026-10-03

## Purpose and state

- Ride Match: map-first discovery of nearby compatible ride intentions, groups of up to four, temporary text chat, shared meeting point, external Yandex Go handoff.
- **Implemented:** 13-file documentation baseline only; local links, task/DAG consistency, and scenario coverage verified. No application or backend code, packages, dependencies, runnable scripts, or tests.
- Existing `apps/mobile/` and `apps/api/` are empty. Preserve unrelated files; do not populate `apps/api/` during the mobile milestone.
- Next planned task: **MONO-001** in [ROADMAP.md](ROADMAP.md), only when implementation is requested.
- Sequence: mock mobile MVP -> contract review -> future backend -> future HTTP/Socket.IO adapter.

## Planned stack and boundaries

- pnpm workspaces, Turborepo, TypeScript; Expo/React Native development builds; Expo Router.
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

- Read applicable `AGENTS.md`, this handoff, README, roadmap, architecture, relevant docs, and any editor/assistant rules before non-trivial changes.
- Implement only the requested task; preserve existing behavior; no speculative layers or new packages.
- No backend, database, production matching, mobile routing, payments, AI, social features, background tracking, or multiple taxi providers in this milestone.
- Screens/components must not import mock fixtures. Select transport centrally.
- Add useful JSDoc/TSDoc to reusable logic, lifecycle rules, and integration boundaries; avoid comments that repeat types.
- Update affected specs, [WORK_LOG.md](WORK_LOG.md), roadmap status, and this handoff after meaningful work. Record actual verification honestly.
- Final reports: changes, intentionally excluded work, checks/results, documentation, JSDoc/TSDoc, remaining risks/next step.
