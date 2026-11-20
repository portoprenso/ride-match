import { DataError } from '../errors';
import type { AccessTokenSource, ConnectionState } from '../AppDataSource';

type EnvelopeSchema<T> = { parse(value: unknown): { data: T; meta: { serverTime: string } } };
type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal; authenticated?: boolean; noContent?: boolean; operationId?: string };

/** HTTP transport owns cancellation, safe failures and midpoint server-time samples; never retries mutations. */
export function createHttpClient(options: {
  baseUrl: string;
  accessToken: AccessTokenSource;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}) {
  const send = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const active = new Set<AbortController>();
  const listeners = new Set<(state: ConnectionState) => void>();
  let disposed = false;
  let state: ConnectionState = 'disconnected';
  let offsetMs: number | null = null;
  function connection(next: ConnectionState) {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener(next);
  }

  return {
    /** Null before an accepted response; device-fix timestamps are not changed here. */
    serverTimeOffset: () => offsetMs,
    serverNow: () => offsetMs === null ? null : now() + offsetMs,
    watchConnection(listener: (state: ConnectionState) => void) {
      listener(state);
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async request<T>(path: string, schema: EnvelopeSchema<T> | null, request: RequestOptions = {}): Promise<T> {
      if (disposed) throw new DataError('unavailable', 'The HTTP data source was disposed.');
      if (request.signal?.aborted) throw new DataError('aborted', 'The read was cancelled.');
      const controller = new AbortController();
      active.add(controller);
      const abort = () => controller.abort();
      request.signal?.addEventListener('abort', abort);
      const timer = setTimeout(abort, options.timeoutMs ?? 10000);
      const startedAt = now();
      try {
        const token = request.authenticated ? options.accessToken() : null;
        let response: Response;
        try {
          response = await send(`${options.baseUrl}/${path}`, {
            method: request.method ?? 'GET',
            headers: {
              Accept: 'application/json',
              ...(request.operationId ? { 'Idempotency-Key': request.operationId } : {}),
              ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
            signal: controller.signal,
            redirect: 'error',
            credentials: 'omit',
          });
        } catch {
          if (request.signal?.aborted || disposed) throw new DataError('aborted', 'The read was cancelled.');
          connection('disconnected');
          throw new DataError('network', 'The API request did not complete.');
        }
        connection('connected'); // HTTP reachability only; this does not claim a Socket.IO connection.
        if (request.noContent && response.status === 204) return undefined as T;
        let body: unknown;
        try { body = await response.json(); }
        catch {
          if (request.signal?.aborted || disposed) throw new DataError('aborted', 'The read was cancelled.');
          if (controller.signal.aborted) throw new DataError('network', 'The API response timed out.');
          throw new DataError('unexpected', 'The API returned invalid JSON.');
        }
        if (request.signal?.aborted || disposed) throw new DataError('aborted', 'The read was cancelled.');
        if (!response.ok) throw DataError.fromSource(body);
        try {
          if (!schema) throw new Error('Expected an empty response');
          const result = schema.parse(body);
          const finishedAt = now();
          offsetMs = Date.parse(result.meta.serverTime) - (startedAt + finishedAt) / 2;
          return result.data;
        } catch { throw new DataError('unexpected', 'The API response breaks the contract.'); }
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', abort);
        active.delete(controller);
      }
    },
    dispose() {
      disposed = true;
      for (const controller of active) controller.abort();
      active.clear();
      connection('disconnected');
      listeners.clear();
    },
  };
}
