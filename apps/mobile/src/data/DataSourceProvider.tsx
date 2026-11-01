import { createContext, use, type ReactNode } from 'react';

import type { AppDataSource } from './AppDataSource';

const DataSourceContext = createContext<AppDataSource | null>(null);

type DataSourceProviderProps = {
  /** The data source composition selected; it stays the same for the app's lifetime. */
  dataSource: AppDataSource;
  children: ReactNode;
};

/** Makes the composed data source available to `useDataSource()` below it. */
export function DataSourceProvider({ dataSource, children }: DataSourceProviderProps) {
  return <DataSourceContext value={dataSource}>{children}</DataSourceContext>;
}

/**
 * Returns the app's data source. Feature hooks call it instead of importing an implementation,
 * so the same code runs on the simulator now and on a future API implementation.
 *
 * @throws {Error} Outside a {@link DataSourceProvider}, which is a programming error.
 */
export function useDataSource(): AppDataSource {
  const dataSource = use(DataSourceContext);
  if (dataSource === null) throw new Error('useDataSource() must be called inside a DataSourceProvider.');
  return dataSource;
}
