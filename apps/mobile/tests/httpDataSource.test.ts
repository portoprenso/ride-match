import { createHttpDataSource } from '../src/data/api/createHttpDataSource';
import { parseAppConfig } from '../src/config/appConfig';
import { DataError } from '../src/data/errors';

const serverTime = '2026-11-20T10:00:01.000Z';
const area = { center: { latitude: 42.88, longitude: 74.6 }, radiusMeters: 10000 };
const empty = { data: [], meta: { serverTime } };
const response = (body: unknown, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
const baseUrl = 'http://127.0.0.1:3000/v1';

function setup(send: jest.Mock = jest.fn()) {
  const adapter = createHttpDataSource({ baseUrl, accessToken: () => null, fetch: send });
  return { adapter, source: adapter.dataSource, send };
}

describe('BE-002 HTTP adapter', () => {
  it('encodes only dotted GET fields, preserves anonymous search and samples server time', async () => {
    let time = Date.parse('2026-11-20T10:00:00.000Z');
    const send = jest.fn(async () => { time += 200; return response(empty); });
    const adapter = createHttpDataSource({ baseUrl, accessToken: () => null, fetch: send, now: () => time });
    expect(adapter.serverNow()).toBeNull();
    await expect(adapter.dataSource.places.search({ area, limit: 2, query: 'East & West' })).resolves.toEqual([]);
    const [url, options] = send.mock.calls[0] as unknown as [string, RequestInit];
    const query = new URL(url).searchParams;
    expect(query.get('query')).toBe('East & West');
    expect(query.get('area.center.latitude')).toBe('42.88');
    expect(query.get('area.center.longitude')).toBe('74.6');
    expect(options.method).toBe('GET'); expect(options.body).toBeUndefined();
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(options.redirect).toBe('error');
    expect(adapter.serverNow()).toBe(Date.parse(serverTime) + 100);
    adapter.dispose();
  });

  it('reads the current bearer each time and never puts refresh credentials in URLs/headers', async () => {
    let token: string | null = null;
    const send = jest.fn(async () => response({ code: 'UNAUTHENTICATED', message: 'Authentication required.', requestId: 'test-request' }, 401));
    const adapter = createHttpDataSource({ baseUrl, accessToken: () => token, fetch: send });
    for (const value of ['synthetic-access-first', 'synthetic-access-second']) {
      token = value;
      await expect(adapter.dataSource.auth.getCurrentUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
    expect(send.mock.calls.map((args) => (args as unknown as [string, RequestInit])[1].headers)).toEqual([
      { Accept: 'application/json', Authorization: 'Bearer synthetic-access-first' },
      { Accept: 'application/json', Authorization: 'Bearer synthetic-access-second' },
    ]);
    await expect(adapter.dataSource.auth.refreshSession({ refreshToken: 'synthetic-refresh-secret' })).rejects.toBeInstanceOf(DataError);
    const [url, options] = send.mock.calls[2] as unknown as [string, RequestInit];
    expect(url).not.toContain('synthetic-refresh-secret');
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(options.body))).toEqual({ refreshToken: 'synthetic-refresh-secret' });
    expect(send).toHaveBeenCalledTimes(3);
    adapter.dispose();
  });

  it('rejects unsupported operations locally, without a request or mock fallback', async () => {
    const { adapter, source, send } = setup();
    await expect(source.chat.getHistory('unknown-group', { limit: 10 })).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(source.events.subscribe({ kind: 'user' }, () => {})).rejects.toMatchObject({ kind: 'unavailable' });
    expect(send).not.toHaveBeenCalled();
    expect(adapter.devControls).toBeNull(); expect(adapter.demoSignIn).toBeNull();
    adapter.dispose();
  });

  it('rejects invalid inputs and response schemas without retaining sensitive error content', async () => {
    const { adapter, source, send } = setup(jest.fn(async () => response({ syntheticPrivateKey: 'private-value' })));
    await expect(source.places.search({ area, limit: 0 })).rejects.toMatchObject({ kind: 'unexpected' });
    expect(send).not.toHaveBeenCalled();
    await expect(source.places.search({ area, limit: 2 })).rejects.toMatchObject({ kind: 'unexpected', body: null });
    adapter.dispose();
  });

  it('handles raw domain errors, malformed JSON and empty logout independently', async () => {
    const send = jest.fn()
      .mockResolvedValueOnce(response({ code: 'RATE_LIMITED', message: 'Wait.', requestId: 'test-request', retryAfterSeconds: 30 }, 429))
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.reject(new Error('private body')) })
      .mockResolvedValueOnce(response(null, 204));
    const { adapter, source } = setup(send);
    await expect(source.auth.requestOtp({ phoneNumber: '+447700900123' })).rejects.toMatchObject({ code: 'RATE_LIMITED', body: { retryAfterSeconds: 30 } });
    await expect(source.places.search({ area, limit: 2 })).rejects.toMatchObject({ kind: 'unexpected' });
    await expect(source.auth.logout({ refreshToken: 'synthetic-refresh-secret' })).resolves.toBeUndefined();
    adapter.dispose();
  });

  it('cancels reads and disposed requests, clears timers, and never auto-retries a lost mutation', async () => {
    jest.useFakeTimers();
    try {
      const send = jest.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('private network detail')));
      }));
      const { adapter, source } = setup(send);
      const cancelled = new AbortController();
      const read = source.places.search({ area, limit: 2 }, { signal: cancelled.signal });
      cancelled.abort();
      await expect(read).rejects.toMatchObject({ kind: 'aborted' });
      expect(jest.getTimerCount()).toBe(0);
      const mutation = source.auth.requestOtp({ phoneNumber: '+447700900123' });
      const assertion = expect(mutation).rejects.toMatchObject({ kind: 'network' });
      jest.advanceTimersByTime(10000);
      await assertion;
      expect(send).toHaveBeenCalledTimes(2);
      const pending = source.places.search({ area, limit: 2 });
      adapter.dispose();
      await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
      expect(jest.getTimerCount()).toBe(0);
      await expect(source.auth.getCurrentUser()).rejects.toMatchObject({ kind: 'unavailable' });
    } finally { jest.useRealTimers(); }
  });

  it('reports HTTP reachability transitions without claiming realtime support', async () => {
    const { adapter, source } = setup(jest.fn().mockResolvedValueOnce(response(empty)).mockRejectedValueOnce(new Error('private URL')));
    const listener = jest.fn();
    const stop = source.events.watchConnection(listener);
    await source.places.search({ area, limit: 2 });
    await expect(source.places.search({ area, limit: 2 })).rejects.toMatchObject({ kind: 'network' });
    expect(listener.mock.calls.map(([state]) => state)).toEqual(['disconnected', 'connected', 'disconnected']);
    stop(); adapter.dispose();
  });
});

describe('API configuration', () => {
  it.each([
    '', 'http://user:synthetic-secret@example.invalid/v1', 'https://api.example.invalid/v1?token=private',
    'https://api.example.invalid/v1#private', 'https://api.example.invalid/wrong', 'file:///v1',
  ])('rejects unsafe API URL without echoing it', (baseUrl) => {
    expect(() => parseAppConfig({ EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_DATA_SOURCE: 'api', EXPO_PUBLIC_API_BASE_URL: baseUrl })).toThrow('EXPO_PUBLIC_API_BASE_URL must be');
  });
  it('requires HTTPS in production and accepts explicit local development URL', () => {
    expect(() => parseAppConfig({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_DATA_SOURCE: 'api', EXPO_PUBLIC_API_BASE_URL: baseUrl })).toThrow();
    expect(parseAppConfig({ EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_DATA_SOURCE: 'api', EXPO_PUBLIC_API_BASE_URL: baseUrl }).dataSource).toEqual({ kind: 'api', baseUrl });
  });
});
