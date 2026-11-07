import type { DataSourceConfig } from '../config/appConfig';
import type { AccessTokenSource, AppDataSource } from './AppDataSource';
import type { DemoSignIn } from './DemoSignIn';
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
  /** How to sign in to a synthetic source, shown by the sign-in screens; `null` for a real one. */
  demoSignIn: DemoSignIn | null;
};

/** Builders of the implementations that exist, supplied by the composition root. */
export type DataSourceFactories = {
  /**
   * Builds the in-memory simulator, starting from `scenario`; it throws for a scenario it does not
   * know. `devControls` says whether the build may offer the demo controls, and `accessToken`
   * supplies the session's access token to every authenticated call.
   */
  mock: (options: { scenario: string; devControls: boolean; accessToken: AccessTokenSource }) => ComposedDataSource;
};

/**
 * Selects the app's one data source from the validated configuration. This is the only place
 * that branches on the data-source kind; features never check it.
 *
 * `mock` builds the simulator with the configured scenario, and its demo controls when
 * `options.devControls` allows them; it reads `options.accessToken` when each call starts. `api`
 * fails, because no HTTP or Socket.IO implementation exists in the mobile MVP, and it never falls
 * back to the simulator:
 * a build meant for real riders must not show synthetic ones.
 *
 * @throws {DataSourceUnavailableError} For `api`.
 */
export function createDataSource(
  config: DataSourceConfig,
  factories: DataSourceFactories,
  options: { devControls: boolean; accessToken: AccessTokenSource },
): ComposedDataSource {
  switch (config.kind) {
    case 'mock':
      return factories.mock({ scenario: config.scenario, ...options });
    case 'api':
      throw new DataSourceUnavailableError(
        'EXPO_PUBLIC_DATA_SOURCE is "api", but the API data source is not available in this build. Use "mock".',
      );
  }
}
