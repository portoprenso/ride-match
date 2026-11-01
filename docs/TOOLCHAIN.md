# Toolchain record

Recorded on 2026-10-03 by Claude Code (session toolchain-record) for MONO-001-A. Versions, compatibility evidence, and commands come from npm registry metadata, official documentation, and read-only local probes taken that day. This record installed, scaffolded, and reconfigured nothing.

From MONO-001-B onward, tasks use the versions, commands, and decisions recorded here. Changing any of them requires evidence and an update to this file. Every `pnpm` command below is **planned** until the task that introduces it completes. Items under [Verify later](#verify-later) are expectations, not verified results.

## Decisions at a glance

| Area | Decision |
| --- | --- |
| Node.js | 24.17.0 (Active LTS line 24 "Krypton"); `.nvmrc`, root `engines`, and `engineStrict` |
| Package manager | pnpm 11.28.2 through Corepack; root `packageManager: "pnpm@11.28.2"` |
| Mobile SDK | Expo SDK 57: `expo` 57.0.31 (57.0.26 until MOBILE-001-H; see its correction), React Native 0.86.3, React 19.2.3 |
| TypeScript | 6.0.3 in every package |
| Task runner | Turbo 2.11.6; root `turbo.json` with `agentGuidance: false` (MONO-001-E) |
| Lint | ESLint 9.39.5 (flat config); `typescript-eslint` 8.71.0 for contracts; `eslint-config-expo` 57.0.2 for mobile |
| Contracts | Zod 4.6.7 (the package's only runtime dependency); tests with Vitest 5.0.5 and its required Vite 8.3.5 peer (CONTRACT-001-A) |
| Mobile tests | Jest 29.7.0, `jest-expo` 57.0.6, React Native Testing Library 14.0.1 with `test-renderer` 1.2.0 (MOBILE-001-F; see the correction below) |
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
- **MOBILE-001-A:** `unrs-resolver` 1.12.2 arrives through `eslint-config-expo` → `eslint-import-resolver-typescript` 3.10.1. Its `postinstall` (`node postinstall.js`) calls `napi-postinstall`'s `checkAndPreparePackage`, which first `require.resolve`s the platform binding and only fetches one when it is missing. The strict install failed with `ERR_PNPM_IGNORED_BUILDS` as expected. pnpm had installed `@unrs/resolver-binding-darwin-arm64` 1.12.2, so the decision is `false`. Mobile lint then reported `import/no-unresolved` for a missing module, which shows the resolver binding works without the script.

| Package | Decision | Reason and verification | Task |
| --- | --- | --- | --- |
| *(none)* | | MONO-001-B: the root tree (110 packages) has no `preinstall`/`install`/`postinstall` scripts (scan of `node_modules/.pnpm`), and `pnpm install` passed under the strict default | MONO-001-B |
| `unrs-resolver` | `false` | The script only downloads a missing native binding; pnpm installs the platform's optional binding package. Mobile `import/no-unresolved` works without it. No other mobile package was blocked by the strict policy | MOBILE-001-A |
| *(none)* | | Zod, Vitest and Vite installed under the strict default with no ignored builds. Vite's native pieces (`rolldown`, `lightningcss`) come as optional platform packages, not install scripts | CONTRACT-001-A |

## Direct dependencies

All versions are exact. "Expo range" means `bundledNativeModules.json` in `expo@57.0.26` or the SDK 57 `relatedPackages` from the Expo versions API, as checked in MOBILE-001-A. Rows marked MOBILE-001-H were realigned to online `expo-doctor`'s expectations on 2026-10-30.

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
| `zod` | 4.6.7 | runtime | Runtime schemas and inferred types. `latest`, published 2026-10-12; ESM and CommonJS builds, so Node, Metro and Jest each pick a format through `exports` | CONTRACT-001-A |
| `vitest` | 5.0.5 | dev | Contracts `test` script. `latest`, published 2026-10-15; engines Node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` | CONTRACT-001-A |
| `vite` | 8.3.5 | dev | Required peer of `vitest` 5.0.5 (`^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0`), pinned so pnpm does not pick a version. `latest`, published 2026-10-21; engines Node `^20.19.0 \|\| >=22.12.0` | CONTRACT-001-A |

Zod is the only runtime dependency. Mobile receives it through the contracts package and does not declare it, because mobile code imports schemas from `@ride-match/contracts`, never from `zod`. Vitest's optional `@types/node` peer is not installed: its declarations need only `@types/chai` and `@types/deep-eql`, which it brings itself.

### Mobile (`@ride-match/mobile`)

| Package | Version | Kind | Purpose | Evidence | Added in |
| --- | --- | --- | --- | --- | --- |
| `expo` | 57.0.31 | runtime | SDK | `latest` and `sdk-57` tags; online doctor `~57.0.31` | MOBILE-001-A; realigned in MOBILE-001-H |
| `react` | 19.2.3 | runtime | UI runtime | Expo range | MOBILE-001-A |
| `react-native` | 0.86.3 | runtime | Native runtime | Expo range | MOBILE-001-A |
| `expo-router` | 57.0.29 | runtime | File routes | Expo `~57.0.29` | MOBILE-001-A; realigned in MOBILE-001-H |
| `react-native-safe-area-context` | 5.7.0 | runtime | Router peer; safe areas | Expo `~5.7.0` | MOBILE-001-A |
| `react-native-screens` | 4.26.2 | runtime | Router peer | Expo `~4.26.0` | MOBILE-001-A |
| `expo-linking` | 57.0.13 | runtime | Router peer | Expo `~57.0.13` | MOBILE-001-A; realigned in MOBILE-001-H |
| `expo-constants` | 57.0.22 | runtime | Router peer | Expo `~57.0.22` | MOBILE-001-A; realigned in MOBILE-001-H |
| `expo-font` | 57.0.4 | runtime | Config plugin that embeds the Manrope files in native builds | Expo `~57.0.4` | UI-001-A |
| `expo-status-bar` | 57.0.1 | runtime | Listed in Expo Router's install command | Expo `~57.0.1` | MOBILE-001-A |
| `expo-dev-client` | 57.0.20 | runtime | Development builds | Expo `~57.0.20` | MOBILE-001-A; realigned in MOBILE-001-H |
| `react-native-reanimated` | 4.5.1 | runtime | Required peer of `react-native-drawer-layout`, an `expo-router` dependency; pinned so pnpm does not pick a newer release | Expo `4.5.1`; peer `react-native` `0.83 - 0.86` | MOBILE-001-A |
| `react-native-gesture-handler` | 2.32.0 | runtime | Required peer of `react-native-drawer-layout`, an `expo-router` dependency; pinned so pnpm does not auto-install 3.x | Expo `~2.32.0` | TOOLCHAIN-001-A |
| `react-native-worklets` | 0.10.1 | runtime | Required peer of reanimated 4.5.1 (`0.10.x`); optional peer of `expo-modules-core` (`^0.7.4` … `^0.10.0`) | Expo `0.10.1` | MOBILE-001-A |
| `react-dom` | 19.2.3 | runtime | Required peer of `expo-router`'s web dependencies (`vaul`, Radix); must match `react` | Expo `19.2.3`; peer `react ^19.2.3` | MOBILE-001-A |
| `@ride-match/contracts` | `workspace:*` | runtime | Shared package | Fixed decision | MOBILE-001-B |
| `@tanstack/react-query` | 5.104.5 | runtime | Query cache for data-source reads (with `@tanstack/query-core` 5.104.5) | Pure JavaScript, not in Expo's `bundledNativeModules.json`; peers `react ^18 \|\| ^19`. Published 2026-10-19, the newest release at least two weeks old; 5.105.0 (2026-10-26) not selected yet | DATA-001-B |
| `typescript` | 6.0.3 | dev | Typecheck | Expo `~6.0.3` | MOBILE-001-A |
| `@types/react` | 19.2.18 | dev | React types | Expo `~19.2.4` | MOBILE-001-A |
| `eslint` | 9.39.5 | dev | Lint binary | Expo CLI 57 `^9.0.0` | MOBILE-001-A |
| `eslint-config-expo` | 57.0.2 | dev | Expo flat lint config | Expo `~57.0.2` | MOBILE-001-A |
| `@react-native/metro-config` | 0.86.3 | dev | Required peer of `react-native-worklets` (`*`); optional peer of `@react-native/community-cli-plugin` 0.86.3 (`0.86.3`) | Matches React Native 0.86.3 and Metro 0.84 | MOBILE-001-A |
| `expo-doctor` | 1.20.4 | dev | Pinned doctor | `latest`, published 2026-08-26 | MOBILE-001-B |
| `jest` | 29.7.0 | dev | Test runner | Expo `~29.7.0`; `jest-expo` depends on Jest 29 packages | MOBILE-001-F |
| `jest-expo` | 57.0.6 | dev | Expo Jest preset | Expo `~57.0.6` | MOBILE-001-F; realigned in MOBILE-001-H |
| `@types/jest` | 29.5.14 | dev | Jest types | Expo `29.5.14` | MOBILE-001-F |
| `@testing-library/react-native` | 14.0.1 | dev | Behavior tests | Expo Router testing requires 14 or newer | MOBILE-001-F |
| `test-renderer` | 1.2.0 | dev | Testing Library 14's required renderer peer (`^1.0.0`) | Peer `react ^19.0.0`; depends on `react-reconciler ~0.33.0`, whose 0.33.0 needs `react ^19.2.0` | MOBILE-001-F |
| `@react-native/jest-preset` | 0.86.3 | dev | Required peer of `jest-expo` 57 (`^0.86.3`) | Matches React Native 0.86.3 | MOBILE-001-F |
| `@babel/runtime` | 7.29.7 | dev | Imported by Babel helpers in Jest-transformed files (`babel-preset-expo` enables the runtime transform; Jest's non-Hermes profile emits helpers such as `asyncToGenerator`) | The version `expo` 57.0.26 (`^7.20.0`) already resolved in the lockfile | MOBILE-001-F |

**Correction from MOBILE-001-F (2026-10-03):**

- `test-renderer` 1.3.0 depends on `react-reconciler ~0.34.0`, and 0.34.0 requires `react ^19.3.0`, so `pnpm peers check` reported an unmet React peer against 19.2.3. `test-renderer` 1.2.0 (`react-reconciler ~0.33.0`, resolving to 0.33.0, peer `react ^19.2.0`) is the newest release that fits React 19.2.3 and is inside Testing Library 14's `^1.0.0` peer range. After a clean frozen install, the tree has one `test-renderer` and one `react-reconciler`, and `pnpm peers check` reports no issues.
- `@babel/runtime` was undeclared. Jest-transformed tests imported its helpers by walking up from `apps/mobile` and loaded them from `/Users/home/node_modules/@babel/runtime` (7.29.7). Declaring it keeps resolution in the repository; Metro exports contain no `@babel/runtime` source before or after.

**Required peers auto-installed, not listed directly:** `@expo/log-box` 57.0.4 and `@expo/metro-runtime` 57.0.16, both required by `expo-router`. They resolved at the Expo versions in MOBILE-001-A.

**Correction from MOBILE-001-A (2026-10-03):** pnpm auto-installs the *required* peers of transitive dependencies at the highest matching version. `expo-router` 57.0.24 depends on `react-native-drawer-layout` (required peer `react-native-reanimated >= 2.0.0`) and on `vaul` and Radix (required peer `react-dom`). With only the planned dependencies, pnpm chose versions that `pnpm peers check` reported as unmet:

- reanimated 4.7.0, which brought worklets 0.13.0, outside `expo-modules-core`'s `^0.7.4` … `^0.10.0`.
- `@react-native/metro-config` 0.87.1, which wanted 0.86.3 and pulled in a second Metro line, 0.87.1.
- `react-dom` 19.3.0, which needs `react ^19.3.0`.

The four rows marked MOBILE-001-A above that are not in the original plan pin these at Expo SDK 57's `bundledNativeModules.json` versions, or at React Native's version for `@react-native/metro-config`. They are declared, not overridden: no `overrides` and no `peerDependencyRules`. After a clean `pnpm install --frozen-lockfile`, `pnpm peers check` reports no issues, and the tree has one copy each of reanimated, worklets, `react-dom`, and `@react-native/metro-config`, with no Metro 0.87. Metro 0.84.5 and 0.84.6 both remain (Expo's and React Native's ranges); no failure has been reproduced, so they are left alone.

**Optional peers intentionally not installed:** `react-native-web` (no web target) and `react-server-dom-webpack`. `react-dom` and `react-native-reanimated` are installed only because transitive dependencies require them (see the correction above). The app does not import them. The Android export's source map contains neither; worklets is bundled because Expo's modules import it. No Babel or Metro config file is needed: the exports work with Expo defaults.

**Correction from MOBILE-001-H (2026-10-10 and 2026-10-30): Expo patch alignment.** Online `expo-doctor` compares the installed packages with Expo's current SDK 57 version list, so it starts failing whenever Expo publishes newer patches, even though nothing in the repository changed. Offline (`EXPO_OFFLINE=1`) it compares with the installed `expo`'s own list and passed 21/21 on 2026-10-30.
- **2026-10-10 (Codex):** online doctor reported 20/21. The user authorized updating `expo` 57.0.26 → 57.0.27, `expo-constants` → 57.0.21, `expo-linking` → 57.0.12, and `expo-router` → 57.0.25, after which doctor passed 21/21.
- **2026-10-30 (Claude Code):** Expo had published 57.0.28–57.0.31 between October 12 and 21, so online doctor reported 20/21 again, this time with six packages behind. The user authorized `expo` 57.0.31, `expo-constants` 57.0.22, `expo-dev-client` 57.0.20, `expo-linking` 57.0.13, `expo-router` 57.0.29, and `jest-expo` 57.0.6.
  - Results: online doctor passed 21/21, `pnpm peers check` reported no issues, and `expo install --check` said "Dependencies are up to date".
  - Lockfile changes are limited to Expo packages, `react-native-drawer-layout` 4.2.11 → 4.2.12 (an `expo-router` dependency), and a new transitive `xcode` 4.0.0 used by Expo's config plugins. `@expo/config-plugins` now appears at two patch versions (57.0.10 and 57.0.11), and doctor's duplicate check passes.
  - `react-native-gesture-handler` stays at 3.3.0 (TOOLCHAIN-001-A).
- Every native and checkpoint result in MOBILE-001-H was rerun after the last alignment.

**Correction from MOBILE-001-G (2026-10-03):** `react-native-gesture-handler` *is* installed, at **3.3.0**, and has been in the lockfile since MOBILE-001-A. It is optional for `expo-router`, but `react-native-drawer-layout` 4.2.11 (an `expo-router` dependency) declares it as a required peer (`>= 2.0.0`), so pnpm auto-installed the newest matching version. Expo SDK 57's `bundledNativeModules.json` expects `~2.32.0`. `pnpm peers check` and `expo-doctor` do not flag it, because the declared ranges are satisfied and it is not a direct dependency. The app imports none of its JavaScript (an Android export's source map has no gesture-handler or drawer-layout source), but Expo's autolinking finds it, so the native Android build compiles and links it (`libgesturehandler.so` is in the debug APK). The Android build, launch, and checked interactions worked with it. It was left unchanged, because pinning it (for example to `2.32.x`, like the four MOBILE-001-A pins) changes dependencies and the lockfile, which is outside MOBILE-001-G's scope. `@react-native-masked-view/masked-view` 0.3.2 is also autolinked; it is an `expo-router` dependency and matches Expo's version.

**Decision (TOOLCHAIN-001-A, 2026-10-30):** `react-native-gesture-handler` is pinned at **2.32.0** as a direct mobile dependency. That is Expo SDK 57's `~2.32.0`, the version `bundledNativeModules.json` in `expo` 57.0.31 still lists, and 2.32.0 is the only release in that range.
- **Why direct:** pnpm then resolves `react-native-drawer-layout`'s required peer from the app instead of auto-installing the newest 3.x, the same mechanism as the MOBILE-001-A pins. Doctor and `expo install --check` now validate the version too.
- **Why 2.x:** 3.x is a major line that Expo SDK 57 does not list. The app still imports no gesture-handler JavaScript, so there is no app code to migrate.
- **Lockfile:** `react-native-gesture-handler` 3.3.0 is removed. Added: 2.32.0 and its dependencies `@egjs/hammerjs` 2.0.17, `@types/hammerjs` 2.0.46, and `hoist-non-react-statics` 3.3.2. The mobile tsconfig's explicit `types` keeps `@types/hammerjs` out of the compilation.
- **Quick checks:**
  - `pnpm peers check`: no issues.
  - Online doctor: 21/21. `expo install --check`: up to date.
  - The app, `expo-router`, and `react-native-drawer-layout` all resolve 2.32.0 inside the repository.
  - `expo-modules-autolinking react-native-config` links 2.32.0 on Android and iOS.
- **Deferred at the user's request:** tests, exports, and both native rebuilds, which the card requires before it is `Completed`.

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
    "skipLibCheck": true,
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
- **`skipLibCheck: true` (CONTRACT-001-A):** Zod 4.6.7's internal URL helpers (`v4/core/schemas.d.cts`) name the global `URL`, which the runtime-neutral `es2022` lib does not declare, so typecheck failed with `TS2304: Cannot find name 'URL'` in Zod's declarations. Skipping library declaration checks fixes that without adding DOM or Node globals; the package's own `src` and `tests` are still fully checked. Mobile already gets the same setting from `expo/tsconfig.base`.
- **`tests/tsconfig.json` (CONTRACT-001-A):** extends this file with `rootDir: ".."`, `noEmit: true`, and `include: [".", "../src"]`. It lets `typecheck` cover the tests and gives typed ESLint a project for them (`projectService` uses the nearest `tsconfig.json`), while the build still emits only `src`.

Package scripts:

- `build`: `tsc -p tsconfig.json`
- `dev`: `tsc -p tsconfig.json --watch --preserveWatchOutput`
- `typecheck`: `tsc -p tsconfig.json --noEmit && tsc -p tests/tsconfig.json`
- `test`: `vitest run --dir tests` (CONTRACT-001-A)

### Mobile `tsconfig.json` (MOBILE-001-A)

```jsonc
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"]
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- `expo/tsconfig.base` (57.0.26) supplies `module: preserve`, `moduleResolution: bundler`, `customConditions: ["react-native"]`, `jsx: react-jsx`, `noEmit`, `allowJs`, `skipLibCheck`, and `lib: ["DOM", "ESNext"]`. Its `exclude` covers `node_modules`, `android`, `ios`, and Babel, Metro, and Jest config files. It sets no `types`.
- React Native 0.86.3 declares `__DEV__` in its own types (`src/types/globals.d.ts`), which load through `react-native` imports. No global types package is needed for the shell.
- **MOBILE-001-F outcome:** `types` is `["jest"]`. Testing Library 14 declares its matchers on the global `jest` namespace, which needs `@types/jest`. Expo Router's own matchers ship no type declarations, so tests compare `getPathname()` with ordinary matchers instead. Node types are not added; the compiler file list contains `@types/jest` from the repository and no `@types/node`.
- `app.config.ts` is type-checked with these settings and imports the `ExpoConfig` type from `expo/config`.

**Implemented in MOBILE-001-A** exactly as above. The compiler file-list check printed nothing outside the repo: 605 files, of which 4 are app sources and the rest are repository `node_modules` declarations, with `@types/react` as the only `@types` package.

**Typed routes are off for this batch:** omit `experiments.typedRoutes`. In MOBILE-001-A, `expo config` and both exports left `tsconfig.json` unchanged and created no `expo-env.d.ts`. `expo start` was not run in A.

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
- **Metro (Expo 57):** resolves package `exports`, and `default` matches whatever condition set Metro uses. Verified in MOBILE-001-B:
  - An unminified development export maps the bootstrap import to module `../../packages/contracts/dist/index.js`.
  - Production exports omit that empty module from their source maps.
  - With `dist/` removed, the mobile export fails with "While trying to resolve module `@ride-match/contracts` … specifies a `main` module field that could not be resolved", so there is no source fallback.
  - No aliases exist.
- **Jest 29.7.0 via `jest-expo`:** a CommonJS `require` matches `default`. Jest rejects a `.js` file from a `"type": "module"` package (`ERR_REQUIRE_ESM`) only when `vm.SyntheticModule` exists, meaning Node runs with `--experimental-vm-modules`. Evidence: `jest-resolve` 29.7.0 `build/shouldLoadAsEsm.js` and `jest-runtime` 29.7.0 `requireModule`. `jest-expo` does not use that flag, so babel-jest transforms the file. Its real path (`packages/contracts/dist/…`) has no `node_modules` segment, so Expo's `transformIgnorePatterns` does not skip it. MOBILE-001-F verifies this without aliases or mocks.

If a consumer fails, record the evidence and choose one format that all three load. Do not create a dual build.

## Lint configuration

- One ESLint version, 9.39.5, with flat config. ESLint 9 looks up the config from the working directory upward, and there is no ancestor config.
- **Root `eslint.config.mjs` (MONO-001-D):** `@eslint/js` recommended plus `typescript-eslint` `recommendedTypeChecked`, with `parserOptions.projectService: true`, for `packages/contracts/**/*.ts`. Set `@typescript-eslint/no-explicit-any` to `"error"` explicitly. Global ignores: `**/dist/**`, `**/node_modules/**`, and `apps/**`; mobile has its own config.
- **Contracts `lint`:** `eslint .`. It runs in `packages/contracts` and finds the root config.
- **Implemented in MONO-001-D (2026-10-03):** the root config uses `defineConfig` and `globalIgnores` from `eslint/config` (ignores `**/dist/`, `**/node_modules/`, `apps/`), with `tsconfigRootDir: import.meta.dirname`. `eslint --debug` from `packages/contracts` showed the root config file and base path loaded through ESLint 9's working-directory lookup ("LegacyConfigLoader"), with `src/index.ts` as the only linted file. Contracts' `eslint` resolves to the same `.pnpm` directory as the root's. MONO-001-D's root wrappers were `pnpm -r run typecheck` and `pnpm -r run lint` (root excluded from `-r`); MONO-001-E replaced them with `turbo run typecheck` and `turbo run lint`.
- **Negative probes (temporary files, removed):** a `string`-to-`number` assignment failed `pnpm typecheck` with TS2322 (exit 2). An explicit `any` parameter failed `pnpm lint` with `@typescript-eslint/no-explicit-any` (exit 1) while typecheck passed. An unawaited promise failed `pnpm lint` with `@typescript-eslint/no-floating-promises` (exit 1), which shows type-aware rules are active.
- **Mobile `eslint.config.js` (MOBILE-001-A, implemented):** CommonJS, following Expo CLI 57's template.
  - `require('eslint-config-expo/flat')` through `defineConfig` from `eslint/config`.
  - Ignores: `dist/*`, `.expo/*`, `android/*`, `ios/*`.
  - Then `{ files: ['**/*.ts', '**/*.tsx', '**/*.d.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } }`.
  - **Correction:** `eslint-config-expo/flat` 57.0.2 registers the `@typescript-eslint` plugin only for those file globs (`flat/utils/typescript.js`). Without `files`, ESLint failed with "could not find plugin "@typescript-eslint"" while linting `eslint.config.js`.
  - It lints `app.config.ts`, `app/_layout.tsx`, `app/index.tsx`, `src/features/map/MapPlaceholderScreen.tsx`, and `eslint.config.js`, using the mobile config with base path `apps/mobile`.
- **Mobile `lint`:** `eslint .`. Do not use `expo lint`, which can install packages.
- **Simulator import boundary (DATA-001-B):** `no-restricted-imports` with `regex` patterns. In `app/**` and `src/**`, except `src/bootstrap/**` and `src/data/mock/**`, a specifier matching `(^|/)data/mock(/|$)` fails. A second block for `src/data/**` (except `mock`) repeats it and adds `^(\.\.?/)+mock(/|$)`, because a relative path inside `src/data` reaches the simulator without naming `data/`; a later block replaces the rule's options, hence the repetition. Plain string matching works before `src/data/mock` exists (`import/no-restricted-paths` skips unresolved files). `tests/importBoundary.test.ts` lints controlled source texts through the ESLint Node API in the `node` Jest environment; it passes the config object with `overrideConfigFile: true`, since Jest cannot run ESLint's dynamic config import. `eslint-config-expo` sets no `no-restricted-imports` of its own.
- Type-aware rules for mobile are deferred.

## Test configuration (MOBILE-001-F)

- **`apps/mobile/jest.config.js`** (CommonJS; Expo's base tsconfig excludes it):
  - `preset: 'jest-expo'`
  - `testMatch` limited to `<rootDir>/tests/**/*.test.ts?(x)`
  - **Correction (MOBILE-001-F):** no `transformIgnorePatterns` override. `jest-expo` 57.0.5's preset already starts with `/node_modules/(?!(.pnpm|react-native|@react-native|…|expo|@expo|…))`, which transforms Expo and React Native packages inside the `.pnpm` store. It also excludes `react-native-reanimated/plugin/` and `@react-native/babel-preset/`, which the pattern planned here would have dropped.
  - `clearMocks: true` (UI-001-D). React Native's preset already mocks APIs such as `AccessibilityInfo` with shared `jest.fn`s. `jest.spyOn` returns that same mock, and `restoreAllMocks` does not reset it, so a spy saw calls from earlier tests.
  - `setupFiles: ['<rootDir>/tests/setup/publicEnvironment.ts']` (DATA-001-A), which sets the `EXPO_PUBLIC_` build variables; Jest loads no `.env`, and Expo's Babel preset does not inline them under Jest.
  - No `babel.config.js`: without one, `jest-expo` resolves `expo/internal/babel-preset` from `process.cwd()`, so Jest must run in `apps/mobile` (the `test` script does).
- Route tests use `renderRouter` from `expo-router/testing-library` against the real `app/` directory, through `tests/helpers/renderApp.ts`. Tests stay outside `app/`.
  - Testing Library 14's `render` is async. `renderRouter` attaches `getPathname()` and `getRouterState()` to the returned promise, so the helper awaits it and keeps those functions.
  - `renderRouter` enables Jest's modern fake timers, which also fake `queueMicrotask`. After Testing Library's automatic cleanup, each router test runs pending timers, runs fake microtasks (React's `act()` queues one), asserts `jest.getTimerCount()` is 0, and restores real timers.
  - Its built-in mocks cover only `expo-linking`'s URL helpers and Reanimated; navigation itself is not mocked.
- **Scripts:**
  - Mobile `test`: `jest`. No `--watchAll` and no `passWithNoTests`.
  - Root `test:mobile`: `pnpm build:contracts && pnpm --filter @ride-match/mobile test`. pnpm appends extra arguments to the end, so `--runTestsByPath tests/navigation.test.tsx` (relative to `apps/mobile`) reaches Jest.
  - Root `test`: `turbo run test`; `turbo.json` has `test` with `dependsOn: ["^build"]`, so contracts are built first. Since CONTRACT-001-A it runs the contracts and mobile tests.

## Contracts test configuration (CONTRACT-001-A)

- Vitest 5.0.5 runs `packages/contracts/tests/**/*.test.ts`. There is no Vitest config file: the `test` script passes `--dir tests`, and Vitest's defaults (Node environment, no globals) fit pure schemas.
- Tests import `describe`/`expect`/`it` from `vitest` and the contracts from `../src/index.js`, so they exercise the public entry without a build. Vite maps the `.js` specifier to the `.ts` source, as `nodenext` requires in the source.
- Root `test:contracts`: `pnpm --filter @ride-match/contracts test`. pnpm appends extra arguments, so `pnpm test:contracts errors` runs only files whose path contains `errors`.
- Vitest keeps its cache in `packages/contracts/node_modules/.vite/`, which is already ignored.

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

- Mobile `dev` is `expo start --dev-client`. Root `turbo.json` defines `@ride-match/mobile#dev` with `dependsOn: ["^build"]`, `with: ["@ride-match/contracts#dev"]`, `cache: false`, `persistent: true`, and a `passThroughEnv` list (MOBILE-001-B, implemented).
- **`passThroughEnv`, from evidence.** `@expo/cli` 57.0.27's `build/` reads `EXPO_*` settings (for example `EXPO_NO_TELEMETRY`, `EXPO_OFFLINE`), `ANDROID_HOME`/`ANDROID_SDK_ROOT` (opening Android with `a`), `REACT_NATIVE_PACKAGER_HOSTNAME`, `RCT_METRO_PORT`, `EDITOR`/`VISUAL` (open in editor), and `HTTP_PROXY`. `TMPDIR` is also passed: Metro's default cache is `os.tmpdir()/metro-cache`, and Turbo filtered `TMPDIR`, so `pnpm dev` would otherwise use `/tmp/metro-cache` while exports and native runs use the user's temp directory. Turbo's framework inference adds `EXPO_PUBLIC_*` automatically. Not passed: `NODE_ENV`/`BABEL_ENV` (would change bundling), web-only `BROWSER*`, and HTTPS certificate variables.
- **Observed environment of the Expo process** (`ps eww` while `pnpm dev` ran): `EXPO_NO_TELEMETRY`, `ANDROID_HOME`, and `TMPDIR` were present. `PATH`, `HOME`, `TERM`, and `TURBO_*` are Turbo built-ins. An undeclared test variable was filtered out. The contracts watcher received none of the mobile variables. `LANG` was unset in the probing shell, so its pass-through is untested; it matters only for CocoaPods, which runs outside Turbo.
- **Verified in MOBILE-001-B (pseudo-terminal driver, 2026-10-03):**
  - **Startup prepares contracts:** with contracts `dist/` removed, `pnpm dev` ran `contracts#build` first and recreated `dist/`, identical to before. Metro's `/status` then answered `packager-status:running`.
  - **The watcher emits:** a temporary `src/__probe_watch.ts` was emitted as `.js` and `.d.ts` within about a second, then removed together with its outputs.
  - **Expo receives keys under Turbo:** in the TUI (tasks `contracts#build`, `contracts#dev`, `mobile#dev`), `j` selected the mobile task, `i` started interaction, and `?` made Expo print its verbose-only lines ("shift+a │ select an Android device or emulator", "c │ show project QR").
  - **Interrupt stops everything:** `Ctrl+z`, then `Ctrl+C`, and also `Ctrl+C` alone, stopped Turbo, Expo, and `tsc --watch`; afterwards no process remained and port 8081 was free.
- **Documented alternative** if Turbo interaction fails: run `pnpm dev:mobile` in one terminal and `pnpm --filter @ride-match/contracts dev` in a second. `pnpm dev:mobile` was checked too: it built contracts, started Metro, and stopped on `Ctrl+C`.

Native and export wrappers run `pnpm build:contracts` first, then call `pnpm --filter @ride-match/mobile <script>` outside Turbo. This keeps native tools out of Turbo's strict env filtering (`JAVA_HOME`, `ANDROID_HOME`, `LANG`) and out of the terminal UI. The doctor wrapper does not build contracts, because `expo-doctor` does not load package output. The test wrappers are planned for MOBILE-001-F.

**`doctor:mobile`, not `doctor`:** pnpm 11.28.2 has a built-in `pnpm doctor` ("Run diagnostics on the pnpm installation and environment"). It shadows a root `doctor` script and exits 0 after checking only pnpm. `pnpm --filter <pkg> doctor` also runs the built-in. So the root script is `doctor:mobile`, and it calls the mobile script with an explicit `run`.

| Root script | Command | Task |
| --- | --- | --- |
| `build:contracts` | `turbo run build --filter=@ride-match/contracts` (C used a direct `pnpm --filter` call) | C, E |
| `typecheck` | `turbo run typecheck` (D used `pnpm -r run typecheck`) | D, E |
| `lint` | `turbo run lint` (D used `pnpm -r run lint`) | D, E |
| `dev` | `turbo run dev --filter=@ride-match/mobile` | MOBILE-B |
| `dev:mobile` | `pnpm build:contracts && pnpm --filter @ride-match/mobile start` | MOBILE-B |
| `doctor:mobile` | `pnpm --filter @ride-match/mobile run doctor` (mobile: `expo-doctor`). Not `doctor`; see above | MOBILE-B |
| `export:android` / `export:ios` | `pnpm build:contracts && pnpm --filter @ride-match/mobile export:android` (mobile: `expo export --platform android`); iOS likewise | MOBILE-B |
| `mobile:android` / `mobile:ios` | `pnpm build:contracts && pnpm --filter @ride-match/mobile android` (mobile: `expo run:android`); iOS likewise with `expo run:ios` | MOBILE-B |
| `test:mobile` / `test` | See [Test configuration](#test-configuration-mobile-001-f) | MOBILE-F |
| `test:contracts` | `pnpm --filter @ride-match/contracts test` (contracts: `vitest run --dir tests`). No build first: tests import the source. See [Contracts test configuration](#contracts-test-configuration-contract-001-a) | CONTRACT-001-A |

Mobile `start` and `dev` are both `expo start --dev-client`. Mobile `typecheck` is `tsc --noEmit -p tsconfig.json`.

**Expo CLI notes (MOBILE-001-A):**

- Run Expo from `apps/mobile`. There, `expo config --type public` showed this project's `app.config.ts` values (`Ride Match`, `ride-match`, `com.ridematch.dev`, SDK 57.0.0), not the ancestor `/Users/home/app.json`. `version` defaults to the manifest's `0.0.0`.
- `platforms` defaults to `ios`, `android`, and `web`. There is no web target, so always pass `--platform` to `expo export`.
- Expo CLI sends anonymous telemetry unless `EXPO_NO_TELEMETRY=1` is set. Assistant commands set it, and `CI=1` for non-interactive runs, only in their own environment. Whether to disable telemetry globally is the user's choice.
- Exports print "Expo Autolinking module resolution enabled" and write `apps/mobile/dist/` (ignored). Expo also creates `apps/mobile/.expo/` (ignored; a dot-entry that MEGAsync skips).
- **Status bar (MOBILE-001-G):** `app.config.ts` lists `['expo-status-bar', { style: 'dark' }]` in `plugins`. Prebuild then sets `android:windowLightStatusBar` to `true` in the Android theme and `UIStatusBarStyle` to `UIStatusBarStyleDarkContent` on iOS (with Expo's default `UIUserInterfaceStyle` `Light`). The older `androidStatusBar` field is deprecated in SDK 57 and prebuild ignores it.

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
# Peer pins added after the first install (see the correction under Mobile dependencies)
pnpm --filter @ride-match/mobile add react-native-reanimated@4.5.1 react-native-worklets@0.10.1 react-dom@19.2.3
pnpm --filter @ride-match/mobile add -D @react-native/metro-config@0.86.3
pnpm peers check
pnpm --filter @ride-match/mobile exec node -e "for (const p of ['react','react-native','expo','expo-router']) console.log(require.resolve(p))"
pnpm --filter @ride-match/mobile exec tsc -p tsconfig.json --listFilesOnly | grep -v "^$(git rev-parse --show-toplevel)/"

# MOBILE-001-B
pnpm --filter @ride-match/mobile add "@ride-match/contracts@workspace:*"
pnpm --filter @ride-match/mobile add -D expo-doctor@1.20.4
pnpm exec turbo run dev --filter=@ride-match/mobile --dry-run=json
pnpm doctor:mobile
pnpm export:android
pnpm export:ios
pnpm dev   # interactive; stop with Ctrl+C

# MOBILE-001-F
pnpm --filter @ride-match/mobile add -D jest@29.7.0 jest-expo@57.0.5 @types/jest@29.5.14 @testing-library/react-native@14.0.1 test-renderer@1.2.0 @react-native/jest-preset@0.86.3 @babel/runtime@7.29.7
pnpm test:mobile
pnpm test:mobile --runTestsByPath tests/navigation.test.tsx
pnpm test

# MOBILE-001-H (Expo patch alignment authorized by the user; the 2026-10-10 step was superseded on 2026-10-30)
pnpm --filter @ride-match/mobile add --save-exact expo@57.0.31 expo-constants@57.0.22 expo-dev-client@57.0.20 expo-linking@57.0.13 expo-router@57.0.29
pnpm --filter @ride-match/mobile add --save-exact -D jest-expo@57.0.6
pnpm peers check
pnpm doctor:mobile

# TOOLCHAIN-001-A
pnpm --filter @ride-match/mobile add --save-exact react-native-gesture-handler@2.32.0
pnpm peers check
pnpm doctor:mobile

# UI-001-A (font files: see "App fonts" below)
pnpm --filter @ride-match/mobile add --save-exact expo-font@57.0.4
pnpm doctor:mobile

# CONTRACT-001-A
pnpm --filter @ride-match/contracts add zod@4.6.7
pnpm --filter @ride-match/contracts add -D vitest@5.0.5 vite@8.3.5
pnpm test:contracts
pnpm --filter @ride-match/contracts typecheck
pnpm --filter @ride-match/contracts lint
pnpm --filter @ride-match/contracts exec tsc -p tsconfig.json --listFilesOnly | grep -v "^$(git rev-parse --show-toplevel)/"
pnpm --filter @ride-match/contracts exec tsc -p tests/tsconfig.json --listFilesOnly | grep -v "^$(git rev-parse --show-toplevel)/"
pnpm build:contracts
pnpm --filter @ride-match/mobile typecheck
```

### App fonts (UI-001-A)

- **Source:** static Manrope 400, 500, 600, 700, and 800 from the npm package `@expo-google-fonts/manrope` 0.4.3 (`npm pack`; tarball SHA-256 `9e9f425e5f7cae303296c7d5078abeb8adef56e69cbb7fbc660acb6acae00906`).
- **Files:** copied into `apps/mobile/assets/fonts/` as `Manrope-Regular.ttf`, `Manrope-Medium.ttf`, `Manrope-SemiBold.ttf`, `Manrope-Bold.ttf`, and `Manrope-ExtraBold.ttf`, with the package's SIL Open Font License 1.1 text as `OFL.txt`. The package itself is not a dependency.
- **Verified on the files:** each is static (no `fvar` table) with OS/2 weight classes 400–800. The PostScript names (`name` ID 6) match the new file names.
- **Embedding:** the `expo-font` config plugin in `app.config.ts` embeds the files at prebuild, so there is no runtime loading and no fallback-font flash.
- **Font names:** iOS matches `fontFamily` against the PostScript name and Android against the file name, so one name per face works on both. `src/ui/tokens.ts` (`MANROPE`) uses those names.
- **Weights:** text never sets `fontWeight`, which could synthesize a weight.
- **Older builds:** a development build made before UI-001-A lacks the faces. React Native 0.86 then falls back to the system font, and iOS only logs "Unrecognized font family" at info level. Rebuild the development clients to see Manrope.
- **Along mark:** `apps/mobile/assets/brand/along-mark.svg` reproduces the design kit's "Brand / Along symbol" (an ink rounded square with the lime merging-path stroke). `along-mark.png`, `@2x`, and `@3x` (72, 144, and 216 px, transparent outside the square) were rendered with `rsvg-convert`, because React Native cannot draw SVG without another dependency. Nothing displays the mark yet.

The remaining checks for each card are listed in [FIRST_STEPS.md](FIRST_STEPS.md). The file-list checks pass when they print nothing, because `grep` then exits 1. The `require.resolve` check passes when every printed path is inside the repository.

## Generated paths and ignore convention

- **Root `.gitignore` (MONO-001-B):** `node_modules/`, `.turbo/` (the root cache and per-package Turbo logs), `packages/*/dist/`, `*.tsbuildinfo`, `.env*.local`, and `.DS_Store`. Do not add IDE paths; `.idea/` stays untracked and visible.
- **`apps/mobile/.gitignore` (MOBILE-001-A):** taken from Expo SDK 57's default template, anchored to the mobile project:
  - `.expo/`, `dist/`, `web-build/`, `expo-env.d.ts`
  - `/android`, `/ios` (Continuous Native Generation; never hand-edit)
  - `.kotlin/`, `*.orig.*`, `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `*.pem`
  - `.metro-health-check*`, `.env*.local`, `*.tsbuildinfo`, `npm-debug.*`

  Omit the template's `example` entry. Implemented in MOBILE-001-A with these entries only, grouped under comments.

### MEGAsync exclusions (user action)

The existing sync-root rules already exclude `node_modules`, every dot-entry (including `.git`, `.expo`, `.turbo`, `.gradle`, `.kotlin`, `.cxx`), symlinks, `ios/Pods`, `ios/build`, and `android/app/build`. The user adds exclusions for these repository paths:

| Path | Needed before |
| --- | --- |
| `packages/contracts/dist/` | MONO-001-C |
| `apps/mobile/dist/` | MOBILE-001-A exports (A created it for its checks, then removed it; B's exports recreate it) |
| `apps/mobile/android/` | MOBILE-001-G. Generated there on 2026-10-03: 1.3 GB, almost all already excluded by the rules above (`app/build` 1.1 GB, `.cxx` 142 MB, `.gradle`). Only 38 files (about 624 KB: generated sources, the Gradle wrapper, the template's debug keystore, and `android/build`) fall outside them |
| `apps/mobile/ios/` | MOBILE-001-H. Generated there on 2026-10-30; the existing rules already skip `ios/Pods` and `ios/build` |
| `*.tsbuildinfo` | Only if a later task enables incremental builds |

Tasks do not wait on this, because assistants cannot see or verify sync settings, but they remind the user before creating each path. Because dot-entries such as `.git`, `.gitignore`, and `.nvmrc` are excluded from sync, the MEGA copy is not a usable checkout. Use Git for transfers.

## Ancestor guards

The user chose to keep the home-folder packages (decision 3), so the repository enforces these guards.

| Hazard | Guard | Check |
| --- | --- | --- |
| Corepack obeys the ancestor `yarn@4.18.0` declaration | Root `packageManager: "pnpm@11.28.2"` is written before the first pnpm command | B: `pnpm --version` prints 11.28.2 |
| TypeScript includes ancestor `@types` (`jest` and `mocha` conflict) | Explicit `types` in every tsconfig (the TS 6 default is also `[]`) | C and MOBILE-001-A: compiler file-list check prints nothing; rerun when tsconfig or dependencies change. CONTRACT-001-A: nothing for both contracts projects (`tsconfig.json` and `tests/tsconfig.json`) |
| Node, Jest, or Metro fall back to `/Users/home/node_modules` (`react` 18.2.0, `metro`, `@babel/core`) | Each package declares what it imports; pnpm isolated layout; no aliases | MOBILE-001-A, B, F: the `require.resolve` check stays inside the repo. Errors naming `/Users/home/node_modules` are resolution defects, not reasons for resolver overrides. A: passed for `react`, `react-native`, `expo`, `expo-router`, reanimated, worklets, and `react-dom`. F: Jest loaded `@babel/runtime` from there until it was declared; afterwards a logging resolver over the whole suite found no resolution outside the repository |
| Metro hierarchical lookup reaches parent folders | Expo's automatic monorepo config watches only the workspace root. Whether Metro would bundle a file from the home `node_modules` is unverified | MOBILE-001-B: exports succeed and the resolution check passes. No Metro overrides without a reproduced failure. A: all 1,230 sources in an Android export's source map were under the repository root, and none came from `/Users/home/node_modules` |
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

- **Result (MOBILE-001-G):** the command worked as written, with the `Pixel_9_Pro_XL` emulator (Android 16, API 36, arm64-v8a) already booted, using the SDK's adb 36.0.2 and Zulu 17. Expo generated `apps/mobile/android/` (Gradle 9.3.1 wrapper, `newArchEnabled=true`, `hermesEnabled=true`, `edgeToEdgeEnabled=true`), built a debug APK whose native libraries are arm64-v8a only (the emulator's ABI), installed it, started Metro, and opened the app. The first build took 1 m 31 s with existing `~/.gradle` caches; a rebuild after deleting `android/` took 25 s. With `CI=1`, Metro runs in CI mode, without reloads. Stop it with `Ctrl+C` (or `SIGINT` to the `expo run:android` process). Afterwards, run `./gradlew --stop` in `apps/mobile/android` so no Gradle daemon is left running.
- **Development-build behavior:** opening the app from its icon, or through a `ride-match://` link, while no bundle is loaded shows the development-client launcher with a "Recently opened" server. Choosing it loads the app, and a pending link is delivered after loading. The first launch after installation also shows the developer-menu introduction once.

**Native UI checks (VERIFY-001, 2026-10-31).**

- **Emulator storage:** the `Pixel_9_Pro_XL` image had about 440 MB free, and `adb install -r` of the 88 MB debug APK failed with `INSTALL_FAILED_INSUFFICIENT_STORAGE`. Uninstalling the old `com.ridematch.dev` and installing with `adb install -r -d` worked; Metro was then started with `pnpm --filter @ride-match/mobile start`, and the app opened through `ride-match://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` after `adb reverse tcp:8081 tcp:8081`.
- **Android on-screen keyboard:** with the AVD's `hw.keyboard=yes`, Gboard shows only a floating toolbar or a floating keyboard, which does not resize the app. For keyboard-avoidance checks, set `hw.keyboard=no` in the AVD's `config.ini`, cold-boot (`-no-snapshot-load`), and turn off stylus handwriting (`adb shell settings put secure stylus_handwriting_enabled 0`). Restore both afterwards (`settings delete secure stylus_handwriting_enabled`).
- **Android keyboard type:** `adb shell dumpsys input_method` shows the focused editor's `inputType` (`0x3` phone, `0x2` number, `0x80001` text without suggestions) and `imeOptions` (`3` = search).
- **Enlarged text:** Android uses `adb shell settings put system font_scale 1.5` (or `2.0`), which restarts the activity; restore `1.0`. iOS uses `xcrun simctl ui <device> content_size extra-extra-extra-large`, restoring `large`. React Native on iOS does not re-lay out text after a size change while the app runs, so relaunch the app before judging layout.
- **Screen readers:** TalkBack is installed on the emulator, but its double-tap activation could not be driven reliably through `adb shell input`. The iOS Simulator has no VoiceOver. Focus return and announcements need a real device or a person driving the screen reader.
- **Simulator input:** a zero-length simulated tap did not trigger React Native presses on iOS 26.5; a 0.15-second press did. Momentum scrolling moves targets, so scroll with slow drags before tapping.

**iOS (MOBILE-001-H).**

- **Requirements:** Expo SDK 57 needs iOS 16.4 or later and Xcode 26.4 or later.
- **Local state:** Xcode 26.6, the iOS 26.5 runtime, and CocoaPods 1.17.0 are installed, and nothing is missing. CocoaPods needs a UTF-8 locale.

Run:

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm mobile:ios
```

- **Result (MOBILE-001-H, final on 2026-10-30):** the command above worked as written with the iPhone 17 Pro simulator (iOS 26.5, Xcode 26.6) already booted.
  - **Build:** Expo generated `apps/mobile/ios/`, and CocoaPods installed 105 pods. Xcode reported "Build Succeeded" with 0 errors and two warnings: duplicate `-lc++` libraries, and the dev launcher's "Strip Local Network Keys for Release" script phase having ambiguous dependencies.
  - **Install and launch:** the app installed and opened through the development client.
  - **Changes:** no handwritten native patch.
  - **Info.plist:** `UIStatusBarStyleDarkContent`, `UIUserInterfaceStyle` `Light`, minimum iOS 16.4. The only usage description is the development launcher's `NSLocalNetworkUsageDescription`, which its build phase strips from release builds.
- **Development-build behavior on iOS:**
  - **Cold launch from the app:** `xcrun simctl launch` reopens the recent development server directly.
  - **Cold launch through a link:** a `ride-match://` link shows the server list first. After the server is chosen, the pending link is delivered.
  - **First install:** the developer-menu introduction appears once.
- **Safe-area correction:** see [Mobile `Screen` safe areas](#mobile-screen-safe-areas-mobile-001-h).

### Mobile `Screen` safe areas (MOBILE-001-H)

`src/ui/Screen.tsx` pads each requested edge by 24 points plus the `SafeAreaProvider`'s inset, read with `useSafeAreaInsets()`. Until MOBILE-001-H it was a native `SafeAreaView`.

- **The problem:** that view measures its own position in the window. When the iOS sign-in sheet first opened, it measured while the sheet was still sliding in. The first screen in the sheet then had no bottom inset: its buttons ended 24 points above the screen edge instead of 58. This happened on every fresh presentation, from Sign in, a warm link, or a cold link. It corrected only after a push and pop inside the sheet.
- **The fix:** provider insets belong to the window and don't depend on that animation. The sheet reaches the bottom of the screen, so the window's bottom inset is the right one, and callers still omit the top edge inside the iOS sheet.
- **Verified:** after the change, every iOS presentation measured 58 points. Android bounds are unchanged from MOBILE-001-G. Two Jest tests in `tests/ui.test.tsx` cover the padding.

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
- **MOBILE-001-A:** verified on 2026-10-03, with two corrections.
  - **Corrected:** auto-installed peers were invalid until four Expo-version pins were added. With the pins, `pnpm peers check` reports no issues and `expo install --check` prints "Dependencies are up to date".
  - **Confirmed:** the `unrs-resolver: false` decision works with mobile lint.
  - **Corrected:** `eslint-config-expo/flat` exposes the `@typescript-eslint` rules only for TypeScript files, so the extra rule block needs `files`.
  - **Confirmed:** typecheck passes with typed routes off, and exports leave `git status` showing only authored files.
- **MOBILE-001-B:** verified on 2026-10-03.
  - Metro resolves the contracts `default` export without aliases; see [Contracts module format](#contracts-module-format).
  - `expo-doctor` 1.20.4 as a dev dependency printed "21/21 checks passed. No issues detected!", so the `dlx` fallback is unused.
  - Turbo's terminal UI passes Expo keys, interrupt stops both processes, and the pass-through list is recorded above.
  - Correction: the root script is `doctor:mobile`, because of pnpm's built-in `doctor`.
- **MOBILE-001-F:** verified on 2026-10-03.
  - Jest resolves `@ride-match/contracts` to `packages/contracts/dist/index.js` (a logging wrapper around React Native's Jest resolver); with `dist/` removed, the suite fails with "Cannot find module '@ride-match/contracts' from 'src/bootstrap/checkContractsPackage.ts'". No alias or mock.
  - No `babel.config.js` is needed; `"jest"` belongs in `types` (see above); `pnpm test:mobile --runTestsByPath tests/navigation.test.tsx` runs `jest --runTestsByPath tests/navigation.test.tsx`.
  - **Corrected:** `test-renderer` 1.2.0 instead of 1.3.0, `@babel/runtime` declared, and no `transformIgnorePatterns` override.
- **MOBILE-001-G:** verified on 2026-10-03; see the Android result above and the gesture-handler correction. One app-config fix: the `expo-status-bar` plugin with `style: 'dark'`, because Android's edge-to-edge status bar otherwise kept white icons on the white screens.
- **MOBILE-001-H:** verified on 2026-10-30. See the iOS result, the patch-alignment correction, and the `Screen` safe-area section above. The Android checks were rerun on the final files.
- **TOOLCHAIN-001-A:** the gesture-handler pin passed the quick dependency checks on 2026-10-30, and VERIFY-001 (2026-10-31) confirmed the rest: tests, both exports, online doctor (21/21), and clean Android and iOS rebuilds. `RNGestureHandler` 2.32.0 is in the generated Podfile's linked modules and the Android build.
- **CONTRACT-001-A:** on 2026-10-31, contracts tests (61), typecheck, lint, build, the file-list checks, a frozen install, mobile typecheck, and a Node import of `@ride-match/contracts` from `apps/mobile` (all 11 exports, Zod loaded) passed. VERIFY-001 then confirmed the app side: the mobile Jest suite loads Zod through the package, both exports bundle it (the iOS Hermes bytecode contains the contracts' and Zod's strings), and both development builds start with it under Hermes.
- **DATA-001-B:** on 2026-11-01, `pnpm --filter @ride-match/mobile add --save-exact @tanstack/react-query@5.104.5` added two lockfile packages; a frozen install, online doctor (21/21), the mobile suite (105), typecheck and lint passed. Doctor's output also showed Expo's env loader reading `apps/mobile/.env` and exporting the three `EXPO_PUBLIC_` variables. Query clients in tests set `gcTime: Infinity`: the default five-minute garbage-collection timer otherwise kept Jest from exiting.
- **UI-001-A:** typecheck, lint, doctor (21/21), and the resolved config (both plugins) passed on 2026-10-30. VERIFY-001 (2026-10-31) rebuilt both development clients: each Manrope weight renders distinctly, there is no startup font error, and nothing clips on iOS at the default and XXXL text sizes. **Open:** on Android, line heights grow less than font sizes under the system's nonlinear font scaling. At 150% the `section` style (24/30) cuts off descenders on its last line; at 200% a `section` line is 38 dp, and `heading` and `subheading` are tight too.

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
