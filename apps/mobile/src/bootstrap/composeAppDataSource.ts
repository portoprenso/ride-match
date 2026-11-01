import { AppConfigError, readAppConfig, type AppConfig } from '../config/appConfig';
import type { AppDataSource } from '../data/AppDataSource';
import { createDataSource, type DataSourceFactories } from '../data/createDataSource';
import { DataSourceUnavailableError } from '../data/errors';
import type { DevControls } from '../data/DevControls';
import { createMockDataSource, createMockSimulator } from '../data/mock/createMockDataSource';
import { createMockDevControls } from '../data/mock/createMockDevControls';
import { isMockScenarioKey, MOCK_SCENARIO_KEYS } from '../data/mock/scenarios';

/**
 * The data source the app runs on and the release of what it holds, or why this build's
 * configuration cannot run.
 */
export type AppComposition =
  | { status: 'ready'; dataSource: AppDataSource; dispose: () => void; devControls: DevControls | null }
  | { status: 'failed'; error: AppConfigError | DataSourceUnavailableError };

const factories: DataSourceFactories = {
  mock({ scenario, devControls }) {
    // The configuration checks only the key's format; the simulator knows which scenarios exist.
    if (!isMockScenarioKey(scenario)) {
      throw new AppConfigError([
        `EXPO_PUBLIC_MOCK_SCENARIO is ${JSON.stringify(scenario)}; use one of ${MOCK_SCENARIO_KEYS.join(', ')}.`,
      ]);
    }
    const simulator = createMockSimulator(scenario);
    return {
      dataSource: createMockDataSource(simulator),
      dispose: () => simulator.dispose(),
      devControls: devControls ? createMockDevControls(simulator, scenario) : null,
    };
  },
};

/**
 * The composition root: reads the build configuration and builds the one data source, once per
 * app launch. The mock data source starts its scenario at once, timed events included.
 *
 * Demo controls exist only in development and preview builds on the mock data source; a
 * production build never creates them, so nothing in it can reach the simulator's controls.
 *
 * An invalid configuration, an unknown scenario or the unavailable API data source becomes a
 * `failed` composition, which the root layout shows instead of the app; any other error is a bug
 * and is rethrown. A `ready` composition must be disposed when the app's root unmounts.
 *
 * @param readConfig Reads the configuration; tests pass their own.
 */
export function composeAppDataSource(readConfig: () => AppConfig = readAppConfig): AppComposition {
  try {
    const config = readConfig();
    const devControls = config.appEnv !== 'production';
    return { status: 'ready', ...createDataSource(config.dataSource, factories, { devControls }) };
  } catch (error) {
    if (error instanceof AppConfigError || error instanceof DataSourceUnavailableError) {
      return { status: 'failed', error };
    }
    throw error;
  }
}
