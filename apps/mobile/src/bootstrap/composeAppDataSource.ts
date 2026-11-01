import { AppConfigError, readAppConfig, type AppConfig } from '../config/appConfig';
import type { AppDataSource } from '../data/AppDataSource';
import { createDataSource, type DataSourceFactories } from '../data/createDataSource';
import { createUnavailableDataSource } from '../data/createUnavailableDataSource';
import { DataSourceUnavailableError } from '../data/errors';

/** The data source the app runs on, or why this build's configuration cannot run. */
export type AppComposition =
  | { status: 'ready'; dataSource: AppDataSource }
  | { status: 'failed'; error: AppConfigError | DataSourceUnavailableError };

// The simulator does not exist yet: until MOCK-001 supplies its factory here, the mock slot
// holds a data source whose every operation rejects, never invented data.
const factories: DataSourceFactories = {
  mock: () => createUnavailableDataSource('Mock data is not available yet.'),
};

/**
 * The composition root: reads the build configuration and builds the one data source, once per
 * app launch.
 *
 * An invalid configuration or the unavailable API data source becomes a `failed` composition,
 * which the root layout shows instead of the app; any other error is a bug and is rethrown.
 *
 * @param readConfig Reads the configuration; tests pass their own.
 */
export function composeAppDataSource(readConfig: () => AppConfig = readAppConfig): AppComposition {
  try {
    const config = readConfig();
    return { status: 'ready', dataSource: createDataSource(config.dataSource, factories) };
  } catch (error) {
    if (error instanceof AppConfigError || error instanceof DataSourceUnavailableError) {
      return { status: 'failed', error };
    }
    throw error;
  }
}
