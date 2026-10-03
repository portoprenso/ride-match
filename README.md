# Ride Match

Ride Match helps nearby people heading in compatible directions form a small group and share a taxi. The first milestone is a React Native (Expo) mobile MVP backed by realistic mocks; there is no backend in this milestone.

**Status:** workspace foundation complete (MONO-001); Expo shell in progress (MOBILE-001). The root pnpm workspace uses Turbo to build the empty `@ride-match/contracts` package and to type-check and lint it together with `@ride-match/mobile`. The mobile app is a minimal Expo Router shell: one home route with a map placeholder. Development, native, export, and test commands do not exist yet. See [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) for the current state.

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

[`turbo.json`](turbo.json) orders tasks after their dependencies' builds and caches results locally in `.turbo/`. A cache hit replays the earlier logs and restores `dist/` without recompiling. Failed tasks are never cached. Turbo sends anonymous usage telemetry unless you opt out with `pnpm exec turbo telemetry disable` or `TURBO_TELEMETRY_DISABLED=1`; Expo CLI does the same unless `EXPO_NO_TELEMETRY=1` is set.

Development, export, native, doctor, and test commands are added one task at a time. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) describes them and when each one becomes available. Exact versions and per-task install commands are in [docs/TOOLCHAIN.md](docs/TOOLCHAIN.md).

## Layout

| Path | Contents |
| --- | --- |
| `apps/mobile/` | `@ride-match/mobile`: Expo SDK 57 app with Expo Router. Run Expo commands from this directory (`pnpm exec expo …`), never from the repository root |
| `apps/api/` | Intentionally empty; not a workspace package and not populated during the mobile milestone |
| `packages/contracts/` | `@ride-match/contracts`: shared transport contracts (ESM, `exports` to `dist/`); currently empty until CONTRACT-001 |
| `docs/` | Product, architecture, roadmap, toolchain, and handoff documentation |

## Documentation and contributing

Start with the [documentation index](docs/README.md). Work is split into bounded tasks in [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/FIRST_STEPS.md](docs/FIRST_STEPS.md). Coding assistants and contributors follow [AGENTS.md](AGENTS.md) and record progress in [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) and [docs/WORK_LOG.md](docs/WORK_LOG.md).
