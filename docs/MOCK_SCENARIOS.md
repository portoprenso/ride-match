# Mock simulator and scenarios

Status: partly implemented: the simulator foundation (MOCK-001-A), the discovery world, seeds and public reads that the app runs on (MOCK-001-B), the demo controls (MOCK-001-C), sign-in and sessions (AUTH-001-A), supplied destination matches (DESTINATION-001-A), the rider's own request (RIDE-001-A), scenario C with own-request matches (RIDE-001-D), joining a ride or group (GROUP-001-A), leaving it with the member-only group read (GROUP-001-B), and the coordinator's status changes (GROUP-001-C); the other operations and scenarios are planned. Last updated: 2026-11-08.

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
| `lifecycle.ts` | Deadlines and `closeGroup` (shared by expiry and the coordinator's completion or cancellation). An active ride expires at its `expiresAt`: it becomes `expired`, discovery removes it (`expired`) and its owner is told. A live group is cancelled at its `expiresAt`: closure `expired` dated at the deadline even after background time, history for one hour, members' requests cancelled; discovery removes it, and members and owners are told. `admitRide` adds another rider's new request with its deadline |
| `discovery.ts` | `places.search`, `rides.getNearby`, `rides.getRide`, `groups.getPreview` and accepting a nearby subscription, validating every input as the source would |
| `auth.ts` (AUTH-001-A) | Demo-number challenges, the demo code, sessions, rotation, logout and the current user, with the world's private `auth` records (accounts, challenges, sessions, tokens); rules in [authentication](api/authentication.md#implemented-mock-auth-001-a) |
| `rides.ts` (RIDE-001-A) | The signed-in rider's own request: create, read the current or latest one, cancel; [below](#own-ride-request-ride-001-a) |
| `groups.ts` (GROUP-001) | Joining a solo ride or a group with the caller's active request, leaving it, the coordinator's status changes, and the member-only group read; [joining](#joining-group-001-a), [leaving](#leaving-group-001-b), [status](#group-status-group-001-c) |
| `createMockDataSource.ts` | `createMockSimulator(scenario)` and the `AppDataSource` adapter. Each implemented call goes through `Simulator.run` (latency, failure controls, connection); every other operation rejects at once with `DataSourceUnavailableError` |

- **Place search:** the curated places inside the area's circle, at most `limit`. Without a query, nearest the center first; with one (ignoring case), a label that starts with the text, then a label word that does, then a label or detail that contains it, each rank by distance. An area that does not reach the coverage box fails with `UNSUPPORTED_AREA`, and an invalid input with `VALIDATION_FAILED` (without field errors for now).
- **Discovery:** active solo rides and live groups whose public area's center lies in the viewport, nearest the viewport's center first, at most `limit`, with `truncated`. A grouped request never appears on its own: its group stands for it once, and its public read answers `TARGET_UNAVAILABLE`. With a destination, `previews` holds the scenario's supplied matches ([below](#supplied-destination-matches-destination-001-a)); without one it is empty. A destination must name a curated place. A viewport outside the coverage fails with `UNSUPPORTED_AREA`. A signed-in viewer's own request and any group they belong to are left out (RIDE-001-A); blocks wait for SAFETY-001.
- **Nearby subscriptions:** accepted after the simulated round trip; each delivers the public events about items in its viewport, and a removal is routed by the removed record's area. Delivery starts once the acknowledgement arrives, so a lost acknowledgement leaves no listener. A signed-in subscriber is not sent upserts of their own request or group. `user` subscriptions (RIDE-001-A) need a working session (`UNAUTHENTICATED`/`SESSION_EXPIRED` otherwise) and deliver every event addressed to that rider, such as `ride.changed`. `group` subscriptions (GROUP-002-B) need a working session and current membership (`MEMBERSHIP_REQUIRED` otherwise, as for the group read) and deliver the group's events (`group.changed`) only while the subscriber is still a member.

| Scenario | World at activation | Timed |
| --- | --- | --- |
| `active-neighborhood` | Six solo rides in six districts; a forming group of three, and a ready group of two with a member-only meeting point. Eleven riders, one live request each | +8 s: a seventh solo ride appears; +20 s: a seeded ride reaches its deadline. Every other ride and group ends at its own deadline, so the area is empty after 26 minutes until a reset |
| `empty-neighborhood` | No riders; the curated places still exist | None |
| `match-appears` (RIDE-001-D) | Three solo rides: Aida (Asanbay → Asia Mall, +5 min) and two unrelated plans (Dzhal → Osh Bazaar, Vostok-5 → Manas airport). No destination previews | 5 s after the rider's own request is created: one excellent match with Aida's ride (+2 min), holding 3 minutes or until either request ends |
| `map-density` (MAP-002-B) | 100 discovery items in the demo city's opening view: 25 synthetic "Demo block N" areas on a 5 × 5 grid about 1.3 km apart, each with three solo rides and one forming group of two (75 rides, 25 groups, 125 requests). Names and values repeat deterministically | None; rides and groups end at their own deadlines |

### Own ride request (RIDE-001-A)

`rides.ts`, covered by `tests/mockRides.test.ts`. Rules follow [rides](api/rides.md); the order of checks is the contract's.

- **Create (`rides.create`):** `VALIDATION_FAILED` (input or unknown place), then authentication, then the receipt: the same operation ID and input returns the original request even after it ended; the same ID with another input is `IDEMPOTENCY_CONFLICT`. A new operation then checks `LOCATION_STALE` (a device fix older than 60 s on the source's clock, or more than 10 s ahead of it; a confirmed manual point never ages), `UNSUPPORTED_AREA` (origin outside the demo city) and `ACTIVE_REQUEST_EXISTS` (one live request). The request is `active`, departs at the source's time plus the chosen 0/5/10 minutes, expires after `RIDE_POLICY.activeLifetimeSeconds` (15 minutes), and emits `nearby.upserted` and the owner's `ride.changed`.
- **Public area:** the centre of the 0.01° grid cell holding the exact origin, radius 900 m, no label (`publicAreaFor`). It contains the origin without revealing where in the cell it is; the exact origin appears only in the owner's own view.
- **Read (`rides.getOwnRequest`):** the live request, otherwise the most recent one in whatever status it ended, otherwise `null`.
- **Cancel (`rides.cancel`):** `VALIDATION_FAILED`, authentication, the receipt, `NOT_FOUND`, `FORBIDDEN` (another rider's), then `USE_LEAVE_GROUP`, `RIDE_EXPIRED`, `INVALID_TRANSITION`, and only then `VERSION_CONFLICT`. Success emits `nearby.removed` (`unavailable`) and `ride.changed`.
- **Expiry:** the existing lifecycle (`expireRide`), scheduled at creation; it emits `nearby.removed` (`expired`) and `ride.changed`.
- **Current user:** `auth.getCurrentUser` names the live request (`rideRequestId`).
- **Matches (`rides.getMatches`, RIDE-001-D):** the owner's set, best first, with its own version (1 before any match). `NOT_FOUND` for an unknown request, `FORBIDDEN` for another rider's. Only an active request has matches; a match past its `expiresAt` or whose target left discovery is never returned. Matches come only from a scenario's `matchArrivals` plan (`MatchArrivalPlan`): scheduled at creation, supplied if both requests are still active, announced with `matches.changed` to the owner, and removed (with another `matches.changed`) when they expire.
- **Lost acknowledgement:** `failNext({ kind: 'network', afterCommit: true }, 'rides.create')` creates the request and loses the answer; a retry with the same input and operation ID returns it, and `getOwnRequest` already shows it.
- **Grouping:** a join ([below](#joining-group-001-a)) makes the request `grouped`; its group's deadline then governs it, and cancelling it answers `USE_LEAVE_GROUP`.

### Joining (GROUP-001-A)

`groups.ts`, covered by `tests/mockGroups.test.ts`. Rules follow [atomic joining](api/groups.md#atomic-joining); the order of checks is the contract's.

- **Atomicity:** the simulator runs each piece of work alone and to completion, so a join resolves its target and counts seats at the moment it runs, and of two joins that arrive together the second sees what the first did. This is the mock's stand-in for a backend transaction.
- **Checks (`groups.join`):** `VALIDATION_FAILED` (input, including the caller's own ride as the target), authentication, the receipt (same ID and input: the original result; another input: `IDEMPOTENCY_CONFLICT`), then `FORBIDDEN` (a request that is not the caller's, an unknown one too, so the answer never reveals whether it exists), `ALREADY_IN_GROUP`, `RIDE_EXPIRED`, `INVALID_TRANSITION`, `TARGET_UNAVAILABLE` (unknown target, a ride that expired, was cancelled or completed, a closed group), `GROUP_CLOSED` (ready), `GROUP_FULL` (four members). A failed join changes nothing.
- **Solo target:** a new `forming` group of two, both joined now, coordinated by the target's rider, with the target's destination, departure and public area, expiring `GROUP_POLICY.lifetimeSeconds` (30 minutes) later. Both requests become `grouped`; discovery removes the target ride (`unavailable`), and its owner is told.
- **Ride already grouped:** resolved to its group, so two first joins of one ride end in one group of three, and a full or ready group answers as if the group itself were named.
- **Group target:** the caller becomes the last member; the group stays `forming` even with four members, and its members are told (`group.changed`, `member_joined`).
- **Every success:** discovery removes the caller's ride (`unavailable`, never saying it joined a group) and upserts the group with its new count; the caller is told (`ride.changed`). The result is the member-only group (`toRideGroupDto`; the meeting point's walking estimate is `null`) and the grouped request.
- **Not yet:** blocks (no block records until SAFETY-001, so `BLOCKED_RELATIONSHIP` never occurs).

### Leaving (GROUP-001-B)

`groups.ts`, covered by `tests/mockGroups.test.ts`. Rules follow the [state machine](api/groups.md#state-machine).

- **Read (`groups.getGroup`):** the member-only group for its current members. `MEMBERSHIP_REQUIRED` for an unknown group, a non-member and a member who left, so access ends with the leave and a private read never reveals that a group exists. A closed group stays readable by the members it had at closure until `historyExpiresAt`, then answers `HISTORY_EXPIRED`.
- **Leave (`groups.leave`):** `VALIDATION_FAILED`, authentication, the receipt (same ID: the original result, even though the caller is no longer a member; another group: `IDEMPOTENCY_CONFLICT`), then `MEMBERSHIP_REQUIRED` (unknown group, non-member, former member) and `GROUP_CLOSED` (completed or cancelled). No version check.
- **Effect:** the caller leaves the member list and their request is `cancelled`, keeping the group's ID; nothing replaces it, and they may publish a new request. The group's version rises once.
  - **Two or more remain:** a `ready` group returns to `forming` and keeps its meeting point; the earliest remaining member coordinates if the coordinator left. Discovery upserts the new count; `group.changed` (`member_left`).
  - **One remains:** `cancelled` with closure `members_left`, closed now, history for one hour; that member coordinates and their request is cancelled too. Discovery removes the group (`unavailable`); `group.changed` (`cancelled`). The group's later deadline finds it closed and does nothing.
  - Each owner whose request ended gets `ride.changed`.

### Group status (GROUP-001-C)

`groups.ts` and `lifecycle.ts`, covered by `tests/mockGroups.test.ts`. Rules follow the [state machine](api/groups.md#state-machine).

- **Change (`groups.updateStatus`):** `VALIDATION_FAILED`, authentication, the receipt (same ID and input: the original group as it was then; another input: `IDEMPOTENCY_CONFLICT`), then `MEMBERSHIP_REQUIRED`, `FORBIDDEN` (a member who is not the coordinator), `GROUP_CLOSED`, `VERSION_CONFLICT`, and only then `INVALID_TRANSITION` (the current status itself, `forming` → `completed`, or `ready` without a meeting point).
- **Ready and reopen:** `forming` → `ready` (`group.changed` `ready`) stops joins (`GROUP_CLOSED`); `ready` → `forming` (`reopened`) keeps the point and takes joins again. Discovery shows the new status.
- **Complete and cancel:** `ready` → `completed`, or either live status → `cancelled` (`coordinator_cancelled`), closes the group now through `closeGroup`: the members' requests become `completed` or `cancelled` (keeping the group's ID), discovery removes it (`unavailable`), and the members and owners are told.
- **Expiry:** the same `closeGroup` with reason `expired` at `expiresAt`, dated at the deadline even when the task runs late after time in the background; grouped requests follow this deadline, not their own.
- **Terminal access:** a closed group is read-only (leave and status changes answer `GROUP_CLOSED`) and readable by its members at closure until `historyExpiresAt`, one hour after closing, then `HISTORY_EXPIRED`.
- **Meeting points:** no scenario supplies one yet (MEETING-001-A); scenario A's ready group has a seeded point, and tests set one on the record.
- **Nothing else changes a status:** the source has no taxi operation, so opening a taxi link can never complete or close a group.

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
