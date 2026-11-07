import { renderHook, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { composeAppDataSource } from '../src/bootstrap/composeAppDataSource';
import { AppConfigError, parseAppConfig, readAppConfig, type AppConfig } from '../src/config/appConfig';
import type { AppDataSource, ConnectionState } from '../src/data/AppDataSource';
import { createDataSource } from '../src/data/createDataSource';
import { createUnavailableDataSource } from '../src/data/createUnavailableDataSource';
import { DataSourceProvider, useDataSource } from '../src/data/DataSourceProvider';
import { DataSourceUnavailableError } from '../src/data/errors';
import { flushTimersAndRestore, renderApp } from './helpers/renderApp';

const mockEnvironment = {
  EXPO_PUBLIC_APP_ENV: 'development',
  EXPO_PUBLIC_DATA_SOURCE: 'mock',
  EXPO_PUBLIC_MOCK_SCENARIO: 'active-neighborhood',
};

/** The problems a configuration fails with, or `[]` if it is valid. */
function problemsOf(env: Record<string, string | undefined>): readonly string[] {
  try {
    parseAppConfig(env);
    return [];
  } catch (error) {
    if (!(error instanceof AppConfigError)) throw error;
    return error.problems;
  }
}

describe('parseAppConfig', () => {
  it('accepts the committed development configuration', () => {
    expect(parseAppConfig(mockEnvironment)).toEqual({
      appEnv: 'development',
      dataSource: { kind: 'mock', scenario: 'active-neighborhood' },
    });
  });

  it.each(['preview', 'production'])('accepts the %s environment', (appEnv) => {
    expect(parseAppConfig({ ...mockEnvironment, EXPO_PUBLIC_APP_ENV: appEnv }).appEnv).toBe(appEnv);
  });

  it('accepts the API kind, ignoring the scenario, so composition can refuse it by name', () => {
    expect(parseAppConfig({ ...mockEnvironment, EXPO_PUBLIC_DATA_SOURCE: 'api' })).toEqual({
      appEnv: 'development',
      dataSource: { kind: 'api' },
    });
  });

  it.each([
    ['a missing environment', { ...mockEnvironment, EXPO_PUBLIC_APP_ENV: undefined }, 'EXPO_PUBLIC_APP_ENV is not set; use one of development, preview, production.'],
    ['an unknown environment', { ...mockEnvironment, EXPO_PUBLIC_APP_ENV: 'staging' }, 'EXPO_PUBLIC_APP_ENV is "staging"; use one of development, preview, production.'],
    ['a missing data source', { ...mockEnvironment, EXPO_PUBLIC_DATA_SOURCE: undefined }, 'EXPO_PUBLIC_DATA_SOURCE is not set; use one of mock, api.'],
    ['an empty data source', { ...mockEnvironment, EXPO_PUBLIC_DATA_SOURCE: '' }, 'EXPO_PUBLIC_DATA_SOURCE is not set; use one of mock, api.'],
    ['an unknown data source', { ...mockEnvironment, EXPO_PUBLIC_DATA_SOURCE: 'http' }, 'EXPO_PUBLIC_DATA_SOURCE is "http"; use one of mock, api.'],
    ['a mock without a scenario', { ...mockEnvironment, EXPO_PUBLIC_MOCK_SCENARIO: undefined }, 'EXPO_PUBLIC_MOCK_SCENARIO is not set; the mock data source needs a scenario key.'],
    ['a malformed scenario', { ...mockEnvironment, EXPO_PUBLIC_MOCK_SCENARIO: 'Active Neighborhood' }, 'EXPO_PUBLIC_MOCK_SCENARIO is "Active Neighborhood"; use a lowercase hyphenated key.'],
  ])('rejects %s, naming the variable', (_label, env, problem) => {
    expect(problemsOf(env)).toEqual([problem]);
  });

  it('reports every problem at once', () => {
    expect(problemsOf({})).toHaveLength(2);
    expect(() => parseAppConfig({})).toThrow(
      'Invalid build configuration: EXPO_PUBLIC_APP_ENV is not set; use one of development, preview, production. EXPO_PUBLIC_DATA_SOURCE is not set; use one of mock, api.',
    );
  });

  it('reads the public variables the test setup provides', () => {
    expect(readAppConfig()).toEqual(parseAppConfig(mockEnvironment));
  });
});

describe('createDataSource', () => {
  it('builds the simulator with the configured scenario, passing on whether demo controls are allowed and the token source', () => {
    const simulator = { dataSource: createUnavailableDataSource('test simulator'), dispose: jest.fn(), devControls: null, demoSignIn: null };
    const mock = jest.fn(() => simulator);

    const accessToken = () => null;

    expect(createDataSource({ kind: 'mock', scenario: 'empty-neighborhood' }, { mock }, { devControls: true, accessToken })).toBe(
      simulator,
    );
    expect(mock).toHaveBeenCalledWith({ scenario: 'empty-neighborhood', devControls: true, accessToken });
  });

  it('refuses the API kind clearly and never falls back to the simulator', () => {
    const mock = jest.fn(() => ({ dataSource: createUnavailableDataSource('test simulator'), dispose: jest.fn(), devControls: null, demoSignIn: null }));

    expect(() => createDataSource({ kind: 'api' }, { mock }, { devControls: true, accessToken: () => null })).toThrow(DataSourceUnavailableError);
    expect(() => createDataSource({ kind: 'api' }, { mock }, { devControls: true, accessToken: () => null })).toThrow(
      'EXPO_PUBLIC_DATA_SOURCE is "api", but the API data source is not available in this build. Use "mock".',
    );
    expect(mock).not.toHaveBeenCalled();
  });
});

describe('createUnavailableDataSource', () => {
  const dataSource = createUnavailableDataSource('Mock data is not available yet.');

  it('has the eight documented namespaces', () => {
    expect(Object.keys(dataSource)).toEqual(['auth', 'places', 'rides', 'groups', 'chat', 'safety', 'devices', 'events']);
  });

  it('rejects every operation with the reason', async () => {
    const operations = Object.entries(dataSource).flatMap(([namespace, members]) =>
      Object.entries(members as Record<string, (...args: unknown[]) => unknown>)
        .filter(([name]) => name !== 'watchConnection')
        .map(([name, operation]) => [`${namespace}.${name}`, operation] as const),
    );
    expect(operations).toHaveLength(26);

    for (const [, operation] of operations) {
      await expect(operation()).rejects.toThrow(new DataSourceUnavailableError('Mock data is not available yet.'));
    }
  });

  it('reports a disconnected connection at once', () => {
    const states: ConnectionState[] = [];
    const stop = dataSource.events.watchConnection((state) => states.push(state));

    expect(states).toEqual(['disconnected']);
    expect(stop).not.toThrow();
  });
});

describe('composeAppDataSource', () => {
  const config = (dataSource: AppConfig['dataSource']) => () => ({ appEnv: 'development' as const, dataSource });

  it('composes the simulator for the configured scenario, and disposing it leaves no timers', async () => {
    jest.useFakeTimers();
    const composition = composeAppDataSource({ readConfig: config({ kind: 'mock', scenario: 'active-neighborhood' }) });
    expect(composition.status).toBe('ready');
    if (composition.status !== 'ready') return;

    const places = composition.dataSource.places.search({
      query: 'asia',
      area: { center: { latitude: 42.87, longitude: 74.6 }, radiusMeters: 10_000 },
      limit: 5,
    });
    await jest.advanceTimersByTimeAsync(700);
    await expect(places).resolves.toEqual([expect.objectContaining({ id: 'place_asia_mall' })]);
    await expect(composition.dataSource.rides.getOwnRequest()).rejects.toThrow(DataSourceUnavailableError);

    expect(jest.getTimerCount()).toBeGreaterThan(0);
    composition.dispose();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it.each([
    ['development', true],
    ['preview', true],
    ['production', false],
  ] as const)('gives the %s build demo controls: %s', (appEnv, offered) => {
    const composition = composeAppDataSource({
      readConfig: () => ({ appEnv, dataSource: { kind: 'mock', scenario: 'empty-neighborhood' } }),
    });
    expect(composition.status).toBe('ready');
    if (composition.status !== 'ready') return;

    expect(composition.devControls !== null).toBe(offered);
    composition.dispose();
  });

  it('fails the composition for a scenario the simulator does not know', () => {
    const composition = composeAppDataSource({ readConfig: config({ kind: 'mock', scenario: 'match-appears' }) });

    expect(composition.status === 'failed' && composition.error).toBeInstanceOf(AppConfigError);
    expect(composition.status === 'failed' && composition.error instanceof AppConfigError && composition.error.problems).toEqual([
      'EXPO_PUBLIC_MOCK_SCENARIO is "match-appears"; use one of active-neighborhood, empty-neighborhood.',
    ]);
  });

  it('fails the composition for the API kind', () => {
    const composition = composeAppDataSource({ readConfig: config({ kind: 'api' }) });

    expect(composition.status).toBe('failed');
    expect(composition.status === 'failed' && composition.error).toBeInstanceOf(DataSourceUnavailableError);
  });

  it('fails the composition for an invalid configuration', () => {
    const composition = composeAppDataSource({ readConfig: () => parseAppConfig({}) });

    expect(composition.status === 'failed' && composition.error).toBeInstanceOf(AppConfigError);
  });

  it('rethrows any other error', () => {
    expect(() =>
      composeAppDataSource({
        readConfig: () => {
          throw new TypeError('unexpected');
        },
      }),
    ).toThrow(TypeError);
  });
});

describe('useDataSource', () => {
  it('returns the provided data source', async () => {
    const dataSource: AppDataSource = createUnavailableDataSource('test');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <DataSourceProvider dataSource={dataSource}>{children}</DataSourceProvider>
    );

    const { result } = await renderHook(() => useDataSource(), { wrapper });
    expect(result.current).toBe(dataSource);
  });

  it('fails outside a provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useDataSource())).rejects.toThrow(
      'useDataSource() must be called inside a DataSourceProvider.',
    );
  });
});

describe('root layout', () => {
  afterEach(async () => {
    await flushTimersAndRestore();
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_DATA_SOURCE = mockEnvironment.EXPO_PUBLIC_DATA_SOURCE;
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = mockEnvironment.EXPO_PUBLIC_MOCK_SCENARIO;
  });

  it('opens the app on the mock configuration', async () => {
    await renderApp('/');

    expect(screen.getByTestId('home-map')).toBeOnTheScreen();
  });

  it('shows why the API data source cannot run, instead of any route', async () => {
    process.env.EXPO_PUBLIC_DATA_SOURCE = 'api';
    await renderApp('/groups/group_1');

    expect(screen.getByRole('header', { name: 'This build can’t start' })).toBeOnTheScreen();
    expect(
      screen.getByText('EXPO_PUBLIC_DATA_SOURCE is "api", but the API data source is not available in this build. Use "mock".'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('home-map')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('shows an unknown scenario as a configuration problem', async () => {
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = 'match-appears';
    await renderApp('/');

    expect(screen.getByRole('header', { name: 'This build can’t start' })).toBeOnTheScreen();
    expect(
      screen.getByText('EXPO_PUBLIC_MOCK_SCENARIO is "match-appears"; use one of active-neighborhood, empty-neighborhood.'),
    ).toBeOnTheScreen();
  });

  it('lists each configuration problem', async () => {
    process.env.EXPO_PUBLIC_MOCK_SCENARIO = '';
    await renderApp('/');

    expect(screen.getByRole('header', { name: 'This build can’t start' })).toBeOnTheScreen();
    expect(
      screen.getByText('EXPO_PUBLIC_MOCK_SCENARIO is not set; the mock data source needs a scenario key.'),
    ).toBeOnTheScreen();
  });
});
