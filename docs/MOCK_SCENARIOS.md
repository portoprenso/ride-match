# Mock simulator and scenarios

Status: partly implemented: the simulator foundation exists (MOCK-001-A); seeds, serializers, operations and scenario controls are planned. Last updated: 2026-11-01.

## Purpose

Validate mobile behavior through asynchronous, stateful mocks. Do not implement a fake NestJS server, production matching, or a persistent fake database. Features see the same operations and domain events expected from the future API.

## Simulator shape

Keep in-memory users, sessions, ride requests, groups, messages, blocks, report receipts, push-registration receipts, and idempotency results. Store private request inputs separately from public serialized DTOs.

Infrastructure is limited to a state container, injected clock, scheduled-event queue, typed emitter, deterministic ID/fixture seed, latency controls, and fail-next-operation controls. Domain operation modules contain small, understandable transition logic.

```text
Simulated delay
-> authenticate and validate
-> recheck current state
-> atomic mutation
-> serialize canonical response
-> emit corresponding events
```

Rechecking after delay enables actual last-seat and expired-target conflicts. Use a small serialization/critical-section mechanism for in-process group mutations; do not reproduce distributed backend infrastructure.

## Determinism and lifecycle

- Initial artificial latency: configurable 200–700 ms, reproducible from the scenario seed.
- Failure controls choose the operation and outcome explicitly; do not use unpredictable randomness in acceptance tests.
- Expiration is timestamp-driven. UI countdowns are presentation only.
- Process due events on reads/mutations and on foreground return; app backgrounding must not prevent expiry from taking effect.
- Tests advance a fake clock and can trigger scheduled events directly.
- Scenario reset cancels timers/subscriptions, clears data/query caches/pending operations/demo credentials, then reseeds.
- Full cold reload resets the scenario and mock session; foreground resume retains state and catches up.
- Keep mock auth credentials namespaced and isolated from future production storage.
- Public response serializers use safe fixtures and must never include exact origins or private destinations.
- Matching is a fixture/scenario result keyed to selected destinations and actions. Mobile never computes a routing score.
- Group changes and event payloads follow the future contracts, including permissions and idempotency.
- Cold reload reset is a documented demo limitation, not a model for future server persistence.

## Implemented foundation (MOCK-001-A)

`apps/mobile/src/data/mock/`, covered by `tests/simulator.test.ts` with Jest fake timers. Nothing imports it from features (the ESLint boundary), and the app does not use it yet: MOCK-001-B adds seeds and serializers and wires `createMockDataSource` into the composition root.

| Module | Rule |
| --- | --- |
| `clock.ts` | Simulated time is real time plus an offset that only grows; every deadline reads it. `nowIso()` gives contract timestamps |
| `random.ts` | Seeded generator (FNV-1a seed hash, mulberry32): the same seed repeats the same sequence |
| `ids.ts` | Deterministic `prefix_N` IDs, counted per prefix and restarted on reset |
| `scheduler.ts` | Tasks due at simulated times run because their time passed, not because a timer fired: one wake-up timer serves the foreground, and `processDue()` runs every overdue task in due order (then scheduling order) after background time or a time jump. A task leaves the queue before it runs |
| `events.ts` | Typed emitter with countable, clearable listeners |
| `receipts.ts` | Idempotency results per acting user and operation ID: a retry with the same operation and input (key order ignored) returns a copy of the original result without running again; a different request throws `IDEMPOTENCY_CONFLICT`; failures store nothing |
| `simulator.ts` | `createSimulator({ seed, createState, activate?, latencyMs? })` holds one generic world. `run(operation, work, { signal })` follows the pipeline above: refuse at once while disconnected or already aborted, wait a seeded latency (200–700 ms by default, its own random stream so world choices never shift it; abortable), run due tasks, apply a queued failure, run `work` synchronously (check before changing), then publish the events it emitted, only if it completed. `schedule` runs work at a simulated time under the same event rule |

- **Failure controls:** `failNext(failure, operation?)` queues explicit failures, matched in order to the named operation or to any. `network` means no answer: by default nothing changed; with `afterCommit` the change was made and only the answer is lost, so a retry with the same operation ID must find the original result. `source` refuses with a chosen error code and a fresh request ID. No random failures.
- **Connection:** `setConnection('disconnected')` fails new operations with `network`, makes operations in flight fail after their latency, and ends every event subscription (a subscription lasts one connection). `watchConnection` reports the state at once and on changes.
- **Time:** `advanceTime(ms)` moves simulated time and runs due tasks; `resume()` catches up on foreground return (SYNC-001-B calls it).
- **Reset:** pending operations fail with `network` ("reset"), scheduled tasks, event subscriptions, receipts and queued failures are cleared, the clock offset, IDs and both random streams restart, the world is rebuilt and `activate` runs again, and the connection is restored. Connection watchers stay, since the app owns them. Repeated resets leave the same counts (`stats()`) and timers.
- **Disposal:** releases everything, connection watchers included; pending and later operations fail with `DataSourceUnavailableError`; it is idempotent.
- **Not yet:** the world's record types and seeds, safe serializers and their validation, domain operations, the `AppDataSource` adapter (including `events.subscribe` routing by audience) and the dev controls (MOCK-001-B/C and the domain cards).

## Scenario controls

`EXPO_PUBLIC_MOCK_SCENARIO` selects the initial fixture. The build configuration (DATA-001-A) requires it with the mock data source and checks only its format; the simulator must reject a key it does not know. A minimal development/preview picker offers scenario selection, reset, simulated connectivity, fail-next-operation, and time advancement. Controls stay out of feature components and production API mode.

A clear demo indicator identifies synthetic data. Empty scenarios remain empty. Mock data-source outage and basemap tile outage are distinct states.

## Scenarios

Times below are relative to scenario activation unless an action is named. Initial fixtures use recognizable Bishkek-area destinations; no real personal information.

| ID / scenario key | Initial state | Timed or action-driven event | Expected visible result |
| --- | --- | --- | --- |
| A / `active-neighborhood` | Six solo rides, two groups | +8 s: ride appears; +20 s: another expires | Live map updates without camera jumps; counts/selection remain coherent |
| B / `empty-neighborhood` | No nearby activity | None | Honest empty state with create CTA; no decorative fake riders |
| C / `match-appears` | Unrelated nearby activity | Five seconds after successful own request creation: excellent match | Marker and request sheet emphasize supplied compatibility |
| D / `group-formation` | Joinable solo rider | After own join: third member at +5 s, fourth at +10 s | One group marker, live occupancy, full state; readiness still explicit |
| E / `last-seat-conflict` | Three-person forming group | Another user takes the final seat during own join latency | `GROUP_FULL`, refreshed capacity, no phantom membership |
| F / `request-expiration` | Own active request with 20 s left | Expiry at deadline | Matches/actions cleared, expired message, explicit create-again |
| G / `offline-resync` | Active request and group data | Disconnect +5 s, state changes while offline, reconnect +15 s | Stale banner, no queued mutations, authoritative recovered state |
| H / `failed-message` | Existing authorized group | First send fails; retry succeeds; duplicate event follows | Preserved draft/retry, exactly one canonical message |
| I / `location-unavailable` | Permission denial or missing fix | Optional permission recovery in settings | Manual browsing/pickup; no fabricated current position |
| J / `safety` | Shared group with reportable member | Block action | Blocking user leaves, chat/cache cleared, future pairing filtered |
| K / `notification-entry` | Existing match/group | Local notification; optionally expire/remove target before tap | Correct resource or clear unavailable state on warm/cold entry |
| L / `taxi-unavailable` | Ready group and meeting point | Link-open failure or provider absent | Supported browser/store fallback or retry/copy information |
| M / `map-density` | 100 safe public discovery items | Updates while user pans | Responsive clusters/taps/sheets; no repeated recenter |
| N / `session-expiration` | Authenticated user with preserved draft | Access expiry; refresh succeeds or fails deterministically | Single refresh; restored action context or sign-in continuation |

## Additional transition checks

- Two users join the same solo target concurrently: one canonical group, capacity respected.
- Duplicate mutation with the same key: same canonical result, no duplicate side effects/events.
- Same idempotency key with different input: stable error.
- Leave ready group: becomes forming if at least two remain; otherwise cancelled.
- Coordinator leaves: earliest remaining member becomes coordinator if group survives.
- Group lifetime expires: cancellation and read-only/retention behavior follow the group contract.
- Leaving/revocation removes private data immediately, even if a stale event arrives later.
- Reconnect with multiple missing message pages: catch up through sequence pagination.
- Mutation commits but response is lost: retry/reconciliation finds the original result.
- Old/out-of-order event: does not replace newer resource state.

## Verification ownership

Add scenarios alongside the tasks that introduce their operations; QA-001 integrates and documents the full matrix. Unit/integration tests must use the same data-source boundary as features. Native permission and taxi states also require real device/simulator verification; synthetic switches cannot establish that platform integrations work.

See [ROADMAP.md](ROADMAP.md) for task-specific checks and [DEVELOPMENT.md](DEVELOPMENT.md) for completion criteria.
