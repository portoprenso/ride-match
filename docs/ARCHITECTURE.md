# Architecture plan

Status: proposed; partly implemented (see [AI context](AI_CONTEXT.md)). Last updated: 2026-11-01.

## Objective and scope

Build a complete mobile MVP with realistic asynchronous mock data, then review its contracts before implementing any backend. Product UI should retain its data-facing interface when HTTP and Socket.IO replace mocks.

The mobile data milestone does not require offline basemap tiles. Application data/authentication are mocked; the map SDK, foreground location, local notifications, and opening an external application remain native integrations.

## Technology decisions

| Area | Decision | Rationale |
| --- | --- | --- |
| Workspace | pnpm workspaces, pinned package manager, one lockfile | Reproducible installation and explicit package dependencies |
| Task runner | Turborepo | Coordinates mobile and contracts without additional infrastructure |
| Mobile | Expo, React Native, strict TypeScript, development builds | Expo-compatible native integrations and rapid iteration |
| Navigation | Expo Router | Thin file-based routes and notification/deep-link entry points |
| Remote-like state | TanStack Query | Async resources, mutations, invalidation, reconnect behavior |
| Presentation state | React state/reducers and small contexts | Sufficient for drafts, selection, camera, sheets, session infrastructure |
| Validation | Zod with inferred TypeScript types | Runtime boundaries and static types share one definition |
| Credentials | SecureStore refresh credential; in-memory access token | Credentials stay out of ordinary local storage |
| Analytics | Typed vendor-neutral boundary | Instrumentation is testable without an external vendor |
| Testing | Vitest for contracts; Jest/jest-expo and React Native Testing Library for mobile; selected Maestro flows | Pure schema tests, feature behavior, and native integration verification |

Select a mutually supported stable Expo/React/React Native combination when implementation starts and pin it. Do not copy independent latest versions. Start with Expo's automatic Metro workspace configuration and normal pnpm isolation; add overrides only for a reproduced issue. [Expo monorepos](https://docs.expo.dev/guides/monorepos/)

Expo Router is recommended over hand-configured React Navigation because file-based routes and deep links fit this app. Keep business behavior in features, not route modules. [Expo Router](https://docs.expo.dev/router/introduction/)

Connect Query focus/online behavior to native application state and the effective data-source availability. In mock mode, a scenario can simulate a backend outage independently of tile connectivity. [TanStack Query on React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)

## Map evaluation

| Criterion | react-native-maps | MapLibre React Native |
| --- | --- | --- |
| Expo | Included in Expo Go; standalone provider configuration still required | Config plugin and development build; not available in Expo Go |
| Markers | Convenient React Native markers; keep renders lightweight | Annotations plus style-layer symbols/circles |
| Clustering | Add a small utility such as Supercluster | GeoJSON-source clustering |
| Performance | Appropriate starting point for bounded nearby data; benchmark custom markers | Useful for larger datasets using data-driven layers |
| Styling | Provider-dependent | Greater control over styles/layers |
| Provider | Google on Android, Apple or Google on iOS | Tile/style provider selected separately |
| Costs | SDK/service costs are separate; Google currently lists Maps SDK as a no-cost SKU, other services can be billed | Open-source renderer; tile/provider/hosting costs still apply |
| Future flexibility | Adequate for the MVP | Reconsider if custom cartography becomes a core requirement |

Choose **react-native-maps**, Apple Maps on iOS and Google Maps on Android. Test Bishkek coverage, density, and custom markers early. Keep SDK-specific rendering inside the map feature, without a generic provider framework.

**Implemented (MAP-001-A):** react-native-maps 1.27.2 with each platform's default provider. `src/features/map/HomeMap.tsx` is the only module that renders it; `mapCamera.ts` (`useHomeCamera`, `DEMO_CITY_REGION`, `streetRegion`) decides camera moves; `MapHomeScreen.tsx` composes the home. The layout is UI, not map code: `src/ui/MapLayout.tsx` places any map behind a floating header, right-hand controls and a fixed bottom sheet, and reports the covered space for the map's padding. The Android key reaches only the native manifest through Expo's `android.config.googleMaps.apiKey`; JavaScript sees whether it was configured (`src/config/isMapProviderConfigured.ts`) and shows a notice instead of a map that would stop the app. Bishkek coverage and both providers' rendering still need the native check.

Sources: [Expo maps](https://docs.expo.dev/versions/latest/sdk/map-view/), [MapLibre Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/), [MapLibre clustering](https://maplibre.org/maplibre-react-native/docs/components/sources/geo-json-source/), [Google pricing](https://developers.google.com/maps/billing-and-pricing/overview). Recheck compatibility and commercial terms when configuring the implementation.

The map renderer, destination search provider, and matching/routing engine are separate responsibilities. No production route calculation runs on mobile. A future backend may use PostGIS candidate filtering followed by OSRM/Valhalla road-network compatibility; those internals do not belong in shared contracts.

## Planned directory structure

```text
ride-match/
├── AGENTS.md                        # Shared assistant instructions
├── CLAUDE.md                        # Imports shared instructions for Claude Code
├── apps/mobile/
│   ├── app/                         # Routes/layouts only; no tests here
│   ├── src/
│   │   ├── bootstrap/               # Providers and composition
│   │   ├── config/                  # Validated configuration
│   │   ├── data/
│   │   │   ├── AppDataSource.ts
│   │   │   ├── createDataSource.ts
│   │   │   ├── queryKeys.ts
│   │   │   ├── synchronizeEvents.ts
│   │   │   └── mock/
│   │   │       ├── state.ts
│   │   │       ├── clock.ts
│   │   │       ├── events.ts
│   │   │       ├── operations/
│   │   │       └── scenarios/
│   │   ├── features/                # auth, map, destinations, rides, groups, chat, safety
│   │   ├── platform/                # location, notifications, taxi, storage
│   │   ├── analytics/
│   │   └── ui/                      # Small reusable primitives
│   ├── tests/
│   ├── .maestro/
│   ├── app.config.ts
│   └── package.json
├── packages/contracts/
│   ├── src/
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── docs/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── turbo.json
└── README.md
```

Only `packages/contracts` is shared. Do not add UI/config/utils packages for one consumer. Its initial build should produce ordinary JavaScript and declarations with explicit exports; mobile depends on it using `workspace:*`. Prepare contracts before starting Metro, then watch both during development. Match module/export configuration to actual tool compatibility in MONO-001/MOBILE-001.

The existing empty `apps/api/` directory is intentionally omitted from the planned package structure. Do not populate it during this milestone.

Existing so far: the root instruction files, `docs/`, the root workspace configuration (MONO-001), the `packages/contracts` package (common values and error schemas since CONTRACT-001-A, with Vitest tests in `packages/contracts/tests/`), and the minimal mobile shell (MOBILE-001-A: `apps/mobile/package.json`, `app.config.ts`, `app/_layout.tsx`, `app/index.tsx`, `src/features/map/MapPlaceholderScreen.tsx`), plus MOBILE-001-B's temporary `src/bootstrap/checkContractsPackage.ts` smoke import of `@ride-match/contracts` (removed by DATA-001-B), MOBILE-001-C's `src/ui/Screen.tsx` and `src/ui/Button.tsx`, MOBILE-001-D's `app/auth/{_layout,phone,otp}.tsx` with `src/features/auth/AuthPlaceholderScreens.tsx`, MOBILE-001-E's inert `app/groups/[groupId]/{index,chat}.tsx`, `app/settings.tsx`, and `app/dev/scenarios.tsx` with `src/ui/UnavailableScreen.tsx` and `src/config/isDevelopmentMode.ts`, MOBILE-001-F's `jest.config.js` with `tests/{navigation,ui}.test.tsx` and `tests/helpers/renderApp.ts`, and MOBILE-001-G's `expo-status-bar` plugin entry in `app.config.ts`. MOBILE-001-H changed `src/ui/Screen.tsx` to pad from the safe-area provider's insets. UI-001-A added `src/ui/tokens.ts`, `src/ui/AppText.tsx`, `assets/fonts/` (Manrope and `OFL.txt`), and `assets/brand/` (the Along mark). UI-001-B extended `src/ui/Button.tsx` and added `src/ui/{IconButton,Badge,Notice}.tsx`. UI-001-C added `src/ui/{TextField,OtpField,SegmentedControl,FieldMessage}.tsx`. UI-001-D added `src/ui/{SheetHost,ConfirmAction,ActionFooter}.tsx` and a form layout (`scroll`, `footer`) in `src/ui/Screen.tsx`. DATA-001-A added `apps/mobile/.env`, `src/config/appConfig.ts`, `src/data/{AppDataSource,createDataSource,createUnavailableDataSource,errors}.ts`, `src/data/DataSourceProvider.tsx`, and `src/bootstrap/{composeAppDataSource.ts,ConfigurationErrorScreen.tsx}`, which `app/_layout.tsx` uses. DATA-001-B added `src/data/{queryKeys,queries}.ts`, `src/bootstrap/createQueryClient.ts`, the error model in `src/data/errors.ts`, and the import-boundary block in `eslint.config.js`. MOCK-001-A added the simulator foundation in `src/data/mock/{clock,random,ids,scheduler,events,receipts,simulator}.ts`; the planned `state.ts` is replaced by a generic world that each simulator builds from its seed, and `operations/` and `scenarios/` arrive with MOCK-001-B and the domain cards. Rules are in [MOCK_SCENARIOS.md](MOCK_SCENARIOS.md#implemented-foundation-mock-001-a). MOCK-001-C replaced `src/config/isDevelopmentMode.ts` with the demo-controls gate and added `src/data/{DevControls.ts,DevControlsProvider.tsx}`, `src/data/mock/createMockDevControls.ts`, `src/features/demo/DemoScenariosScreen.tsx` and `src/ui/ScreenHeader.tsx`. MAP-001-A replaced `MapPlaceholderScreen` with `src/features/map/{MapHomeScreen,HomeMap}.tsx` and `mapCamera.ts`, and added `src/ui/{MapLayout,Icon}.tsx` (icons drawn with react-native-svg from the design's paths) and `src/config/isMapProviderConfigured.ts`. Native `android/` and `ios/` are generated by prebuild and stay untracked. The rest of the structure above is still planned. Both Codex and Claude Code use the same [shared workflow](AI_WORKFLOW.md) and update the same state/specification files. Tool-specific private memory does not define application architecture or task completion.

## One data-source boundary

```text
Routes / feature components
    -> Feature query and mutation hooks
    -> AppDataSource operations + event subscriptions
    -> In-memory simulator now
    -> HTTP + Socket.IO later
```

`AppDataSource` has typed namespaces: auth, places, rides, groups, chat, safety, devices, and events. Feature hooks are ordinary TanStack Query wrappers, not a second repository/service/use-case architecture.

**Implemented (DATA-001-A):** `src/data/AppDataSource.ts` declares the eight namespaces, one operation per documented endpoint with the contract input and result types and path IDs as separate arguments. Reads take an optional `AbortSignal`; mutations take none, since aborting cannot undo a change (an unknown outcome is retried with the same operation ID). `events.subscribe` types each listener by the subscription kind, and a subscription lasts one connection; `events.watchConnection` reports `connected` or `disconnected`. `createDataSource` is the only branch on the configured kind: `mock` calls the simulator factory the composition root supplies, and `api` throws `DataSourceUnavailableError`. `src/bootstrap/composeAppDataSource.ts` composes once per launch; the root layout provides the result through `DataSourceProvider` (features call `useDataSource()`), or shows `ConfigurationErrorScreen`. MOCK-001-B replaced the unavailable stand-in in the mock slot with the simulator (below). **Implemented (DATA-001-B):** the root layout also provides one TanStack Query client per launch (`src/bootstrap/createQueryClient.ts`): reads retry at most twice and only after a lost answer or `SERVICE_UNAVAILABLE`; mutations never retry automatically. `src/data/errors.ts` is the mobile error model: `DataError` with `kind` `source` (a contract-validated `ApiErrorDto` body, via `DataError.fromSource`), `network`, `unavailable` (`DataSourceUnavailableError`), `aborted` or `unexpected` (anything else, including a body that breaks the contract); `toDataError` and `withDataErrors` normalize rejections, and Query's `defaultError` type is `DataError`. `src/data/queryKeys.ts` scopes every key the session can change by viewer (`anonymous` or a user ID), keeps place search `public`, groups one group's private keys under one prefix, and holds only IDs and coarse inputs. `src/data/queries.ts` gives Query options for the eight unpaged reads, passing Query's abort signal, so a read that becomes obsolete (an older viewport, an unmounted screen) is aborted. ESLint fails any import of `src/data/mock` outside `src/bootstrap` and the simulator. Connecting Query focus and online state to app state and the connection is SYNC-001-B. The temporary contracts smoke import is removed: `errors.ts` validates error bodies with `ApiErrorSchema` at run time.

**Implemented (MOCK-001-B):** the mock slot holds the simulator for the configured scenario: `createMockSimulator` and the `createMockDataSource` adapter in `src/data/mock/`, which the composition root alone imports. An unknown scenario key fails the composition as a configuration error. `createDataSource` returns the data source with a `dispose` that only the composition root calls; the root layout disposes it on unmount, so a Fast Refresh remount or a test leaves no simulator timers behind. Place search, nearby discovery, the public ride and group reads and nearby subscriptions run on the simulator; every other operation rejects at once with `DataSourceUnavailableError` until its card lands (reusing `createUnavailableDataSource`). Records reach callers only through serializers that build each contract DTO field by field. Rules: [MOCK_SCENARIOS.md](MOCK_SCENARIOS.md#implemented-seeds-and-reads-mock-001-b).

**Implemented (AUTH-001-A):** an implementation sends the caller's access token, which it reads from an `AccessTokenSource` (`() => string | null`, in `src/data/AppDataSource.ts`) when each operation starts, as an HTTP client sets a header. The mock adapter takes it as `createMockDataSource(simulator, { accessToken })`; without one it is anonymous, which is how the composition root builds it until the session controller (AUTH-001-B) supplies the token. The mock auth operations live in `src/data/mock/auth.ts`, with private auth records in the mock world ([rules](api/authentication.md#implemented-mock-auth-001-a)).

**Implemented (AUTH-001-B):** the composition root builds the auth session controller (`src/features/auth/createSessionController.ts`) just after the data source and hands the data source its `getAccessToken`, so the token passes from session to transport without feature code. The refresh token goes through the first storage boundary, `src/platform/secureStorage/credentialStore.ts` (SecureStore, namespaced per data source). Features read the session with `useSessionState()` and act on it with `useSessionController()` (`AuthSessionProvider`). The wrapped demo controls discard the session when a scenario starts. Details: [api/authentication.md](api/authentication.md#implemented-session-auth-001-b).

**Implemented (AUTH-001-C):** protected actions go through a typed pending-intent gate (`src/features/auth/pendingIntent.ts`, built by the composition root, used through `useRequireSignIn` and `useResumeIntent`). An intent is data naming the action and target, never a callback or payload; drafts stay in their screens beneath the modal auth stack, and after sign-in the owning screen reads the target again and shows its own confirmation. The auth layout's `SignInFlow` keeps the number and challenge in memory, closes the stack on sign-in and cancels the intent when the stack closes otherwise. The composition also returns `demoSignIn` (the mock's demo number and code, `src/data/DemoSignIn.ts`), so screens show it without importing the mock. Details: [api/authentication.md](api/authentication.md#implemented-sign-in-and-gate-auth-001-c).

**Implemented (AUTH-001-D):** `src/features/settings/SettingsScreen.tsx` is the settings feature (its route `app/settings.tsx` is thin); sign-out stays in the auth feature (`SignOutSheet.tsx`, `signOutOutcome.ts`), which talks only to the session controller. After a sign-out the route resets the root stack to map + settings so no private screen survives; private cache cleanup is the sync coordinator's identity-change handling, not the screen's.

**Implemented (MAP-001-B):** the map picker lives in `src/features/map/MapPointPicker.tsx` (`useMapPointPicker`, `CentrePin`, `MapPointPanel`, `pinPoint`) and is a mode of `MapHomeScreen`; the point comes from the map (`coordinateForPoint`), not from region arithmetic, so map padding cannot shift it. Naming a point is a location-feature read (`src/features/location/nearestPlace.ts`) through the data source with a coarse area. Pickup choices gained `map-point` pickups (`toMapPointPickup`, `describePickup`). Tile availability is a platform concern (`src/platform/map/useMapTileStatus.ts`), independent of the data source's connection.

**Implemented (MAP-002-A):** discovery is its own feature, `src/features/discovery/` (`viewport.ts`, `useNearbyDiscovery.ts` with the pure `describeDiscovery`, `DiscoveryPanel.tsx`), read through `nearbyQuery` and kept current through `useEventSubscription`; `MapHomeScreen` owns the rested region and renders the panel. `src/data/useConnectionState.ts` exposes the data source's connection to screens. The composition root now creates the analytics client (`selectAnalyticsSink` by environment) and the root layout starts and provides it.

**Implemented (MAP-002-B):** discovery's map pieces stay in `src/features/discovery/` (`nearbyItems.ts` pure wording and clustering, `DiscoveryMarkers.tsx` rendered as `HomeMap` children, `NearbyListSheet.tsx`, `useClock.ts`); `MapHomeScreen` owns the selection, the list's content and the user-requested camera moves (cluster zoom, row selection), which end any automatic follow. Screen 26 reuses `useMapTileStatus`. No clustering library: an absolute power-of-two grid.

**Implemented (MAP-002-C):** `useTargetPreview` reads the opened target's public projection through `rideQuery`/`groupPreviewQuery` (viewer-scoped keys, so sign-in rereads it), and `describePreview` lets the source's `TARGET_UNAVAILABLE` decide a disappeared target; the event synchronizer's invalidation of the same key on removal or expiry is what turns an open preview `gone`. `PreviewPanel` is home's sheet content while a preview is open (not a modal), so the map stays visible and sign-in routes can open over it. `MapHomeScreen` owns the open target and the join intent, through `useRequireSignIn` and `useResumeIntent`.

**Implemented (DESTINATION-001-B):** `src/features/destinations/` holds the destination sheet, the sheet section and pure match helpers. The chosen destination is presentation state in `MapHomeScreen`; it reaches the source only as `destinationPlaceId` in the nearby read (a new Query key per destination). `useNearbyDiscovery` returns `matches` only for a snapshot read for the current destination, tracked per snapshot object in a module-level `WeakMap` (placeholder data is the previous read's object). Markers, the list and previews take that index; nothing on mobile computes compatibility. `PlaceSearchResults` (`src/features/location/`) serves both place sheets.

**Implemented (RIDE-001-B):** `src/features/rides/` holds the draft logic (`rideDraft.ts`), the create sheet and own-request hook. The draft (destination, departure, pickup choice) is presentation state in `MapHomeScreen`, which survives sign-in; the protected action goes through `useRequireSignIn({ kind: 'create-request' })` and `useResumeIntent`. Mutations take an operation ID from `src/data/operationId.ts`; the create result is written to the own-request query.

**Implemented (RIDE-001-C):** the own request is read through `useOwnRequest`, which also holds the `user` subscription so `ride.changed` refreshes it. The card's countdown has its own one-second clock and is mounted only with a request, so the map does not re-render every second. `src/bootstrap/withSessionRenewal.ts` wraps the composed data source so every signed-in operation renews an expired access token once (`runAuthenticated`); features and the session controller's own auth calls stay unaware of it.

**Implemented (RIDE-001-D):** `useOwnMatches` reads the own request's matches (refreshed by `matches.changed`) and drops expired ones by timestamp; `MapHomeScreen` uses them as the emphasis index in place of destination previews while a request searches. The unknown-create recovery stays inside the create sheet: it reads the own request and either finishes with it or retries the frozen input.

**Implemented (GROUP-002-A):** `src/features/groups/` holds the join confirmation (`JoinPanel`) and `joinOutcome.ts` (`describeJoinError`, `describeJoinPlan`). The confirmation is a step of the open preview inside home's sheet, not a modal, so a create sheet closing before it never overlaps another modal. It revalidates the target (`useTargetPreview`'s `retry`, waiting on `fetching`), fixes the join input and operation ID at the first press, writes only the source's canonical group and grouped request to the cache (no optimistic membership), and recovers an unknown outcome by reading the own request (and the group it names) or resending the same input. Home goes on from a preview to a draft when the rider has no live request (`pendingJoin`), and resumes a join intent after sign-in by adjusting state while rendering once the target and the own request are known (`useOwnRequest`'s `known`).

**Implemented (SYNC-001-A):** `src/data/synchronizeEvents.ts` keeps the Query cache consistent with realtime events without an event-sourced client store: per-viewer resource versions and tombstones, patching of public discovery payloads, invalidation for private changes, and reconciliation of every successful read (watching the query cache) so a read that started before an event cannot overwrite it. Details: [api/realtime.md](api/realtime.md#implemented-synchronization-sync-001-a).

**Implemented (SYNC-001-B):** the composition root now also builds the Query client and the sync coordinator (`src/data/createSyncCoordinator.ts`), which reads the viewer from the session through a `ViewerSource` (`src/features/auth/sessionViewer.ts`), owns the realtime subscriptions features watch (`useEventSubscription`), and resets subscriptions, private reads and the synchronizer on identity, connection and scenario changes. Query's focus and online managers follow `AppState` and the data source's connection. Details: [api/realtime.md](api/realtime.md#implemented-lifecycle-sync-001-b).

**Implemented (MOCK-001-C):** the demo controls are a second, optional port: `src/data/DevControls.ts` (`DevControls`: the documented scenarios with whether each is available, a snapshot with subscription, and scenario, reset, connection, failure and time actions) and `DevControlsProvider.tsx` (`useDevControls()`, `null` in builds without them). The composition root creates them with the mock source (`createMockDevControls` in `src/data/mock/`) only when `EXPO_PUBLIC_APP_ENV` is not `production`, and `createDataSource` passes that decision to the factory. Switching scenarios resets the same simulator into the new world (`Simulator.reset(next)`), so the `AppDataSource` and its watchers never change. `src/features/demo/DemoScenariosScreen.tsx` uses the port and clears the Query cache when a scenario starts; it never imports the simulator.

Requirements:

- All operations are asynchronous and use shared request/response schemas.
- Select implementation once in composition; no scattered `if (isMock)` branches.
- Screens never import fixtures, scenario controls, mock clocks, or state containers.
- Use lint import restrictions to protect the mock/feature boundary.
- Query keys include relevant parameters and session identity.
- Abort obsolete reads, including destination searches and viewport requests.
- Authentication changes clear private cache and resynchronize personalized discovery.
- Server errors and transport failures become a small consistent mobile error model.
- Realtime updates share the same domain contract in both implementations.
- API mode fails clearly until implemented; never silently fall back to mock users.
- No real HTTP or Socket.IO adapter is part of the mobile MVP.

## Feature responsibilities

| Feature/boundary | Responsibility |
| --- | --- |
| Auth | Session bootstrap, OTP screens, refresh/logout, protected-action continuation |
| Map | Camera, public markers, clusters, selection, map sheets |
| Destinations | Search input, suggestions, selected draft |
| Rides | Create/cancel, own request, expiry, match presentation |
| Groups | Join/leave, members/capacity, coordinator actions, completion |
| Chat | History, text sending, retry presentation, incoming messages |
| Safety | Report/block UI and resulting access changes |
| Location | Foreground permission and device-location lifecycle |
| Notifications | Permission, local simulation, payload handling, navigation |
| Taxi | Validate reviewed trip parameters and open Yandex Go |
| Analytics | Typed, privacy-safe events and sink selection |

Avoid abstract base classes, dependency-injection containers, generic factories, and duplicate service/repository layers. Keep business transition simulation in mock operation modules and presentation logic in features.

**Implemented (LOCATION-001-A):** `src/platform/location/` is the first platform boundary. `locationServices.ts` wraps Expo Location's foreground calls in a small `LocationServices` port (permission, services, cached, current and watched positions; never altitude, speed or heading). `createLocationController` owns the lifecycle and reports a frozen `LocationState`, which `describeLocation(state, now)` turns into what the UI may show and `assessFix` judges for freshness and accuracy (`locationFix.ts`). `LocationProvider`, `useLocationController()` and `useLocationState()` (`useSyncExternalStore`) hand it to React. It reads and writes no app data, so it cannot move a published request. A denial also reads the services state, because iOS reports location services that are off as a denial (VERIFY-002). The root layout creates the one controller, starts it once the data source is composed, and disposes it on unmount (LOCATION-001-B). Rules: [location lifecycle](PRODUCT.md#location-lifecycle). `src/platform/appState.ts` holds the small `AppStateSource` type that lifecycle code (location, analytics sessions) accepts instead of React Native's `AppState`, so tests can drive foreground and background.

**Implemented (LOCATION-001-B):** `src/features/location/` is the first feature module. `HomeLocation.tsx` holds `useLocationIntro()` (whether home shows the introduction, and its two actions) and `HomeLocationPanel` (the location card and the confirmed pickup); `locationCard.ts` is the pure `describeLocationCard(status, platform)` that turns a `LocationStatus` into the card's words and second action; `LocationIntroScreen.tsx` is screen 01; `PickupPlaceSheet.tsx` chooses and confirms a named pickup in one `SheetHost`; `usePlaceSearch.ts` searches through `placeSearchQuery` with a debounce and `DEFAULT_BROWSE_AREA` until the map supplies a region; `LocationChoicesProvider.tsx` keeps this launch's choices (introduction set aside, the confirmed `ConfirmedPickup`, a frozen `manual` location built by `toConfirmedPickup`). The root layout provides the controller and the choices around the stack, so later routes share them. `src/platform/location/openLocationSettings.ts` opens the app's settings or, on Android, the device location switch. The home route stays thin: it shows the introduction or `MapHomeScreen` (MAP-001-A), whose sheet holds the panel and which shares `useLocationStatus()` with it. Features reach places only through the data source, never the mock.

**Implemented (ANALYTICS-001-A):** `src/analytics/` is the typed, vendor-neutral boundary: a catalog of the documented events with bounded properties, checked at compile time and run time; sessions and marker dwell; a context that marks every mock-source event `synthetic`; and memory or no-op sinks, so nothing leaves the device. Features call `useAnalytics()`; the first instrumented card adds the client to the root layout. Rules: [analytics boundary](DEVELOPMENT.md#analytics-boundary).

## Contracts package shape

```text
packages/contracts/src/
  common.ts       location.ts     auth.ts          users.ts
  places.ts       rides.ts        matches.ts       groups.ts
  nearby.ts
  chat.ts         safety.ts       notifications.ts realtime.ts
  errors.ts       index.ts
```

The TypeScript/Zod convention (implemented from CONTRACT-001-A) is `FooSchema` as the runtime definition and `FooDto = z.infer<typeof FooSchema>` as its inferred type; scalar and input types drop the suffix (`Timestamp`, `ExactLocationInput`). Requests, public responses, owner responses, and event payloads use separate schemas where their visibility or fields differ. Do not maintain duplicate handwritten interfaces for the same schema.

Object schemas are strict (`z.strictObject`): an unknown field fails validation instead of passing through or being silently stripped. That makes an accidental extra field, which may be private data, a test failure rather than a leak. DTO values stay JSON-shaped (timestamps remain strings), so input and output types match and no schema transforms data. So far `common.ts` (IDs, timestamps, versions, operation IDs, cursors, single-line and multi-line text, response envelope), `errors.ts` (error codes, field errors, error body), `location.ts` (coordinates, coarse coordinates, exact input, owner, public and meeting-point locations, location policy) `users.ts` (public user, current user) `auth.ts` (phone number, one-time code, challenge, session credentials, mock OTP policy) `places.ts` (curated place, search input and results), `rides.ts` (public and owner ride requests, create and cancel inputs, departure choices), `matches.ts` (match level, preview, match and match set), `groups.ts` (group status and policy, join target, public group preview, member-only group with members and closure, join, leave and status-change inputs and results), `chat.ts` (message text, sequence, message, send input, history query and page), `safety.ts` (report reasons, details, context, input and receipt; block input, result and block list), `realtime.ts` (event envelope and audiences, the seven events, per-subscription unions, subscription request, acknowledgement and unsubscribe), `notifications.ts` (the four notification payloads and their union, notification policy, installation ID, Expo push token, platform, permission, push-device registration and receipt) and `nearby.ts` (coarse viewport, discovery query, ride/group item union and snapshot) exist. `nearby.ts` was added to this layout by CONTRACT-002-B: it composes rides, group previews and match previews, which keeps the imports one-way (rides ← groups ← matches ← nearby). `safety.ts` imports the leave result from `groups.ts` (groups ← safety), and `chat.ts` only common values and users. `realtime.ts` sits on top: it imports chat, groups, nearby and rides, and nothing imports it. `notifications.ts` imports only common values and the join target from `groups.ts`. Every module in the layout above now exists.

The package contains DTOs, request/response schemas, string-literal enum schemas, and event/notification payloads. It must not contain React Native code, UI state, database/Prisma/PostGIS types, service implementations, or backend-only matching logic. Contract fields and semantics are in [API overview](api/overview.md).

## Domain versus UI state

Contract state includes request/group lifecycle, canonical members/messages, match levels, and server timestamps. Mobile-only state includes selected marker, camera/follow mode, sheet snap position, cluster membership, form drafts, pending auth continuation, marker colors, sending/failed chat state, countdown labels, and connectivity banners.

Example: `RideMatchDto.level` is shared because the data source supplies it; a marker's highlight color belongs in a mobile view model. Selectors may combine DTOs with local state but must not calculate production matching or create a second authoritative server-state store.

## Platform and security boundaries

- Exact origin is private authenticated input; public origin/destination are approximate or deliberately public venues.
- Shared meeting-point coordinates require group access. They never represent live rider location.
- Use SecureStore for refresh credentials and memory for access tokens; clear only this app's namespaced keys on reset/logout. [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- No background GPS, payments, taxi-booking API, AI, advanced reputation, social graph, or multi-provider framework.
- Useful TSDoc should explain exported operations, authorization, privacy, lifecycle side effects, retries, and event ordering; avoid repeating obvious types.
