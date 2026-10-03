# Development, testing, and analytics plan

Status: planned. Last updated: 2026-10-03. **Commands below do not exist yet; they are specifications for future tasks, not checks already run.**

## Workflow and proposed commands

Codex and Claude Code follow the same [shared AI workflow](AI_WORKFLOW.md). Begin with the current handoff and task ownership, inspect actual files, and record attributed changes and verification before handing work to the other tool. The commands and acceptance criteria do not change with the assistant.

| Root command | Intended behavior |
| --- | --- |
| `pnpm dev` | Build contracts once, then run contracts watch and Expo development server |
| `pnpm dev:mobile` | Start mobile with contracts prepared |
| `pnpm build:contracts` | Emit shared JavaScript and declarations |
| `pnpm typecheck` | Type-check all workspace packages |
| `pnpm lint` | Lint application/contracts and enforce import boundaries |
| `pnpm test` | Run contract and mobile tests once |
| `pnpm test:contracts` | Vitest contracts; forward file filters |
| `pnpm test:mobile` | Jest mobile; forward `--runTestsByPath` and other test arguments |
| `pnpm test:e2e` | Selected Maestro flows against an installed development build |
| `pnpm doctor` | Expo dependency/configuration checks |
| `pnpm export:android` | Export Android JavaScript bundle |
| `pnpm export:ios` | Export iOS JavaScript bundle |
| `pnpm mobile:android` | Build/run Android development application |
| `pnpm mobile:ios` | Build/run iOS development application |

Turborepo development tasks are persistent and uncached. Declare contract build outputs and task dependencies explicitly. No remote cache or release/deployment automation is needed initially. Bundle exports do not replace native build verification.

Install only justified dependencies during an authorized implementation task. Pin compatible versions and commit the workspace lockfile. Use Expo's recommended native dependency versions and run doctor after native integration changes.

Each bounded task should leave runnable behavior, focused tests where useful, updated current specs, and an honest work-log entry. Do not mark incomplete native checks as passing because a JavaScript export succeeds.

## First implementation batch

Use [FIRST_STEPS.md](FIRST_STEPS.md) for the 13 small assignments under MONO-001 and MOBILE-001. Assign one child at a time. [TOOLCHAIN.md](TOOLCHAIN.md), recorded by MONO-001-A, pins Node 24.17.0, pnpm 11.28.2 through Corepack, Expo SDK 57, TypeScript 6.0.3, Turbo 2.11.6, and the lint and test packages, with exact per-task install commands and local prerequisites. Use those versions and commands; do not guess independent latest dependency versions while implementing later cards.

Commands become available incrementally: `build:contracts` in MONO-001-C; root lint/typecheck in MONO-001-D; Turbo orchestration in MONO-001-E; development/doctor/export/native wrappers in MOBILE-001-B; mobile/root tests in MOBILE-001-F. CONTRACT-001 adds actual contract schemas/tests later. Do not create success-only placeholders for unavailable commands.

Review workspace setup after MONO-001-E and the shell after MOBILE-001-H. Android and iOS development-build checks are separate required assignments; missing native verification stays unresolved. The shell's auth/private/settings/scenario routes are inert navigation placeholders. Real session, membership, configuration, and scenario behavior remain in their later roadmap tasks.

## Configuration

| Configuration | Planned use |
| --- | --- |
| `EXPO_PUBLIC_DATA_SOURCE=mock` | Select the mock data source centrally |
| `EXPO_PUBLIC_MOCK_SCENARIO=active-neighborhood` | Initial deterministic scenario |
| `EXPO_PUBLIC_APP_ENV=development` | Environment/demo labeling and analytics segregation |
| Restricted Google Maps native build configuration | Android map provider; configure/restrict credential for the application |
| Future `EXPO_PUBLIC_API_BASE_URL` | Future adapter only; no API transport implemented now |

No environment files or credentials currently exist. Public Expo variables are not secrets. API mode must fail clearly until implemented, never silently switch to synthetic riders. The scenario picker is limited to development/preview mock builds.

Store future refresh credentials through SecureStore; keep access token in memory. Keep demo and production credential namespaces separate. Scenario reset clears demo state and this app's demo credentials only. No tokens or sensitive payloads in logs.

## Test strategy

Use Vitest for schema/contract checks, Jest with jest-expo and React Native Testing Library for feature behavior, and a small Maestro suite for native flows. Two test environments serve different needs: pure TypeScript contracts and Expo/native component integration. [Expo unit testing](https://docs.expo.dev/develop/unit-testing/)

| Layer | Important checks |
| --- | --- |
| Contracts | Invalid inputs, strict public/private fields, discriminated events/notifications, error envelopes |
| Mock operations | Expiry, capacity, atomic joining, idempotency, permissions, block effects |
| Feature integration | Auth continuation, create/cancel, match UI, joining, chat retries |
| Synchronization | Duplicate/out-of-order events, reconnect, logout/private-cache clearing, revocation |
| Native integration | Permission fallback, map gestures/markers, keyboard/sheets, local notification entry, taxi handoff |

Inject clocks and use deterministic failures. Advance fake time instead of sleeping in unit/integration tests. Test behavior, not copies of implementation details. Avoid exhaustive snapshots of trivial UI.

Native-map component mocks can verify selection and accessibility but cannot validate actual map rendering. Perform real simulator/device checks and record device/platform/version and relevant limitations. Test a 100-item discovery scenario for pan/tap responsiveness and avoid idle rerender loops or repeated camera jumps.

## Priority end-to-end flows

1. Anonymous browse -> destination -> auth -> create -> match -> group -> chat -> meeting point.
2. Empty map and denied/unavailable location.
3. Last-seat conflict and simultaneous join.
4. Expiration in foreground and after background return.
5. Failed message retry, duplicate delivery, and missed-message catch-up.
6. Leave/block/report with access removal.
7. Warm/cold notification entry with valid and stale targets.
8. Taxi handoff and provider-unavailable fallback.
9. Session expiry with successful and failed refresh.

## Analytics boundary

Use typed `analytics.track(...)` events with bounded properties. Initially use an in-memory/no-op sink, inspectable in development. No vendor integration or external transmission is required.

| Event | Exact trigger |
| --- | --- |
| `app_opened` | Start of a defined foreground session |
| `map_opened` | Main map first becomes visible in that session |
| `nearby_activity_exposed` | Fresh successful discovery renders; record zero/nonzero and count bucket |
| `nearby_marker_seen` | Peer marker visible for a minimum dwell; deduplicate per session |
| `nearby_marker_tapped` | Peer marker tap |
| `destination_selected` | Search suggestion confirmed |
| `ride_request_create_clicked` | User confirms creation intent |
| `ride_request_created` | Canonical create succeeds |
| `ride_request_expired` | Authoritative expiry observed, once per request |
| `match_found` | New valid match observed, once per match/version |
| `group_join_clicked` | Join intent confirmed |
| `group_joined` | Canonical membership succeeds |
| `group_leave_clicked` | Leave intent confirmed |
| `group_left` | Canonical removal succeeds |
| `message_send_clicked` | User submits text |
| `message_sent` | Canonical message accepted |
| `meeting_point_viewed` | Meeting-point detail opened |
| `taxi_open_clicked` | External handoff requested |
| `taxi_opened` | OS accepts handoff; not proof of native opening or booking |
| `ride_completed` | Explicit completion mutation succeeds |
| `user_reported` / `user_blocked` | Corresponding operation succeeds |

Properties may include environment, application version, mock scenario ID, session ID, and pseudonymous installation/user identity. Do not accept unrestricted metadata. Exclude phone numbers, coordinates, destination search text, messages, report content, and credentials. Never emit success solely because a button was pressed.

Session/dwell thresholds should be defined and tested in ANALYTICS-001. Synthetic scenario traffic must remain distinguishable and excluded from future real-user metrics.

## Retention hypothesis

Hypothesis: users exposed to at least one nearby active ride engage and return more often than users seeing an empty map.

- Cohort by the first eligible successful map exposure, not a failed or loading screen.
- Distinguish zero visible peer activity from at least one visible peer activity item.
- Exclude own markers, stale data, failed loads, and mock sessions.
- Track clustered visible activity for the exposure metric without inventing individual marker impressions.
- D1/D7 are return sessions on UTC calendar day 1/day 7 after cohort entry.
- Preserve anonymous-to-authenticated association with pseudonymous IDs, never phone numbers.
- Instrumentation is verifiable now; actual retention requires a future analytics destination and real users.

## Mobile MVP completion criteria

The complete development-build demonstration is:

```text
Open anonymously -> nearby activity -> destination -> authentication gate
-> create request -> simulated match -> inspect rider -> join/form group
-> text chat -> meeting point -> ready -> Yandex Go/fallback
```

Also demonstrate honest empty state, location fallback, expiration across backgrounding, group-full/concurrent-join conflict, stale/offline resync, failed/duplicate chat recovery, leave/report/block, valid/stale notifications, and explicit group completion.

Technical completion requires:

- No feature imports of mock fixtures or infrastructure.
- Public/private location and group-access boundaries verified.
- Session changes clear private data.
- Schema, feature, and synchronization tests pass.
- Typecheck, lint, Expo doctor, and both platform exports pass.
- Native map, location, notifications, and taxi flows checked on supported platforms; limitations recorded.
- No unintended listeners/timers survive resets or screen lifecycle changes.
- API operations/events and actual mock behavior agree.
- Demo data is clearly identified; no claims of real riders, production matching, real SMS, or remote push.

## Documentation and code comments

After each meaningful task, update the relevant spec, [ROADMAP.md](ROADMAP.md), [WORK_LOG.md](WORK_LOG.md), and [AI_CONTEXT.md](AI_CONTEXT.md). Use the [handoff template](AI_WORKFLOW.md#handoff-entry-template) to record actor/session, working copy, actual changes, checks/results, unfinished criteria, and next concrete step. Keep future work labeled planned and release ownership when handing off. Neither assistant should rely on the other's private chat or memory.

Add useful TSDoc to public/reusable hooks, data-source operations, transformations, and native/external boundaries. Document privacy, authorization, side effects, idempotency, or lifecycle assumptions where relevant. Do not bulk-comment obvious code.
