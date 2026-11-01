import type { DataSourceConfig } from '../config/appConfig';
import type { AppDataSource } from './AppDataSource';
import type { DevControls } from './DevControls';
import { DataSourceUnavailableError } from './errors';

/**
 * A built data source and the release of what it holds, such as the simulator's timers and
 * listeners. Only the composition root calls `dispose`; features see the `AppDataSource`, and
 * the demo controls where the build has them.
 */
export type ComposedDataSource = {
  dataSource: AppDataSource;
  dispose: () => void;
  /** The mock source's demo controls in development and preview builds; otherwise `null`. */
  devControls: DevControls | null;
};

/** Builders of the implementations that exist, supplied by the composition root. */
export type DataSourceFactories = {
  /**
   * Builds the in-memory simulator, starting from `scenario`; it throws for a scenario it does not
   * know. `devControls` says whether the build may offer the demo controls.
   */
  mock: (options: { scenario: string; devControls: boolean }) => ComposedDataSource;
};

/**
 * Selects the app's one data source from the validated configuration. This is the only place
 * that branches on the data-source kind; features never check it.
 *
 * `mock` builds the simulator with the configured scenario, and its demo controls when
 * `options.devControls` allows them. `api` fails, because no HTTP or
 * Socket.IO implementation exists in the mobile MVP, and it never falls back to the simulator:
 * a build meant for real riders must not show synthetic ones.
 *
 * @throws {DataSourceUnavailableError} For `api`.
 */
export function createDataSource(
  config: DataSourceConfig,
  factories: DataSourceFactories,
  options: { devControls: boolean },
): ComposedDataSource {
  switch (config.kind) {
    case 'mock':
      return factories.mock({ scenario: config.scenario, devControls: options.devControls });
    case 'api':
      throw new DataSourceUnavailableError(
        'EXPO_PUBLIC_DATA_SOURCE is "api", but the API data source is not available in this build. Use "mock".',
      );
  }
}
