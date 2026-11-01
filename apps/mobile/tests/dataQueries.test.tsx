import type { NearbyQueryInput, NearbySnapshotDto } from '@ride-match/contracts';
import { hashKey, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createQueryClient, MAX_READ_RETRIES } from '../src/bootstrap/createQueryClient';
import type { AppDataSource, ReadOptions } from '../src/data/AppDataSource';
import { createUnavailableDataSource } from '../src/data/createUnavailableDataSource';
import { DataError, DataSourceUnavailableError, isRetryableRead, toDataError, withDataErrors } from '../src/data/errors';
import { groupDetailQuery, nearbyQuery } from '../src/data/queries';
import { ANONYMOUS_VIEWER, queryKeys, type SignedInViewer } from '../src/data/queryKeys';

// Synthetic viewers, viewports and error bodies; no real person, place or request.
const riderA: SignedInViewer = { kind: 'user', userId: 'user_rider_a' };
const riderB: SignedInViewer = { kind: 'user', userId: 'user_rider_b' };
const viewport = (south: number): NearbyQueryInput['viewport'] => ({
  southWest: { latitude: south, longitude: 74.55 },
  northEast: { latitude: south + 0.05, longitude: 74.65 },
});
const nearbyInput: NearbyQueryInput = { viewport: viewport(42.85), limit: 100 };
const placeInput = { area: { center: { latitude: 42.87, longitude: 74.59 }, radiusMeters: 5000 }, limit: 10 };
const errorBody = (code: string) => ({ code, message: 'The request was refused.', requestId: 'req_1' });

// Test clients keep cached queries forever, so no garbage-collection timer outlives a test and
// keeps Jest running. `appQueryClient` keeps the app's other defaults, such as the retry policy.
const plainQueryClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
function appQueryClient() {
  const client = createQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, gcTime: Infinity } });
  return client;
}

describe('queryKeys', () => {
  it('separates viewers for the same parameters', () => {
    const keys = [
      queryKeys.nearby(ANONYMOUS_VIEWER, nearbyInput),
      queryKeys.nearby(riderA, nearbyInput),
      queryKeys.nearby(riderB, nearbyInput),
    ].map(hashKey);

    expect(new Set(keys).size).toBe(3);
  });

  it('separates parameters for the same viewer', () => {
    expect(hashKey(queryKeys.nearby(riderA, nearbyInput))).not.toBe(
      hashKey(queryKeys.nearby(riderA, { ...nearbyInput, viewport: viewport(42.8) })),
    );
    expect(hashKey(queryKeys.nearby(riderA, nearbyInput))).not.toBe(
      hashKey(queryKeys.nearby(riderA, { ...nearbyInput, destinationPlaceId: 'place_asia_mall' })),
    );
    expect(hashKey(queryKeys.matches(riderA, 'ride_1'))).not.toBe(hashKey(queryKeys.matches(riderA, 'ride_2')));
  });

  it('drops only one viewer’s results when that identity changes', () => {
    const client = plainQueryClient();
    const seeded = [
      queryKeys.placeSearch(placeInput),
      queryKeys.nearby(ANONYMOUS_VIEWER, nearbyInput),
      queryKeys.nearby(riderA, nearbyInput),
      queryKeys.ownRequest(riderA),
      queryKeys.groupDetail(riderA, 'group_1'),
      queryKeys.ownRequest(riderB),
    ];
    for (const key of seeded) client.setQueryData(key, 'cached');

    client.removeQueries({ queryKey: queryKeys.viewer(riderA) });

    expect(seeded.map((key) => client.getQueryData(key) !== undefined)).toEqual([true, true, false, false, false, true]);
  });

  it('drops a group’s private data, and nothing else, when access to it ends', () => {
    const client = plainQueryClient();
    const seeded = [
      queryKeys.groupDetail(riderA, 'group_1'),
      queryKeys.chatHistory(riderA, 'group_1'),
      queryKeys.groupPreview(riderA, 'group_1'),
      queryKeys.groupDetail(riderA, 'group_2'),
    ];
    for (const key of seeded) client.setQueryData(key, 'cached');

    client.removeQueries({ queryKey: queryKeys.group(riderA, 'group_1') });

    expect(seeded.map((key) => client.getQueryData(key) !== undefined)).toEqual([false, false, true, true]);
  });
});

/** A data source whose nearby reads stay pending, recording each read's input and signal. */
function pendingNearbySource() {
  const reads: { input: NearbyQueryInput; signal?: AbortSignal }[] = [];
  const base = createUnavailableDataSource('test');
  const dataSource: AppDataSource = {
    ...base,
    rides: {
      ...base.rides,
      getNearby: (input: NearbyQueryInput, options?: ReadOptions) => {
        reads.push({ input, signal: options?.signal });
        return new Promise<NearbySnapshotDto>(() => {});
      },
    },
  };
  return { dataSource, reads };
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('read cancellation', () => {
  it('aborts the previous viewport’s read when the map moves, and the last one when nothing shows it', async () => {
    const client = appQueryClient();
    const { dataSource, reads } = pendingNearbySource();
    const view = await renderHook(
      ({ input }: { input: NearbyQueryInput }) => useQuery(nearbyQuery(dataSource, ANONYMOUS_VIEWER, input)),
      {
        initialProps: { input: nearbyInput },
        wrapper: wrapperFor(client),
      },
    );
    await waitFor(() => expect(reads).toHaveLength(1));

    await view.rerender({ input: { ...nearbyInput, viewport: viewport(42.8) } });
    await waitFor(() => expect(reads).toHaveLength(2));

    expect(reads[0]?.signal?.aborted).toBe(true);
    expect(reads[1]?.signal?.aborted).toBe(false);
    expect(reads[1]?.input.viewport).toEqual(viewport(42.8));

    await view.unmount();
    expect(reads[1]?.signal?.aborted).toBe(true);
  });
});

describe('query failures', () => {
  function sourceWithGroupFailure(error: unknown): AppDataSource {
    const base = createUnavailableDataSource('test');
    return { ...base, groups: { ...base.groups, getGroup: () => Promise.reject(error) } };
  }

  async function failedQueryError(error: unknown) {
    const client = appQueryClient();
    const { result } = await renderHook(() => useQuery(groupDetailQuery(sourceWithGroupFailure(error), riderA, 'group_1')), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    return result.current.error;
  }

  it('reaches Query as the source’s error, at once, for a refusal', async () => {
    const error = await failedQueryError(DataError.fromSource(errorBody('MEMBERSHIP_REQUIRED')));

    expect(error).toBeInstanceOf(DataError);
    expect(error?.kind).toBe('source');
    expect(error?.code).toBe('MEMBERSHIP_REQUIRED');
  });

  it('reaches Query as an unexpected DataError for anything else', async () => {
    const error = await failedQueryError(new TypeError('bug'));

    expect(error).toBeInstanceOf(DataError);
    expect(error?.kind).toBe('unexpected');
    expect(error?.cause).toBeInstanceOf(TypeError);
  });
});

describe('DataError', () => {
  it('keeps a valid source body', () => {
    const error = DataError.fromSource({ ...errorBody('RATE_LIMITED'), retryAfterSeconds: 30 });

    expect(error.kind).toBe('source');
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.body?.retryAfterSeconds).toBe(30);
    expect(error.message).toBe('The request was refused.');
  });

  it.each([
    ['an unknown code', errorBody('TEAPOT')],
    ['a missing request ID', { code: 'NOT_FOUND', message: 'Not found.' }],
    ['an echoed submitted value', { ...errorBody('VALIDATION_FAILED'), value: '+15555550123' }],
  ])('turns a body with %s into an unexpected error that carries none of it', (_label, body) => {
    const error = DataError.fromSource(body);

    expect(error.kind).toBe('unexpected');
    expect(error.body).toBeNull();
    expect(error.code).toBeNull();
    expect(JSON.stringify({ message: error.message })).not.toContain('5555');
  });

  it('counts the unavailable data source as a DataError', () => {
    const error = new DataSourceUnavailableError('Mock data is not available yet.');

    expect(error).toBeInstanceOf(DataError);
    expect(error.kind).toBe('unavailable');
  });
});

describe('toDataError and withDataErrors', () => {
  it('passes a DataError through', () => {
    const error = new DataError('network', 'No answer.');
    expect(toDataError(error)).toBe(error);
  });

  it('turns an AbortError into an aborted error', () => {
    const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    expect(toDataError(abort).kind).toBe('aborted');
  });

  it.each([new TypeError('bug'), 'a string', undefined])('turns %p into an unexpected error', (value) => {
    expect(toDataError(value).kind).toBe('unexpected');
  });

  it('rejects only with DataErrors and resolves unchanged', async () => {
    await expect(withDataErrors(Promise.resolve('value'))).resolves.toBe('value');
    await expect(withDataErrors(Promise.reject(new Error('bug')))).rejects.toBeInstanceOf(DataError);
  });
});

describe('retry policy', () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry as (count: number, error: DataError) => boolean;

  it.each([
    ['a lost answer', new DataError('network', 'No answer.')],
    ['a temporarily unavailable source', DataError.fromSource(errorBody('SERVICE_UNAVAILABLE'))],
  ])('retries a read after %s', (_label, error) => {
    expect(isRetryableRead(error)).toBe(true);
    expect(retry(0, error)).toBe(true);
  });

  it.each([
    ['a refusal', DataError.fromSource(errorBody('MEMBERSHIP_REQUIRED'))],
    ['a rate limit', DataError.fromSource(errorBody('RATE_LIMITED'))],
    ['an unavailable build', new DataSourceUnavailableError('Mock data is not available yet.')],
    ['a bug', new DataError('unexpected', 'Bug.')],
  ])('does not retry a read after %s', (_label, error) => {
    expect(isRetryableRead(error)).toBe(false);
    expect(retry(0, error)).toBe(false);
  });

  it(`stops after ${MAX_READ_RETRIES} retries`, () => {
    const lost = new DataError('network', 'No answer.');
    expect(retry(MAX_READ_RETRIES - 1, lost)).toBe(true);
    expect(retry(MAX_READ_RETRIES, lost)).toBe(false);
  });

  it('never retries a mutation automatically', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});

describe('the unavailable stand-in through Query', () => {
  it('fails a read with the unavailable error and does not retry it', async () => {
    const client = appQueryClient();
    const dataSource = createUnavailableDataSource('Mock data is not available yet.');
    const getNearby = jest.spyOn(dataSource.rides, 'getNearby');
    const { result } = await renderHook(() => useQuery(nearbyQuery(dataSource, ANONYMOUS_VIEWER, nearbyInput)), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.kind).toBe('unavailable');
    expect(getNearby).toHaveBeenCalledTimes(1);
  });
});
