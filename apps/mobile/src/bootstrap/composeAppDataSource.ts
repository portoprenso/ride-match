import type { QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { AppConfigError, readAppConfig, type AppConfig } from '../config/appConfig';
import type { AppDataSource } from '../data/AppDataSource';
import { createDataSource, type DataSourceFactories } from '../data/createDataSource';
import { createSyncCoordinator, type SyncCoordinator } from '../data/createSyncCoordinator';
import { DataSourceUnavailableError } from '../data/errors';
import type { DevControls } from '../data/DevControls';
import { createSessionController, type SessionController } from '../features/auth/createSessionController';
import { sessionViewerSource } from '../features/auth/sessionViewer';
import type { AppStateSource } from '../platform/appState';
import { createMockDataSource, createMockSimulator } from '../data/mock/createMockDataSource';
import { createMockDevControls } from '../data/mock/createMockDevControls';
import { isMockScenarioKey, MOCK_SCENARIO_KEYS } from '../data/mock/scenarios';
import { createSecureCredentialStore, type CredentialStore } from '../platform/secureStorage/credentialStore';
import { createQueryClient } from './createQueryClient';

/**
 * The data source the app runs on, the auth session that supplies its access token, the Query
 * cache and the sync coordinator that keeps it true to the session and the connection, and the
 * release of what they hold, or why this build's configuration cannot run.
 */
export type AppComposition =
  | {
      status: 'ready';
      dataSource: AppDataSource;
      session: SessionController;
      queryClient: QueryClient;
      sync: SyncCoordinator;
      dispose: () => void;
      devControls: DevControls | null;
    }
  | { status: 'failed'; error: AppConfigError | DataSourceUnavailableError };

const factories: DataSourceFactories = {
  mock({ scenario, devControls, accessToken }) {
    // The configuration checks only the key's format; the simulator knows which scenarios exist.
    if (!isMockScenarioKey(scenario)) {
      throw new AppConfigError([
        `EXPO_PUBLIC_MOCK_SCENARIO is ${JSON.stringify(scenario)}; use one of ${MOCK_SCENARIO_KEYS.join(', ')}.`,
      ]);
    }
    const simulator = createMockSimulator(scenario);
    return {
      dataSource: createMockDataSource(simulator, { accessToken }),
      dispose: () => simulator.dispose(),
      devControls: devControls ? createMockDevControls(simulator, scenario) : null,
    };
  },
};

/**
 * Starting a demo scenario signs everyone out of the simulator and ends every subscription, so
 * the demo controls then forget the app's session (otherwise the app would keep sending
 * credentials of a world that no longer exists) and subscribe again into the new world.
 */
function resetOnScenarioStart(controls: DevControls, session: SessionController, sync: SyncCoordinator): DevControls {
  const afterStart = () => {
    void session.discard();
    sync.resetWorld();
  };
  return {
    ...controls,
    selectScenario(key) {
      controls.selectScenario(key);
      afterStart();
    },
    reset() {
      controls.reset();
      afterStart();
    },
  };
}

export type CompositionOptions = {
  /** Reads the configuration; tests pass their own. */
  readConfig?: () => AppConfig;
  /** The refresh-token store; the SecureStore one for the data source's namespace unless a test passes its own. */
  credentialStore?: CredentialStore;
  /** Foreground and background; React Native's `AppState` unless a test passes its own. */
  appState?: AppStateSource;
};

/**
 * The composition root: reads the build configuration and builds the one data source and the
 * auth session, once per app launch. The mock data source starts its scenario at once, timed
 * events included. The session starts when the root layout calls `restore()`; on the mock data
 * source it never resumes a stored session, because the simulator's world starts empty. The sync
 * coordinator starts when the root layout calls `sync.start()`.
 *
 * Demo controls exist only in development and preview builds on the mock data source; a
 * production build never creates them, so nothing in it can reach the simulator's controls.
 *
 * An invalid configuration, an unknown scenario or the unavailable API data source becomes a
 * `failed` composition, which the root layout shows instead of the app; any other error is a bug
 * and is rethrown. A `ready` composition must be disposed when the app's root unmounts.
 */
export function composeAppDataSource({
  readConfig = readAppConfig,
  credentialStore,
  appState = AppState,
}: CompositionOptions = {}): AppComposition {
  try {
    const config = readConfig();
    // The data source reads the token through this indirection, because the session that holds
    // it needs the data source's auth operations and is built just after it.
    let session: SessionController | null = null;
    const composed = createDataSource(config.dataSource, factories, {
      devControls: config.appEnv !== 'production',
      accessToken: () => session?.getAccessToken() ?? null,
    });
    const built = createSessionController({
      auth: composed.dataSource.auth,
      store: credentialStore ?? createSecureCredentialStore(config.dataSource.kind),
      resumeStoredSession: config.dataSource.kind !== 'mock',
    });
    session = built;
    const queryClient = createQueryClient();
    const sync = createSyncCoordinator({
      queryClient,
      events: composed.dataSource.events,
      viewer: sessionViewerSource(built),
      appState,
    });
    return {
      status: 'ready',
      dataSource: composed.dataSource,
      session: built,
      queryClient,
      sync,
      devControls: composed.devControls && resetOnScenarioStart(composed.devControls, built, sync),
      dispose: () => {
        sync.dispose();
        queryClient.clear();
        built.dispose();
        composed.dispose();
      },
    };
  } catch (error) {
    if (error instanceof AppConfigError || error instanceof DataSourceUnavailableError) {
      return { status: 'failed', error };
    }
    throw error;
  }
}
