# Mock simulator and scenarios

Status: partly implemented: the simulator foundation (MOCK-001-A), the discovery world, seeds and public reads that the app runs on (MOCK-001-B), the demo controls (MOCK-001-C), sign-in and sessions (AUTH-001-A), and supplied destination matches (DESTINATION-001-A); the other operations and scenarios are planned. Last updated: 2026-11-07.

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

`apps/mobile/src/data/mock/`, covered by `tests/simulator.test.ts` with Jest fake timers. Nothing imports it from features (the ESLint boundary); MOCK-001-B wires it into the app ([below](#implemented-seeds-and-reads-mock-001-b)).

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
- **Reset:** `reset(next?)` starts the scenario over, or `next` (its seed, world and activation) in its place, which later resets keep (MOCK-001-C); the data source and connection watchers stay the same. Pending operations fail with `network` ("reset"), scheduled tasks, event subscriptions, receipts and queued failures are cleared, the clock offset, IDs and both random streams restart, the world is rebuilt and `activate` runs again, and the connection is restored. Connection watchers stay, since the app owns them. Repeated resets leave the same counts (`stats()`) and timers.
- **Disposal:** releases everything, connection watchers included; pending and later operations fail with `DataSourceUnavailableError`; it is idempotent.
- **Scheduling from work (MOCK-001-B):** work also gets `schedule(dueAt, work)`, so a transition can schedule a new record's deadline.

## Implemented seeds and reads (MOCK-001-B)

`apps/mobile/src/data/mock/`, covered by `tests/mockDataSource.test.ts`. The composition root builds the simulator for `EXPO_PUBLIC_MOCK_SCENARIO` at launch (`createMockSimulator`), adapts it with `createMockDataSource`, and disposes it when the root layout unmounts.

| Module | Rule |
| --- | --- |
| `world.ts` | Records: users (public profile only), ride requests (private exact `origin`, sanitized `publicOrigin` area, status, group link, version) and groups (members in join order, coordinator, meeting point, closure, version). Times are simulated milliseconds. Records stay after they end, so late reads and events still find them |
| `serializers.ts` | The only way records leave the source: each public DTO and event is built field by field, so no private field can leak and callers never share world state. A ride that is not active has no public projection and a closed group no preview; the serializers throw rather than trust the caller |
| `places.ts` | 12 curated Bishkek places with stable IDs such as `place_asia_mall` and approximate demo coordinates, shared by every scenario; the demo coverage box, 42.75–43.10° N and 74.40–74.80° E |
| `scenarios.ts` | The implemented keys and their seeds. Riders are invented first names without avatars; each public area is a district around the rider's exact origin |
| `lifecycle.ts` | Deadlines. An active ride expires at its `expiresAt`: it becomes `expired`, discovery removes it (`expired`) and its owner is told. A live group is cancelled at its `expiresAt`: closure `expired` dated at the deadline even after background time, history for one hour, members' requests cancelled; discovery removes it, and members and owners are told. `admitRide` adds another rider's new request with its deadline |
| `discovery.ts` | `places.search`, `rides.getNearby`, `rides.getRide`, `groups.getPreview` and accepting a nearby subscription, validating every input as the source would |
| `auth.ts` (AUTH-001-A) | Demo-number challenges, the demo code, sessions, rotation, logout and the current user, with the world's private `auth` records (accounts, challenges, sessions, tokens); rules in [authentication](api/authentication.md#implemented-mock-auth-001-a) |
| `createMockDataSource.ts` | `createMockSimulator(scenario)` and the `AppDataSource` adapter. Each implemented call goes through `Simulator.run` (latency, failure controls, connection); every other operation rejects at once with `DataSourceUnavailableError` |

- **Place search:** the curated places inside the area's circle, at most `limit`. Without a query, nearest the center first; with one (ignoring case), a label that starts with the text, then a label word that does, then a label or detail that contains it, each rank by distance. An area that does not reach the coverage box fails with `UNSUPPORTED_AREA`, and an invalid input with `VALIDATION_FAILED` (without field errors for now).
- **Discovery:** active solo rides and live groups whose public area's center lies in the viewport, nearest the viewport's center first, at most `limit`, with `truncated`. A grouped request never appears on its own: its group stands for it once, and its public read answers `TARGET_UNAVAILABLE`. With a destination, `previews` holds the scenario's supplied matches ([below](#supplied-destination-matches-destination-001-a)); without one it is empty. A destination must name a curated place. A viewport outside the coverage fails with `UNSUPPORTED_AREA`. Discovery reads anonymously: sessions exist since AUTH-001-A, but a signed-in viewer has no request, group or blocks until RIDE-001-A and SAFETY-001, so nothing is filtered by viewer yet.
- **Nearby subscriptions:** accepted after the simulated round trip; each delivers the public events about items in its viewport, and a removal is routed by the removed record's area. Delivery starts once the acknowledgement arrives, so a lost acknowledgement leaves no listener. `user` and `group` subscriptions stay unavailable until the operations whose events they carry exist.

| Scenario | World at activation | Timed |
| --- | --- | --- |
| `active-neighborhood` | Six solo rides in six districts; a forming group of three, and a ready group of two with a member-only meeting point. Eleven riders, one live request each | +8 s: a seventh solo ride appears; +20 s: a seeded ride reaches its deadline. Every other ride and group ends at its own deadline, so the area is empty after 26 minutes until a reset |
| `empty-neighborhood` | No riders; the curated places still exist | None |
| `map-density` (MAP-002-B) | 100 discovery items in the demo city's opening view: 25 synthetic "Demo block N" areas on a 5 × 5 grid about 1.3 km apart, each with three solo rides and one forming group of two (75 rides, 25 groups, 125 requests). Names and values repeat deterministically | None; rides and groups end at their own deadlines |

### Supplied destination matches (DESTINATION-001-A)

Matches are fixtures, written by hand in the scenario seeds; the mock never computes compatibility, routes or scores.

- **Record:** `SuppliedMatchRecord` in `world.ts` (`world.suppliedMatches`): the destination place, the target ride or group, `level`, `additionalMinutes`, and the departure choices it holds for (`null` for any). Seeds give a ride or group `matches`; the record is private and leaves the source only as a `MatchPreviewDto` (`toMatchPreviewDto`: target, level, minutes).
- **Discovery:** a read with `destinationPlaceId` returns, in `previews`, the matches for that destination whose target is among the returned `items`, in the items' order, each target once. A read with `departureOffsetMinutes` skips matches whose departure choices leave it out. The items themselves never change: unrelated activity stays. An item that left discovery (expired, grouped, closed) takes its match with it.
- **Scenario A fixtures:** Asia Mall: Aida excellent, Elnura good (+5). Vefa Center: Elnura excellent, Aida good (+4, departures +5 and +10 only). Ala-Too: Bakyt excellent (departure now only; gone at +20 s), the TSUM group good (+3). TSUM: the TSUM group excellent, Farkhat good (+2), Bakyt possible (+7). Dordoi Plaza: Farkhat excellent, the TSUM group possible (+6). Bishkek Park: Daniyar excellent; Philharmonic: Daniyar good (+3). Manas airport: Cholpon excellent; the ready airport group takes no riders, so it has none. Osh Bazaar: the ride appearing at +8 s, excellent. Other places (such as Western Bus Station) have none.
- **Scenario M:** each block's first ride matches its own destination (excellent), and each group its destination (good, +2).
- **Place search:** unchanged from MOCK-001-B; it is already deterministic, bounded by `limit` and the area, and cancellable through the read's signal, which the destination search (DESTINATION-001-B) reuses.

Tests check that every output and every event of a full 31-minute run validates against its contract schema, that no exact origin or meeting point appears in any of them, that each exact origin lies inside its public area but away from its center, and that grouped riders appear only through their group.

## Scenario controls

`EXPO_PUBLIC_MOCK_SCENARIO` selects the initial fixture. The build configuration (DATA-001-A) requires it with the mock data source and checks only its format; the composition root rejects a key the simulator does not know, which the configuration error screen shows (MOCK-001-B). A minimal development/preview picker offers scenario selection, reset, simulated connectivity, fail-next-operation, and time advancement. Controls stay out of feature components and production API mode.

**Implemented controls (MOCK-001-C):** `/dev/scenarios` (screen 50), reached from home's Demo badge or a deep link.

- **Port and gate:** features see the `DevControls` port (`src/data/DevControls.ts`) through `useDevControls()`. The composition root creates it (`createMockDevControls`) only for the mock data source in `development` and `preview` builds (`EXPO_PUBLIC_APP_ENV`); a `production` build never creates it, so home's Demo badge is plain text and the route shows "Demo scenarios are only available in development and preview builds that use mock data", without redirecting. It replaced the `__DEV__` check (`isDevelopmentMode`, removed).
- **Scenarios:** all 14 scenarios above (A to N) are listed as radio buttons; only implemented keys are enabled, the rest say "not built yet". Choosing one resets the app's one simulator into that scenario from its own seed (`reset(next)`), so the same data source and connection watchers serve the new world.
- **Controls:** restart the running scenario; Online and Offline (`setConnection`); move the source's clock ahead by 30 seconds, 5 or 15 minutes (`advanceTime`; the screen shows how far ahead it runs, back to real time on every reset); and queue a failure for the next request of any kind: no answer (`network`, nothing changed) or refused (`SERVICE_UNAVAILABLE`).
- **App caches:** starting a scenario, or the same one over, cancels and resets the app's cached reads (TanStack Query), so nothing from the old world stays on screen. The location choices (introduction set aside, confirmed pickup) stay, since places are the same in every scenario. There are no demo credentials yet (AUTH-001).
- **Feedback:** every action shows a notice and is announced to screen readers.

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
