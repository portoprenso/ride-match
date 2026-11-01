import type { DataSourceConfig } from '../config/appConfig';
import type { AppDataSource } from './AppDataSource';
import { DataSourceUnavailableError } from './errors';

/** Builders of the implementations that exist, supplied by the composition root. */
export type DataSourceFactories = {
  /** Builds the in-memory simulator, starting from `scenario`. */
  mock: (options: { scenario: string }) => AppDataSource;
};

/**
 * Selects the app's one data source from the validated configuration. This is the only place
 * that branches on the data-source kind; features never check it.
 *
 * `mock` builds the simulator with the configured scenario. `api` fails, because no HTTP or
 * Socket.IO implementation exists in the mobile MVP, and it never falls back to the simulator:
 * a build meant for real riders must not show synthetic ones.
 *
 * @throws {DataSourceUnavailableError} For `api`.
 */
export function createDataSource(config: DataSourceConfig, factories: DataSourceFactories): AppDataSource {
  switch (config.kind) {
    case 'mock':
      return factories.mock({ scenario: config.scenario });
    case 'api':
      throw new DataSourceUnavailableError(
        'EXPO_PUBLIC_DATA_SOURCE is "api", but the API data source is not available in this build. Use "mock".',
      );
  }
}
