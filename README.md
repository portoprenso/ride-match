# Ride Match

Ride Match helps nearby people heading in compatible directions form a small group and share a taxi. The mobile MVP uses realistic mocks; the separate backend foundation is now implemented.

**Current state (2026-11-20): BE-001–003 are completed locally** — NestJS/PostgreSQL foundation, auth/places, ride requests/discovery/matches and transactional groups/meeting points, with their mobile HTTP adapter. The existing mock-backed mobile client and shared contracts are the integration baseline. Remaining frontend QA is recorded separately and does not gate starting the backend. [Backend start package](docs/BACKEND_HANDOFF.md) contains the reviewed 25 REST operations, event facade, initial transport decisions and bounded implementation order. `apps/api/` implements health and 17 REST operations across auth/places/rides/groups. Mobile API mode supports these slices; chat/safety/devices/realtime remain explicitly unavailable, with no mock fallback. Default mobile configuration remains mock. [Local backend setup](docs/DEVELOPMENT.md#local-backend-be-001) documents start/stop and configuration. BE-004 is planned, not started; real SMS and external deployment are not configured. See [AI context](docs/AI_CONTEXT.md) for ownership and [verification report](docs/VERIFY_005_REPORT.md) for unfinished frontend work.

## Requirements

- **Node.js 24.17.0**, pinned in [`.nvmrc`](.nvmrc). The root `engines` field together with `engineStrict` in [`pnpm-workspace.yaml`](pnpm-workspace.yaml) makes `pnpm install` fail on other Node versions.
- **pnpm 11.28.2** through Corepack, which ships with Node 24. The version comes from `packageManager` in [`package.json`](package.json).

Native Android/iOS prerequisites are needed only from the mobile tasks onward; see [docs/TOOLCHAIN.md](docs/TOOLCHAIN.md#native-prerequisites).

## Setup

```bash
nvm use
corepack enable pnpm
pnpm install --frozen-lockfile
```

- Run `corepack enable pnpm` once per Node installation. It adds `pnpm` and `pnpx` shims next to that Node binary.
- If `nvm` reports versions as not installed in a non-interactive shell, set `NVM_DIR="$HOME/.nvm"` first.
- Run pnpm only inside this repository. The root `packageManager` field makes Corepack use pnpm here, even when a parent folder declares another package manager.

## Commands

| Command | Behavior |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install the workspace exactly as locked |
| `pnpm build:api` | Build contracts and API into their `dist/` directories |
| `pnpm db:up` / `pnpm db:down` | Start/stop local PostgreSQL through Docker Compose; stopping preserves the data volume |
| `pnpm db:migrate` | Build API and apply pending checked SQL migrations |
| `pnpm start:api` / `pnpm dev:api` | Run compiled API / build then run API and TypeScript watcher; requires `apps/api/.env.local` |
| `pnpm test:api` / `pnpm test:api:integration` | Build and run API foundation tests / explicit local PostgreSQL integration test |
| `pnpm build:contracts` | `turbo run build` for contracts: compile `packages/contracts/src` into `packages/contracts/dist` (JavaScript and declarations) |
| `pnpm typecheck` | `turbo run typecheck`: strict TypeScript in contracts, mobile and API, no emit |
| `pnpm lint` | `turbo run lint`: contracts use the root [`eslint.config.mjs`](eslint.config.mjs) with type-aware TypeScript rules; mobile uses [`apps/mobile/eslint.config.js`](apps/mobile/eslint.config.js) (Expo's config) |
| `pnpm dev` | Build contracts, then run the contracts compiler watch and `expo start --dev-client` together in Turbo's terminal UI. To type Expo keys, select the mobile task (`j`/`k`), press `i`, and press `Ctrl+z` to stop interacting. `Ctrl+C` stops both processes |
| `pnpm dev:mobile` | Build contracts once, then start Expo without Turbo or a watcher. Use it, plus `pnpm --filter @ride-match/contracts dev` in a second terminal, if the terminal UI gets in the way |
| `pnpm doctor:mobile` | Run `expo-doctor` 1.20.4 on the app. Plain `pnpm doctor` is pnpm's own built-in diagnostic and does not check the app |
| `pnpm export:android` / `pnpm export:ios` | Build contracts, then export the JavaScript bundle to `apps/mobile/dist/` (ignored by Git) |
| `pnpm mobile:android` / `pnpm mobile:ios` | Build contracts, then `expo run:android` / `expo run:ios` (local development build into the untracked `apps/mobile/android/` / `ios/`). Both are verified (MOBILE-001-G/H). Set the variables in the [native prerequisites](docs/TOOLCHAIN.md#native-prerequisites) |
| `pnpm test:mobile` | Build contracts, then run the mobile Jest suites once. Extra arguments reach Jest, with paths relative to `apps/mobile`, for example `pnpm test:mobile --runTestsByPath tests/navigation.test.tsx` |
| `pnpm test:contracts` | Run the contracts Vitest suites once against the source (no build needed). Extra arguments filter files, for example `pnpm test:contracts errors` |
| `pnpm test` | `turbo run test`: every package's tests once (contracts, mobile and API foundation; real-DB integration is explicit), after dependency builds |

[`turbo.json`](turbo.json) orders tasks after their dependencies' builds and caches results locally in `.turbo/`. A cache hit replays the earlier logs and restores `dist/` without recompiling. Failed tasks are never cached. Turbo sends anonymous usage telemetry unless you opt out with `pnpm exec turbo telemetry disable` or `TURBO_TELEMETRY_DISABLED=1`; Expo CLI does the same unless `EXPO_NO_TELEMETRY=1` is set.

[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) describes the test commands, including the planned end-to-end ones, and when each becomes available. Exact versions and per-task install commands are in [docs/TOOLCHAIN.md](docs/TOOLCHAIN.md).

## Layout

| Path | Contents |
| --- | --- |
| `apps/mobile/` | `@ride-match/mobile`: Expo SDK 57 app with Expo Router. Run Expo commands from this directory (`pnpm exec expo …`), never from the repository root |
| `apps/api/` | `@ride-match/api`: ESM NestJS, PostgreSQL/migrations, health, persisted auth, curated places, requests/discovery and transactional groups/meeting points |
| `packages/contracts/` | `@ride-match/contracts`: implemented Zod transport schemas/types (ESM, `exports` to `dist/`); no database models or services |
| `docs/` | Product, architecture, roadmap, toolchain, and handoff documentation |

## Documentation and contributing

Start with the [documentation index](docs/README.md). Work is split into bounded tasks in [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/FIRST_STEPS.md](docs/FIRST_STEPS.md). Coding assistants and contributors follow [AGENTS.md](AGENTS.md) and record progress in [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) and [docs/WORK_LOG.md](docs/WORK_LOG.md).
