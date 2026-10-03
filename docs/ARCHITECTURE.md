# Architecture plan

Status: proposed; implementation has not started. Last updated: 2026-10-03.

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

The root instruction files and `docs/` already exist; application/packages/configuration shown above remain planned. Both Codex and Claude Code use the same [shared workflow](AI_WORKFLOW.md) and update the same state/specification files. Tool-specific private memory does not define application architecture or task completion.

## One data-source boundary

```text
Routes / feature components
    -> Feature query and mutation hooks
    -> AppDataSource operations + event subscriptions
    -> In-memory simulator now
    -> HTTP + Socket.IO later
```

`AppDataSource` has typed namespaces: auth, places, rides, groups, chat, safety, devices, and events. Feature hooks are ordinary TanStack Query wrappers, not a second repository/service/use-case architecture.

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

## Contracts package shape

```text
packages/contracts/src/
  common.ts       location.ts     auth.ts          users.ts
  places.ts       rides.ts        matches.ts       groups.ts
  chat.ts         safety.ts       notifications.ts realtime.ts
  errors.ts       index.ts
```

The planned TypeScript/Zod convention is `FooSchema` as the runtime definition and `FooDto = z.infer<typeof FooSchema>` as its inferred type. Requests, public responses, owner responses, and event payloads use separate schemas where their visibility or fields differ. Do not maintain duplicate handwritten interfaces for the same schema.

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
