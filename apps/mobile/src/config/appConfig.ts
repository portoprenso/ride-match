/** Build environments: labels demo data and separates analytics, never selects data. */
export const APP_ENVIRONMENTS = ['development', 'preview', 'production'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/** Data-source kinds a build can name. Only `mock` exists in the mobile MVP. */
export const DATA_SOURCE_KINDS = ['mock', 'api'] as const;
export type DataSourceKind = (typeof DATA_SOURCE_KINDS)[number];

/** Which data source the app composes, with the settings that kind needs. */
export type DataSourceConfig =
  | {
      kind: 'mock';
      /** Key of the initial mock scenario, such as `active-neighborhood`. */
      scenario: string;
    }
  | { kind: 'api' };

/** The validated build configuration. */
export type AppConfig = {
  appEnv: AppEnvironment;
  dataSource: DataSourceConfig;
};

/** The raw public variables the configuration is read from; unset ones are `undefined`. */
export type PublicEnvironment = {
  EXPO_PUBLIC_APP_ENV?: string;
  EXPO_PUBLIC_DATA_SOURCE?: string;
  EXPO_PUBLIC_MOCK_SCENARIO?: string;
};

/** A scenario key is lowercase words joined by hyphens, like the keys in MOCK_SCENARIOS.md. */
const SCENARIO_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Thrown when the public build variables are missing or invalid; its message lists every problem. */
export class AppConfigError extends Error {
  /** One sentence per problem, naming the variable. */
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid build configuration: ${problems.join(' ')}`);
    this.name = 'AppConfigError';
    this.problems = problems;
  }
}

function isOneOf<Value extends string>(values: readonly Value[], value: string): value is Value {
  return (values as readonly string[]).includes(value);
}

/**
 * Validates the public build variables into an {@link AppConfig}.
 *
 * Every variable is required: there are no defaults, so a missing value fails instead of
 * silently choosing a data source. An empty value counts as unset. `EXPO_PUBLIC_MOCK_SCENARIO`
 * is required with the mock data source and ignored with `api`; only its format is checked
 * here, and the mock data source rejects a key it does not know. Accepting `api` here does not
 * make it usable: composition then fails clearly (see `createDataSource`).
 *
 * The values are public and echoed in error messages.
 *
 * @throws {AppConfigError} When any variable is missing or invalid, listing all problems.
 */
export function parseAppConfig(env: PublicEnvironment): AppConfig {
  const problems: string[] = [];
  const appEnv = env.EXPO_PUBLIC_APP_ENV || undefined;
  const dataSource = env.EXPO_PUBLIC_DATA_SOURCE || undefined;
  const scenario = env.EXPO_PUBLIC_MOCK_SCENARIO || undefined;

  if (appEnv === undefined) {
    problems.push(`EXPO_PUBLIC_APP_ENV is not set; use one of ${APP_ENVIRONMENTS.join(', ')}.`);
  } else if (!isOneOf(APP_ENVIRONMENTS, appEnv)) {
    problems.push(`EXPO_PUBLIC_APP_ENV is ${JSON.stringify(appEnv)}; use one of ${APP_ENVIRONMENTS.join(', ')}.`);
  }

  if (dataSource === undefined) {
    problems.push(`EXPO_PUBLIC_DATA_SOURCE is not set; use one of ${DATA_SOURCE_KINDS.join(', ')}.`);
  } else if (!isOneOf(DATA_SOURCE_KINDS, dataSource)) {
    problems.push(`EXPO_PUBLIC_DATA_SOURCE is ${JSON.stringify(dataSource)}; use one of ${DATA_SOURCE_KINDS.join(', ')}.`);
  } else if (dataSource === 'mock') {
    if (scenario === undefined) {
      problems.push('EXPO_PUBLIC_MOCK_SCENARIO is not set; the mock data source needs a scenario key.');
    } else if (!SCENARIO_KEY.test(scenario)) {
      problems.push(`EXPO_PUBLIC_MOCK_SCENARIO is ${JSON.stringify(scenario)}; use a lowercase hyphenated key.`);
    }
  }

  if (problems.length > 0) throw new AppConfigError(problems);

  return {
    appEnv: appEnv as AppEnvironment,
    dataSource: dataSource === 'mock' ? { kind: 'mock', scenario: scenario as string } : { kind: 'api' },
  };
}

/**
 * Reads and validates this build's configuration from its `EXPO_PUBLIC_` variables.
 *
 * Expo inlines these variables into the bundle only where code reads `process.env.NAME`
 * directly, so each one is named here; destructuring or `process.env[name]` would read nothing.
 * The values come from `apps/mobile/.env`, overridden by `.env.local` or the shell, when Metro
 * starts. Jest does not load `.env`, so the mobile test setup sets them.
 *
 * @throws {AppConfigError} When the configuration is missing or invalid.
 */
export function readAppConfig(): AppConfig {
  return parseAppConfig({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_DATA_SOURCE: process.env.EXPO_PUBLIC_DATA_SOURCE,
    EXPO_PUBLIC_MOCK_SCENARIO: process.env.EXPO_PUBLIC_MOCK_SCENARIO,
  });
}
