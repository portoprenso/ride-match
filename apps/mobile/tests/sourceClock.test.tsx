import { act, cleanup, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { DataSourceProvider } from '../src/data/DataSourceProvider';
import { createUnavailableDataSource } from '../src/data/createUnavailableDataSource';
import { useClock } from '../src/features/discovery/useClock';

const START = Date.parse('2026-11-20T10:00:00Z');

describe('API presentation clock', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(START); });
  afterEach(async () => {
    await cleanup();
    await act(async () => { jest.runOnlyPendingTimers(); });
    jest.runAllTicks();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('adds the measured source offset without changing the device clock', async () => {
    let offset = 3600000;
    const dataSource = { ...createUnavailableDataSource('test'), serverTimeOffset: () => offset };
    const wrapper = ({ children }: { children: ReactNode }) => <DataSourceProvider dataSource={dataSource}>{children}</DataSourceProvider>;
    const hook = await renderHook(() => useClock(1000), { wrapper });
    expect(hook.result.current).toBe(START + offset);
    expect(Date.now()).toBe(START);
    offset = 5000;
    await act(() => jest.advanceTimersByTime(1000));
    expect(hook.result.current).toBe(START + 6000);
    expect(Date.now()).toBe(START + 1000);
    await hook.unmount();
  });

  it('preserves device time outside a source provider and before an API sample', async () => {
    const standalone = await renderHook(() => useClock());
    expect(standalone.result.current).toBe(START);
    await standalone.unmount();
    const dataSource = { ...createUnavailableDataSource('test'), serverTimeOffset: () => null };
    const wrapper = ({ children }: { children: ReactNode }) => <DataSourceProvider dataSource={dataSource}>{children}</DataSourceProvider>;
    const unknown = await renderHook(() => useClock(), { wrapper });
    expect(unknown.result.current).toBe(START);
    await unknown.unmount();
  });
});
