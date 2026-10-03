# Toolchain record

Recorded on 2026-10-03 by Claude Code (session toolchain-record) for MONO-001-A. Versions, compatibility evidence, and commands come from npm registry metadata, official documentation, and read-only local probes taken that day. This record installed, scaffolded, and reconfigured nothing.

From MONO-001-B onward, tasks use the versions, commands, and decisions recorded here. Changing any of them requires evidence and an update to this file. Every `pnpm` command below is **planned** until the task that introduces it completes. Items under [Verify later](#verify-later) are expectations, not verified results.

## Decisions at a glance

| Area | Decision |
| --- | --- |
| Node.js | 24.17.0 (Active LTS line 24 "Krypton"); `.nvmrc`, root `engines`, and `engineStrict` |
| Package manager | pnpm 11.28.2 through Corepack; root `packageManager: "pnpm@11.28.2"` |
| Mobile SDK | Expo SDK 57: `expo` 57.0.26, React Native 0.86.3, React 19.2.3 |
| TypeScript | 6.0.3 in every package |
| Task runner | Turbo 2.11.6; root `turbo.json` with `agentGuidance: false` (MONO-001-E) |
| Lint | ESLint 9.39.5 (flat config); `typescript-eslint` 8.71.0 for contracts; `eslint-config-expo` 57.0.2 for mobile |
| Mobile tests | Jest 29.7.0, `jest-expo` 57.0.5, React Native Testing Library 14.0.1 with `test-renderer` 1.3.0 |
| Doctor | `expo-doctor` 1.20.4 as an exact mobile dev dependency |
| Contracts format | ESM (`"type": "module"`), one `exports` entry with `types` then `default` |
| Typed routes | Off for this batch (see [Mobile](#mobile-tsconfigjson-mobile-001-a)) |

## User decisions (2026-10-03)

1. **Node and pnpm provisioning:** Node 24. The user approved MONO-001-B running `corepack enable pnpm` while Node 24.17.0 is active. This adds only `pnpm`/`pnpx` symlinks in that Node installation's `bin` directory, and `corepack disable pnpm` reverts it.
2. **MEGAsync:** The checkout stays in the synced folder. The user adds sync exclusions for the generated paths listed in [MEGAsync exclusions](#megasync-exclusions-user-action). Assistants do not edit sync settings and cannot verify them.
3. **Ancestor home-directory packages:** They stay. The repository relies on the guards in [Ancestor guards](#ancestor-guards).

No open user decision remains. MONO-001-B ran the approved `corepack enable pnpm` on 2026-10-03.

## Local environment (observed 2026-10-03)

These are read-only probes from Claude Code's non-interactive shell. The user's interactive shell may differ.

| Item | Observed |
| --- | --- |
| OS / Git | macOS (Darwin 25.3.0), arm64; Git 2.50.1 |
| Node (nvm) | Default alias `22`, giving 22.23.2 on `PATH`. Also installed: 24.17.0, 20.10.0, 18.19.0 |
| Corepack | 0.34.6 with Node 22 (pnpm shim present); 0.35.0 with Node 24 (no pnpm shim). `COREPACK_ENABLE_AUTO_PIN=0` is set |
| pnpm | The shim refuses inside the repo: "configured to use yarn because /Users/home/package.json has a packageManager field" |
| Watchman | 2026.07.27.00 |
| JDK | `java` on `PATH` is Zulu 17.0.20.1. `/usr/libexec/java_home` defaults to Zulu 21.0.2. Zulu 11 (x86_64) is also installed. `JAVA_HOME` is unset |
| Android SDK | `~/Library/Android/sdk`: platforms 34–36; build-tools including 36.0.0; NDK 27.0, 27.1.12297006, 28.0, 29.0; CMake 3.18.1 and 3.22.1; cmdline-tools; emulator 36.3.10. `ANDROID_HOME` and `ANDROID_SDK_ROOT` are unset |
| AVD | `Pixel_9_Pro_XL`: android-36, google_apis_playstore, arm64-v8a |
| adb | `PATH` resolves to Homebrew's `/opt/homebrew/bin/adb` (1.0.41, version 37.0.1) ahead of the SDK's platform-tools adb (1.0.41, version 36.0.2); the two versions differ |
| Xcode | 26.6 (17F113); iOS 26.5 simulator runtime; 5 available iPhone simulators |
| CocoaPods | 1.17.0 (Homebrew; Ruby 4.0.6). Warns without UTF-8; `LANG`/`LC_ALL` are unset |
| MEGAsync | App 6.4.0 installed, not running during the probe. The sync-root `.megaignore` excludes `node_modules`, every dot-entry (`.*`), symlinks, `**/ios/Pods`, `**/ios/build`, `**/android/app/build`, and `**/android/releases` |
| Ancestor home folder | `package.json` (`packageManager: yarn@4.18.0`; 11 dependencies, 1 dev dependency), `yarn.lock`, `package-lock.json`, `.yarnrc.yml`, `app.json` (`{"expo": {}}`). `node_modules` has 205 entries, including `react` 18.2.0, `metro` 0.87.0, `@babel/core` 7.29.7, and `@types/{jest,mocha,node,react,react-native,…}` |
| Other ancestor configs | None found for ESLint, Babel, tsconfig, Jest, Watchman, Metro, Turbo, pnpm workspace, or Node version files |

## Runtime and package manager

**Node 24.17.0.** On 2026-10-03, the Node.js release index marks line 24 as LTS ("Krypton", 24.21.0 newest), line 22 as LTS ("Jod", maintenance), and line 26 as Current (not LTS). Line 24 satisfies:

- Expo SDK 57's minimum, Node 22.13.x
- React Native 0.86.3's `engines` (`^24.3.0`)
- pnpm 11 (`>=22.13`)
- ESLint 9 (`^20.19.0 || ^22.13.0 || >=24`)
- React Native Testing Library 14 (`^22.13.0 || >=24`)

The installed 24.17.0 is used so no new Node installation is needed.

- **Version file:** `.nvmrc` contains `24.17.0`. Root `package.json` has `"engines": { "node": "^24.17.0" }`.
- **Engines guard (corrected in MONO-001-B):** the pnpm v11 docs say a project's own `engines` mismatch always fails installation. With pnpm 11.28.2, `pnpm install --frozen-lockfile` under Node 22.23.2 only printed `[WARN] Unsupported engine` and exited 0. `engineStrict: true` in `pnpm-workspace.yaml` makes the same command fail with `ERR_PNPM_UNSUPPORTED_ENGINE` (exit 1), and it passes under Node 24.17.0. `engineStrict` also rejects any dependency whose `engines` excludes the running Node; if that happens, record the package and decide with evidence.
- **Non-interactive shells** start on Node 22. Activate the pinned version in the same command line. In Claude Code's shell, `nvm` is a shell function but `NVM_DIR` is unset, so `nvm use 24.17.0` reported "not yet installed". Use `export NVM_DIR="$HOME/.nvm" && nvm use >/dev/null && pnpm install --frozen-lockfile`, where `nvm use` reads `.nvmrc`.

**pnpm 11.28.2.** This is the `latest-11` tag, published 2026-09-28.

- pnpm 12 (`latest`, 12.8.1) was not selected. Its first release was on 2026-08-26, and it ships a native-binary launcher with platform `optionalDependencies`. Corepack 0.34.6 and 0.35.0 map `>=11.0.0` to the tarball's `bin/pnpm.mjs`; whether that works with 12's layout is unverified.
- **Provisioning:** Corepack 0.35.0, bundled with Node 24.17.0. The Node.js 26 API docs have no Corepack page (HTTP 404 on 2026-10-03), so re-plan provisioning before any move to Node 26 or later.

**MONO-001-B bootstrap order (user-approved; completed 2026-10-03):**

1. `nvm use 24.17.0`
2. `corepack enable pnpm` (Node 24.17.0 installation only).
3. Write the root `package.json` with `packageManager` **before the first pnpm command**. Corepack uses the nearest manifest, so this declaration takes precedence over the ancestor yarn one.
4. `corepack install`, which downloads pnpm 11.28.2 into the Corepack cache. It prompts only when stdin is a TTY.
5. `pnpm --version` must print `11.28.2`.

Result: after `nvm use`, Node 24.17.0's `bin` directory came first on `PATH`. `corepack enable pnpm` added `pnpm` and `pnpx` symlinks there. `corepack install` printed "Adding pnpm@11.28.2 to the cache...", and `pnpm --version` printed `11.28.2`. The pnpm store is at `~/Library/pnpm/store/v11`, outside the synced folder. pnpm prints an update notice (11.28.2 → 12.8.1) that suggests a `curl … | sh` installer. Ignore it; pnpm 12 is not selected, and global installers are user decisions.

**pnpm 11 behavior that matters** (from the v11 settings documentation):

- Settings live in `pnpm-workspace.yaml`, and `.npmrc` is read only for auth and registry settings. Do not create a repository `.npmrc`.
- `strictDepBuilds` defaults to `true`, so installs fail on unreviewed dependency build scripts. See [Build-script policy](#build-script-policy).
- `minimumReleaseAge` defaults to 1440 minutes, so versions younger than one day are not installed. Every selection here was older than 24 hours at 2026-10-03 09:07 UTC. This is why Turbo is 2.11.6: 2.11.7 was about 18 hours old at that time.
- `autoInstallPeers` defaults to `true` and `strictPeerDependencies` to `false`. Missing required peers are installed automatically. Treat missing or invalid peer warnings as defects to resolve, not to suppress.
- `nodeLinker` stays at the isolated default. Expo supports isolated installs from SDK 54. Switching to hoisted needs a reproduced failure.
- `pmOnFail` defaults to `download`: a mismatched pnpm switches to the declared version.

`pnpm-workspace.yaml` for MONO-001-B:

```yaml
packages:
  - apps/*
  - packages/*
savePrefix: ''
engineStrict: true
```

`savePrefix: ''` saves exact versions for every `pnpm add`. `engineStrict: true` is the Node guard described above. `apps/api/` has no manifest, so it is not a workspace package.

## Build-script policy

- **Default:** deny, matching pnpm 11's strict default. Never set `dangerouslyAllowAllBuilds`.
- When an install fails with ignored builds, read that package's script and add an explicit `allowBuilds` entry to `pnpm-workspace.yaml`. Use `true` only when the package cannot work without its script. Record the decision in the table below. Warnings are resolved, not silenced.
- None of the planned direct dependencies declares a `preinstall`, `install`, or `postinstall` script (checked with `npm view <pkg>@<version> scripts`).
- **Expected in MOBILE-001-A:** `unrs-resolver` 1.12.2 arrives through `eslint-config-expo` → `eslint-import-resolver-typescript` 3.10.1. It has `postinstall: node postinstall.js`, a fallback that fetches its native binding when the platform optional package is missing. The expected decision is `false`, provided mobile lint passes with the binding pnpm installs. Confirm this at install time.

| Package | Decision | Reason and verification | Task |
| --- | --- | --- | --- |
| *(none yet)* | | MONO-001-B: the root tree (110 packages) has no `preinstall`/`install`/`postinstall` scripts (scan of `node_modules/.pnpm`), and `pnpm install` passed under the strict default | MONO-001-B |

## Direct dependencies

All versions are exact. "Expo range" means `bundledNativeModules.json` in `expo@57.0.26` or the SDK 57 `relatedPackages` from the Expo versions API.

### Root (`devDependencies`, MONO-001-B)

| Package | Version | Purpose | Compatibility evidence |
| --- | --- | --- | --- |
| `turbo` | 2.11.6 | Task orchestration | No peers or engines declared. 2.11.7 was younger than pnpm's one-day minimum |
| `typescript` | 6.0.3 | Peer for typed linting from the root config | Expo SDK 57 `~6.0.3`; `typescript-eslint` peer `>=4.8.4 <6.1.0` |
| `eslint` | 9.39.5 | Peer for the root config packages | Expo CLI 57's lint prerequisite installs `eslint@^9.0.0` |
| `@eslint/js` | 9.39.5 | JavaScript recommended rules | Same 9.x line as ESLint |
| `typescript-eslint` | 8.71.0 | TypeScript parser and rules for contracts | Peers: `eslint ^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0`, TypeScript `<6.1.0` |

### Contracts (`@ride-match/contracts`)

| Package | Version | Kind | Purpose | Added in |
| --- | --- | --- | --- | --- |
| `typescript` | 6.0.3 | dev | `build`, `dev` (watch), and `typecheck` scripts | MONO-001-C |
| `eslint` | 9.39.5 | dev | Binary for the package `lint` script | MONO-001-D |

There are no runtime dependencies. Zod arrives with CONTRACT-001.

### Mobile (`@ride-match/mobile`)

| Package | Version | Kind | Purpose | Evidence | Added in |
| --- | --- | --- | --- | --- | --- |
| `expo` | 57.0.26 | runtime | SDK | `latest` and `sdk-57` tags | MOBILE-001-A |
| `react` | 19.2.3 | runtime | UI runtime | Expo range | MOBILE-001-A |
| `react-native` | 0.86.3 | runtime | Native runtime | Expo range | MOBILE-001-A |
| `expo-router` | 57.0.24 | runtime | File routes | Expo `~57.0.24` | MOBILE-001-A |
| `react-native-safe-area-context` | 5.7.0 | runtime | Router peer; safe areas | Expo `~5.7.0` | MOBILE-001-A |
| `react-native-screens` | 4.26.2 | runtime | Router peer | Expo `~4.26.0` | MOBILE-001-A |
| `expo-linking` | 57.0.11 | runtime | Router peer | Expo `~57.0.11` | MOBILE-001-A |
| `expo-constants` | 57.0.20 | runtime | Router peer | Expo `~57.0.20` | MOBILE-001-A |
| `expo-status-bar` | 57.0.1 | runtime | Listed in Expo Router's install command | Expo `~57.0.1` | MOBILE-001-A |
| `expo-dev-client` | 57.0.19 | runtime | Development builds | Expo `~57.0.19` | MOBILE-001-A |
| `@ride-match/contracts` | `workspace:*` | runtime | Shared package | Fixed decision | MOBILE-001-B |
| `typescript` | 6.0.3 | dev | Typecheck | Expo `~6.0.3` | MOBILE-001-A |
| `@types/react` | 19.2.18 | dev | React types | Expo `~19.2.4` | MOBILE-001-A |
| `eslint` | 9.39.5 | dev | Lint binary | Expo CLI 57 `^9.0.0` | MOBILE-001-A |
| `eslint-config-expo` | 57.0.2 | dev | Expo flat lint config | Expo `~57.0.2` | MOBILE-001-A |
| `expo-doctor` | 1.20.4 | dev | Pinned doctor | `latest`, published 2026-08-26 | MOBILE-001-B |
| `jest` | 29.7.0 | dev | Test runner | Expo `~29.7.0`; `jest-expo` depends on Jest 29 packages | MOBILE-001-F |
| `jest-expo` | 57.0.5 | dev | Expo Jest preset | Expo `~57.0.5` | MOBILE-001-F |
| `@types/jest` | 29.5.14 | dev | Jest types | Expo `29.5.14` | MOBILE-001-F |
| `@testing-library/react-native` | 14.0.1 | dev | Behavior tests | Expo Router testing requires 14 or newer | MOBILE-001-F |
| `test-renderer` | 1.3.0 | dev | Testing Library 14's required renderer peer (`^1.0.0`) | Peer `react ^19.0.0` | MOBILE-001-F |
| `@react-native/jest-preset` | 0.86.3 | dev | Required peer of `jest-expo` 57 (`^0.86.3`) | Matches React Native 0.86.3 | MOBILE-001-F |

**Required peers expected to be auto-installed, not listed directly:** `@expo/log-box` 57.0.4 and `@expo/metro-runtime` 57.0.16, both required by `expo-router`. If pnpm or `expo install --check` reports them missing or mismatched, add them at the Expo version and record why.

**Optional peers intentionally not installed:** `react-dom` and `react-native-web` (no web target), `react-native-reanimated`, `react-native-gesture-handler`, and `react-server-dom-webpack`. No Babel or Metro config file is planned (Expo defaults; see [Verify later](#verify-later)).

### Newer releases intentionally not selected

- **TypeScript 7.0.2** (`latest`): outside `typescript-eslint` 8.71.0's peer range and Expo SDK 57's `~6.0.3`.
- **ESLint 10.12.0** (`latest`): `eslint-plugin-react` 7.37.5 (peer `^9.7`) and `eslint-plugin-import` 2.32.0 (peer `^9`), both dependencies of `eslint-config-expo` 57, do not declare support for ESLint 10. npm marks 9.39.5 deprecated ("no longer supported"). It is accepted for development-only linting until Expo's lint config supports 10. The install prints a deprecation warning, and tasks record it rather than hide it.
- **Expo 58** (`next`, React Native 0.88 release candidate), **React Native 0.87.1**, and **React 19.3.0**: not part of a stable Expo SDK.
- **Jest 30.5.2 and `@types/jest` 30**: `jest-expo` 57 is built on Jest 29.
- **pnpm 12.8.1** and **Turbo 2.11.7**: see above.
- **`react-native-safe-area-context` 5.10.1 and `react-native-screens` 4.28.0**: outside Expo SDK 57's ranges.

## TypeScript configuration

TypeScript 6.0 changed several defaults (from the official tsconfig reference and the 6.0 release notes):

- `types` defaults to `[]`; older versions included every visible `@types` package from ancestor `node_modules`.
- `strict` defaults to `true`, `module` to `esnext`, `target` to `es2025`, and `rootDir` to the tsconfig's directory.
- `noUncheckedSideEffectImports` defaults to `true`.

6.0 also deprecates `moduleResolution` `node10`/`classic`, `baseUrl`, `esModuleInterop: false`, `target: es5`, and `outFile`. Do not use deprecated options, and do not use `ignoreDeprecations` to bypass them. Every tsconfig still sets `types` explicitly.

### Contracts `tsconfig.json` (MONO-001-C)

```jsonc
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2022"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": [],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "rootDir": "src",
    "outDir": "dist",
    "noEmitOnError": true
  },
  "include": ["src"]
}
```

- Relative imports in contracts source use `.js` extensions, as `nodenext` requires.
- No DOM `lib` and `types: []` keep the package runtime-neutral.
- There is no `incremental` or `composite`, so no `.tsbuildinfo` is produced.

Package scripts:

- `build`: `tsc -p tsconfig.json`
- `dev`: `tsc -p tsconfig.json --watch --preserveWatchOutput`
- `typecheck`: `tsc -p tsconfig.json --noEmit`

### Mobile `tsconfig.json` (MOBILE-001-A)

```jsonc
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": []
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- `expo/tsconfig.base` (57.0.26) supplies `module: preserve`, `moduleResolution: bundler`, `customConditions: ["react-native"]`, `jsx: react-jsx`, `noEmit`, `allowJs`, `skipLibCheck`, and `lib: ["DOM", "ESNext"]`. Its `exclude` covers `node_modules`, `android`, `ios`, and Babel, Metro, and Jest config files. It sets no `types`.
- React Native 0.86.3 declares `__DEV__` in its own types (`src/types/globals.d.ts`), which load through `react-native` imports. No global types package is needed for the shell.
- MOBILE-001-F adds `"jest"` to `types` only if tests need the global Jest types, which is expected because Expo Router's matchers extend Jest's `expect`. Record the outcome.
- `app.config.ts` is type-checked with these settings and imports the `ExpoConfig` type from `expo/config`.

**Typed routes are off for this batch:** omit `experiments.typedRoutes`.

- When typed routes are on, Expo CLI 57's dev server writes `expo-env.d.ts`, adds `expo-env.d.ts` to the project `.gitignore`, and adds `.expo/types/**/*.ts` and `expo-env.d.ts` to the tsconfig `include`.
- When typed routes are off, it deletes `expo-env.d.ts` and removes those `include` entries.

With typed routes off and the entries absent, `expo start` does not rewrite tracked files, and a clean checkout type-checks the same as a used one. Enabling typed routes later needs a plan for generating route types before `typecheck`. Never hand-write `expo-env.d.ts`.

## Contracts module format

```json
{
  "name": "@ride-match/contracts",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

How each consumer loads this entry:

- **Node 24:** loads the emitted ESM natively. MONO-001-C checks this with the card's `node --input-type=module` import.
- **TypeScript consumers:** `types` comes first. The mobile `bundler` resolution with `customConditions: ["react-native"]` still selects `types` for declarations.
- **Metro (Expo 57):** resolves package `exports`, and `default` matches whatever condition set Metro uses. Expected; MOBILE-001-B verifies it with both exports and no source aliases.
- **Jest 29.7.0 via `jest-expo`:** a CommonJS `require` matches `default`. Jest rejects a `.js` file from a `"type": "module"` package (`ERR_REQUIRE_ESM`) only when `vm.SyntheticModule` exists, meaning Node runs with `--experimental-vm-modules`. Evidence: `jest-resolve` 29.7.0 `build/shouldLoadAsEsm.js` and `jest-runtime` 29.7.0 `requireModule`. `jest-expo` does not use that flag, so babel-jest transforms the file. Its real path (`packages/contracts/dist/…`) has no `node_modules` segment, so Expo's `transformIgnorePatterns` does not skip it. MOBILE-001-F verifies this without aliases or mocks.

If a consumer fails, record the evidence and choose one format that all three load. Do not create a dual build.

## Lint configuration

- One ESLint version, 9.39.5, with flat config. ESLint 9 looks up the config from the working directory upward, and there is no ancestor config.
- **Root `eslint.config.mjs` (MONO-001-D):** `@eslint/js` recommended plus `typescript-eslint` `recommendedTypeChecked`, with `parserOptions.projectService: true`, for `packages/contracts/**/*.ts`. Set `@typescript-eslint/no-explicit-any` to `"error"` explicitly. Global ignores: `**/dist/**`, `**/node_modules/**`, and `apps/**`; mobile has its own config.
- **Contracts `lint`:** `eslint .`. It runs in `packages/contracts` and finds the root config.
- **Implemented in MONO-001-D (2026-10-03):** the root config uses `defineConfig` and `globalIgnores` from `eslint/config` (ignores `**/dist/`, `**/node_modules/`, `apps/`), with `tsconfigRootDir: import.meta.dirname`. `eslint --debug` from `packages/contracts` showed the root config file and base path loaded through ESLint 9's working-directory lookup ("LegacyConfigLoader"), with `src/index.ts` as the only linted file. Contracts' `eslint` resolves to the same `.pnpm` directory as the root's. MONO-001-D's root wrappers were `pnpm -r run typecheck` and `pnpm -r run lint` (root excluded from `-r`); MONO-001-E replaced them with `turbo run typecheck` and `turbo run lint`.
- **Negative probes (temporary files, removed):** a `string`-to-`number` assignment failed `pnpm typecheck` with TS2322 (exit 2). An explicit `any` parameter failed `pnpm lint` with `@typescript-eslint/no-explicit-any` (exit 1) while typecheck passed. An unawaited promise failed `pnpm lint` with `@typescript-eslint/no-floating-promises` (exit 1), which shows type-aware rules are active.
- **Mobile `eslint.config.js` (MOBILE-001-A):** CommonJS, following Expo CLI 57's template.
  - `require('eslint-config-expo/flat')` through `defineConfig` from `eslint/config`.
  - Then `{ rules: { '@typescript-eslint/no-explicit-any': 'error' } }`.
  - Ignores: `dist/*`, `.expo/*`, `android/*`, `ios/*`.
- **Mobile `lint`:** `eslint .`. Do not use `expo lint`, which can install packages.
- Type-aware rules for mobile, and future mock-import boundary rules (DATA-001, MOCK-001), are deferred.

## Test configuration (MOBILE-001-F)

- **`apps/mobile/jest.config.js`** (CommonJS; Expo's base tsconfig excludes it):
  - `preset: 'jest-expo'`
  - Expo's pnpm pattern: `transformIgnorePatterns: ['node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))']`
  - `testMatch` limited to `<rootDir>/tests/**/*.test.ts?(x)`
- Route tests use `renderRouter` and `screen` from `expo-router/testing-library` against the real `app/` directory. Tests stay outside `app/`.
- **Scripts:**
  - Mobile `test`: `jest`. No `--watchAll` and no `passWithNoTests`.
  - Root `test:mobile`: `pnpm build:contracts && pnpm --filter @ride-match/mobile test`. pnpm appends extra arguments to the end, so `--runTestsByPath tests/navigation.test.tsx` (relative to `apps/mobile`) reaches Jest.
  - Root `test`: `turbo run test`.

## Turbo and development commands

**`turbo.json` (MONO-001-E, implemented):**

- `"$schema": "./node_modules/turbo/schema.json"`, so the schema matches the installed version.
- `"ui": "tui"`
- `"agentGuidance": false`: by default, Turbo 2.11.6 writes a managed block into the root `AGENTS.md` whenever it detects an AI coding agent. `AGENTS.md` holds the curated shared rules, so the block is disabled. Turbo's version-matched documentation is bundled in `node_modules/turbo/docs/`.
- `build`: `dependsOn: ["^build"]`, `outputs: ["dist/**"]`
- `typecheck` and `lint`: `dependsOn: ["^build"]`, no outputs, so only logs are cached. Mobile needs the contracts declarations after MOBILE-001-B.
- `lint` also has `inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/eslint.config.mjs"]`, because contracts lint uses the root config, which lies outside the package. A later mobile lint task gets the same extra input; that only causes an occasional unnecessary cache miss.
- `dev`: `cache: false`, `persistent: true`
- No remote cache, no root (`//#`) tasks, and no `globalDependencies`. The root `package.json` and lockfile are always part of Turbo's global hash.

**Turbo behavior observed in MONO-001-E:**

- Without a terminal (assistant shells), Turbo falls back to streamed output.
- Turbo writes its local cache to `.turbo/cache/` at the root and task logs to `packages/contracts/.turbo/`. The `.turbo/` ignore rule covers both, and MEGAsync skips them as dot-entries.
- Failed tasks are not cached. Untracked, non-ignored files in a package count as inputs.
- Turbo collects anonymous telemetry unless disabled. Opt out per user with `turbo telemetry disable`, or per shell with `TURBO_TELEMETRY_DISABLED=1`. MONO-001-E set that variable only in its own commands; no global telemetry setting was changed. Whether to disable telemetry is the user's choice.

**Turbo 2.11.6 documentation facts:**

- Only `ui: "tui"` is interactive; the default `stream` is not.
- Persistent tasks are interactive by default. Press `i` to type into the selected task and `Ctrl+z` to stop.
- Tasks cannot depend on persistent tasks.
- `with` runs tasks alongside one another.
- `envMode` defaults to `strict`: task processes see only variables declared through `env`, `globalEnv`, or `passThroughEnv`, plus Turbo's defaults.

**Root `dev` (MOBILE-001-B):** `turbo run dev --filter=@ride-match/mobile`.

- Mobile `dev` is `expo start --dev-client`, with `dependsOn: ["^build"]` and `with: ["@ride-match/contracts#dev"]`.
- MOBILE-001-B verifies four things: Expo receives keys after `i`; `Ctrl+C` stops both processes; required Expo variables pass Turbo's strict env mode (declare them, do not guess); a contracts source change re-emits.
- **Documented alternative** if Turbo interaction fails: run `pnpm dev:mobile` in one terminal and `pnpm --filter @ride-match/contracts dev` in a second.

Native, export, doctor, and test wrappers run `pnpm build:contracts` first, then call `pnpm --filter @ride-match/mobile <script>` outside Turbo. This keeps native tools out of Turbo's strict env filtering (`JAVA_HOME`, `ANDROID_HOME`, `LANG`) and out of the terminal UI.

| Root script | Command | Task |
| --- | --- | --- |
| `build:contracts` | `turbo run build --filter=@ride-match/contracts` (C used a direct `pnpm --filter` call) | C, E |
| `typecheck` | `turbo run typecheck` (D used `pnpm -r run typecheck`) | D, E |
| `lint` | `turbo run lint` (D used `pnpm -r run lint`) | D, E |
| `dev` | `turbo run dev --filter=@ride-match/mobile` | MOBILE-B |
| `dev:mobile` | `pnpm build:contracts && pnpm --filter @ride-match/mobile start` | MOBILE-B |
| `doctor` | `pnpm --filter @ride-match/mobile doctor` (mobile: `expo-doctor`) | MOBILE-B |
| `export:android` / `export:ios` | `pnpm build:contracts && pnpm --filter @ride-match/mobile export:android` (mobile: `expo export --platform android`); iOS likewise | MOBILE-B |
| `mobile:android` / `mobile:ios` | `pnpm build:contracts && pnpm --filter @ride-match/mobile android` (mobile: `expo run:android`); iOS likewise with `expo run:ios` | MOBILE-B |
| `test:mobile` / `test` | See [Test configuration](#test-configuration-mobile-001-f) | MOBILE-F |

Mobile `start` and `dev` are both `expo start --dev-client`. Mobile `typecheck` is `tsc --noEmit -p tsconfig.json`.

## Commands by task

Run each from the repository root after `export NVM_DIR="$HOME/.nvm" && nvm use` unless noted. Each `pnpm --filter <pkg> add` needs that package's `package.json` to exist first.

```bash
# MONO-001-B (after writing package.json, pnpm-workspace.yaml, .nvmrc, .gitignore, README.md)
export NVM_DIR="$HOME/.nvm"
nvm use 24.17.0
corepack enable pnpm
corepack install
pnpm --version
pnpm add -w -D turbo@2.11.6 typescript@6.0.3 eslint@9.39.5 @eslint/js@9.39.5 typescript-eslint@8.71.0
pnpm install --frozen-lockfile

# MONO-001-C
pnpm --filter @ride-match/contracts add -D typescript@6.0.3
pnpm build:contracts
pnpm --filter @ride-match/contracts typecheck
node --input-type=module -e "await import('./packages/contracts/dist/index.js')"
pnpm --filter @ride-match/contracts exec tsc -p tsconfig.json --listFilesOnly | grep -v "^$(git rev-parse --show-toplevel)/"

# MONO-001-D
pnpm --filter @ride-match/contracts add -D eslint@9.39.5
pnpm typecheck
pnpm lint

# MONO-001-E (no installs; Turbo 2.11.6 is already a root dev dependency)
pnpm exec turbo run build typecheck lint dev --dry-run=json
pnpm build:contracts
pnpm typecheck
pnpm lint

# MOBILE-001-A
pnpm --filter @ride-match/mobile add expo@57.0.26 react@19.2.3 react-native@0.86.3 expo-router@57.0.24 react-native-safe-area-context@5.7.0 react-native-screens@4.26.2 expo-linking@57.0.11 expo-constants@57.0.20 expo-status-bar@57.0.1 expo-dev-client@57.0.19
pnpm --filter @ride-match/mobile add -D typescript@6.0.3 @types/react@19.2.18 eslint@9.39.5 eslint-config-expo@57.0.2
pnpm --filter @ride-match/mobile exec node -e "for (const p of ['react','react-native','expo','expo-router']) console.log(require.resolve(p))"
pnpm --filter @ride-match/mobile exec tsc -p tsconfig.json --listFilesOnly | grep -v "^$(git rev-parse --show-toplevel)/"

# MOBILE-001-B
pnpm --filter @ride-match/mobile add "@ride-match/contracts@workspace:*"
pnpm --filter @ride-match/mobile add -D expo-doctor@1.20.4

# MOBILE-001-F
pnpm --filter @ride-match/mobile add -D jest@29.7.0 jest-expo@57.0.5 @types/jest@29.5.14 @testing-library/react-native@14.0.1 test-renderer@1.3.0 @react-native/jest-preset@0.86.3
```

The remaining checks for each card are listed in [FIRST_STEPS.md](FIRST_STEPS.md). The file-list checks pass when they print nothing, because `grep` then exits 1. The `require.resolve` check passes when every printed path is inside the repository.

## Generated paths and ignore convention

- **Root `.gitignore` (MONO-001-B):** `node_modules/`, `.turbo/` (the root cache and per-package Turbo logs), `packages/*/dist/`, `*.tsbuildinfo`, `.env*.local`, and `.DS_Store`. Do not add IDE paths; `.idea/` stays untracked and visible.
- **`apps/mobile/.gitignore` (MOBILE-001-A):** taken from Expo SDK 57's default template, anchored to the mobile project:
  - `.expo/`, `dist/`, `web-build/`, `expo-env.d.ts`
  - `/android`, `/ios` (Continuous Native Generation; never hand-edit)
  - `.kotlin/`, `*.orig.*`, `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `*.pem`
  - `.metro-health-check*`, `.env*.local`, `*.tsbuildinfo`, `npm-debug.*`

  Omit the template's `example` entry.

### MEGAsync exclusions (user action)

The existing sync-root rules already exclude `node_modules`, every dot-entry (including `.git`, `.expo`, `.turbo`, `.gradle`, `.kotlin`, `.cxx`), symlinks, `ios/Pods`, `ios/build`, and `android/app/build`. The user adds exclusions for these repository paths:

| Path | Needed before |
| --- | --- |
| `packages/contracts/dist/` | MONO-001-C |
| `apps/mobile/dist/` | MOBILE-001-A exports |
| `apps/mobile/android/` | MOBILE-001-G |
| `apps/mobile/ios/` | MOBILE-001-H |
| `*.tsbuildinfo` | Only if a later task enables incremental builds |

Tasks do not wait on this, because assistants cannot see or verify sync settings, but they remind the user before creating each path. Because dot-entries such as `.git`, `.gitignore`, and `.nvmrc` are excluded from sync, the MEGA copy is not a usable checkout. Use Git for transfers.

## Ancestor guards

The user chose to keep the home-folder packages (decision 3), so the repository enforces these guards.

| Hazard | Guard | Check |
| --- | --- | --- |
| Corepack obeys the ancestor `yarn@4.18.0` declaration | Root `packageManager: "pnpm@11.28.2"` is written before the first pnpm command | B: `pnpm --version` prints 11.28.2 |
| TypeScript includes ancestor `@types` (`jest` and `mocha` conflict) | Explicit `types` in every tsconfig (the TS 6 default is also `[]`) | C and MOBILE-001-A: compiler file-list check prints nothing; rerun when tsconfig or dependencies change |
| Node, Jest, or Metro fall back to `/Users/home/node_modules` (`react` 18.2.0, `metro`, `@babel/core`) | Each package declares what it imports; pnpm isolated layout; no aliases | MOBILE-001-A, B, F: the `require.resolve` check stays inside the repo. Errors naming `/Users/home/node_modules` are resolution defects, not reasons for resolver overrides |
| Metro hierarchical lookup reaches parent folders | Expo's automatic monorepo config watches only the workspace root. Whether Metro would bundle a file from the home `node_modules` is unverified | MOBILE-001-B: exports succeed and the resolution check passes. No Metro overrides without a reproduced failure |
| `/Users/home/app.json` (`{"expo": {}}`) | Run Expo only from `apps/mobile` (`pnpm --filter @ride-match/mobile …` or `cd apps/mobile`), never from the repo root or home folder | Every Expo command |

## Native prerequisites

None of these blocks workspace tasks. Setting variables per command is not a machine change. Persisting them in a shell profile is the user's choice.

**Android (MOBILE-001-G).**

- **Requirements:** React Native 0.86.3 (`gradle/libs.versions.toml`): `compileSdk`/`targetSdk` 36, `minSdk` 24, build-tools 36.0.0, NDK 27.1.12297006, AGP 8.12.0. Expo SDK 57 supports Android 7+. React Native docs recommend Zulu JDK 17 and warn that higher JDKs may cause problems.
- **Local state:** everything required is installed, and nothing is missing. `ANDROID_HOME` and `JAVA_HOME` are unset, `java_home` defaults to 21, and Homebrew's adb comes before the SDK's adb on `PATH`.

Run:

```bash
ANDROID_HOME="$HOME/Library/Android/sdk" JAVA_HOME="$(/usr/libexec/java_home -v 17)" PATH="$HOME/Library/Android/sdk/platform-tools:$HOME/Library/Android/sdk/emulator:$PATH" pnpm mobile:android
```

**iOS (MOBILE-001-H).**

- **Requirements:** Expo SDK 57 needs iOS 16.4 or later and Xcode 26.4 or later.
- **Local state:** Xcode 26.6, the iOS 26.5 runtime, and CocoaPods 1.17.0 are installed, and nothing is missing. CocoaPods needs a UTF-8 locale.

Run:

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm mobile:ios
```

## Verify later

These are expectations recorded here, not checked results. The named task confirms or corrects each one and updates this file.

- **MONO-001-B:** verified on 2026-10-03; see the bootstrap result, the engines-guard correction, and the build-script table. The expected `[WARN] deprecated eslint@9.39.5` appeared on install.
- **MONO-001-C:** verified on 2026-10-03. `dist/index.js` and `dist/index.d.ts` match `exports`. The emitted ESM imports in Node by file path and by package name through `exports` (self-reference resolves to `dist/index.js`). The compiler file-list check prints nothing: the list contains only TypeScript 6.0.3's `lib.es5`–`lib.es2022`/decorator libraries inside the repo and `src/index.ts`. The contracts manifest also has `"version": "0.0.0"`, which is not in the snippet above.
- **MONO-001-E:** verified on 2026-10-03.
  - The dry-run graph lists only `@ride-match/contracts`; root scripts do not recurse; no task depends on `dev`.
  - After moving `dist/` out, `pnpm build:contracts` restored it from the local cache (`FULL TURBO`), identical to the backup.
  - Editing the root `eslint.config.mjs` changed the lint task hash.
  - The D type and `any` probes still fail through Turbo with exit codes 2 and 1.
  - In an interactive terminal, the `tui` interface and its key handling were not observed; MOBILE-001-B checks them with the persistent `dev` task.
- **MOBILE-001-A:**
  - Auto-installed peers raise no missing or invalid peer warnings, and `expo install --check` passes.
  - The `unrs-resolver: false` decision works with mobile lint.
  - `eslint-config-expo/flat` exposes the `@typescript-eslint` rule namespace.
  - Typecheck passes on a clean checkout with typed routes off, and exports leave `git status` clean.
- **MOBILE-001-B:**
  - Metro resolves the contracts `default` export without aliases.
  - `expo-doctor` as a dev dependency runs cleanly; the fallback is `pnpm dlx expo-doctor@1.20.4`, with the reason recorded.
  - Turbo's terminal UI passes Expo keys, interrupt stops both processes, and the env pass-through list is recorded.
- **MOBILE-001-F:** Jest loads contracts through `exports`; whether a `babel.config.js` is needed (if so, declare `babel-preset-expo` where the config resolves it); whether `"jest"` belongs in `types`; arguments reach Jest.
- **MOBILE-001-G/H:** native builds on the recorded emulator and simulator.

## Sources (checked 2026-10-03)

- **npm registry metadata:** `npm view` dist-tags, time, peerDependencies, engines, dependencies, scripts, and deprecation for every package above.
- **Expo:**
  - [Versions API](https://api.expo.dev/v2/versions/latest) (SDK 57 `relatedPackages`)
  - `bundledNativeModules.json` and `tsconfig.base.json` in `expo@57.0.26`, via jsDelivr
  - [SDK versions](https://docs.expo.dev/versions/latest/), [Monorepos](https://docs.expo.dev/guides/monorepos/), [Expo Router installation](https://docs.expo.dev/router/installation/), [Expo Router testing](https://docs.expo.dev/router/reference/testing/), [Unit testing](https://docs.expo.dev/develop/unit-testing/), and [TypeScript](https://docs.expo.dev/guides/typescript/) docs
  - The default template's `gitignore` on the `expo/expo` `sdk-57` branch
  - `@expo/cli` 57.0.27 build sources: the lint prerequisite and the `expo-env`/tsconfig type generation
- **Node.js:** [Release index](https://nodejs.org/dist/index.json) and the [Corepack API docs for line 24](https://nodejs.org/docs/latest-v24.x/api/corepack.html). The line-26 page returned 404.
- **Corepack:** the local Corepack 0.34.6 README and the pnpm definitions bundled in Corepack 0.34.6 and 0.35.0.
- **pnpm:** [pnpm v11 settings](https://github.com/pnpm/pnpm.io/tree/main/versioned_docs/version-11.x/settings) (build, peer dependencies, dependency resolution, CLI, other) and the [settings overview](https://pnpm.io/settings).
- **TypeScript:** [tsconfig reference](https://www.typescriptlang.org/tsconfig/#types) and [TypeScript 6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html).
- **Turborepo:** the configuration reference at the `v2.11.6` tag of `vercel/turborepo`, the [configuration docs](https://turborepo.dev/docs/reference/configuration), and the [developing-applications guide](https://turborepo.dev/docs/crafting-your-repository/developing-applications).
- **React Native:** the [environment setup guide](https://reactnative.dev/docs/set-up-your-environment?os=macos&platform=android), plus `react-native@0.86.3`'s `gradle/libs.versions.toml` and `src/types/globals.d.ts`.
- **Jest:** `jest-resolve@29.7.0` `build/shouldLoadAsEsm.js` and `jest-runtime@29.7.0` `build/index.js`.
