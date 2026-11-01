# Ride Match

Ride Match helps nearby people heading in compatible directions form a small group and share a taxi. The first milestone is a React Native (Expo) mobile MVP backed by realistic mocks; there is no backend in this milestone.

**Status:** workspace foundation (MONO-001) and Expo shell (MOBILE-001) complete. The root pnpm workspace uses Turbo to build the `@ride-match/contracts` package (so far the Zod schemas for common values, errors, locations, users, authentication, place search, ride requests, nearby discovery, matches and groups) and to type-check and lint it together with `@ride-match/mobile`. The mobile app is a minimal Expo Router shell that imports the shared package: a home route with a map placeholder and a temporary “Sign in” entry to inert phone and code placeholders. The group, chat, settings, and development-scenario routes open inert “not available yet” pages. Development, doctor, export, and native commands exist. Contract tests run with `pnpm test:contracts` and mobile behavior tests with `pnpm test:mobile`. The development builds are verified on an Android 16 emulator and an iOS 26.5 simulator (MOBILE-001-G/H). See [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) for the current state.

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
| `pnpm build:contracts` | `turbo run build` for contracts: compile `packages/contracts/src` into `packages/contracts/dist` (JavaScript and declarations) |
| `pnpm typecheck` | `turbo run typecheck`: strict TypeScript in contracts and mobile, no emit |
| `pnpm lint` | `turbo run lint`: contracts use the root [`eslint.config.mjs`](eslint.config.mjs) with type-aware TypeScript rules; mobile uses [`apps/mobile/eslint.config.js`](apps/mobile/eslint.config.js) (Expo's config) |
| `pnpm dev` | Build contracts, then run the contracts compiler watch and `expo start --dev-client` together in Turbo's terminal UI. To type Expo keys, select the mobile task (`j`/`k`), press `i`, and press `Ctrl+z` to stop interacting. `Ctrl+C` stops both processes |
| `pnpm dev:mobile` | Build contracts once, then start Expo without Turbo or a watcher. Use it, plus `pnpm --filter @ride-match/contracts dev` in a second terminal, if the terminal UI gets in the way |
| `pnpm doctor:mobile` | Run `expo-doctor` 1.20.4 on the app. Plain `pnpm doctor` is pnpm's own built-in diagnostic and does not check the app |
| `pnpm export:android` / `pnpm export:ios` | Build contracts, then export the JavaScript bundle to `apps/mobile/dist/` (ignored by Git) |
| `pnpm mobile:android` / `pnpm mobile:ios` | Build contracts, then `expo run:android` / `expo run:ios` (local development build into the untracked `apps/mobile/android/` / `ios/`). Both are verified (MOBILE-001-G/H). Set the variables in the [native prerequisites](docs/TOOLCHAIN.md#native-prerequisites) |
| `pnpm test:mobile` | Build contracts, then run the mobile Jest suites once. Extra arguments reach Jest, with paths relative to `apps/mobile`, for example `pnpm test:mobile --runTestsByPath tests/navigation.test.tsx` |
| `pnpm test:contracts` | Run the contracts Vitest suites once against the source (no build needed). Extra arguments filter files, for example `pnpm test:contracts errors` |
| `pnpm test` | `turbo run test`: every package's tests once (contracts and mobile), after dependency builds |

[`turbo.json`](turbo.json) orders tasks after their dependencies' builds and caches results locally in `.turbo/`. A cache hit replays the earlier logs and restores `dist/` without recompiling. Failed tasks are never cached. Turbo sends anonymous usage telemetry unless you opt out with `pnpm exec turbo telemetry disable` or `TURBO_TELEMETRY_DISABLED=1`; Expo CLI does the same unless `EXPO_NO_TELEMETRY=1` is set.

[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) describes the test commands, including the planned end-to-end ones, and when each becomes available. Exact versions and per-task install commands are in [docs/TOOLCHAIN.md](docs/TOOLCHAIN.md).

## Layout

| Path | Contents |
| --- | --- |
| `apps/mobile/` | `@ride-match/mobile`: Expo SDK 57 app with Expo Router. Run Expo commands from this directory (`pnpm exec expo …`), never from the repository root |
| `apps/api/` | Intentionally empty; not a workspace package and not populated during the mobile milestone |
| `packages/contracts/` | `@ride-match/contracts`: shared transport contracts (ESM, `exports` to `dist/`); currently empty until CONTRACT-001 |
| `docs/` | Product, architecture, roadmap, toolchain, and handoff documentation |

## Documentation and contributing

Start with the [documentation index](docs/README.md). Work is split into bounded tasks in [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/FIRST_STEPS.md](docs/FIRST_STEPS.md). Coding assistants and contributors follow [AGENTS.md](AGENTS.md) and record progress in [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) and [docs/WORK_LOG.md](docs/WORK_LOG.md).
