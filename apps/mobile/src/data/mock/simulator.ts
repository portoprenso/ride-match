import { EVENT_SCHEMA_VERSION, type ApiErrorCode, type DomainEventDto } from '@ride-match/contracts';

import type { ConnectionState } from '../AppDataSource';
import { DataError, DataSourceUnavailableError } from '../errors';
import { createSimulatedClock, type SimulatedClock } from './clock';
import { createEmitter } from './events';
import { createIdGenerator, type IdGenerator } from './ids';
import { createSeededRandom, type SeededRandom } from './random';
import { createReceiptStore, type ReceiptStore } from './receipts';
import { createScheduler } from './scheduler';

/** Default simulated latency per operation, in milliseconds (MOCK_SCENARIOS.md). */
export const DEFAULT_LATENCY_MS = { min: 200, max: 700 } as const;

/** An inclusive range of simulated latency, in milliseconds. */
export type LatencyRange = { min: number; max: number };

/**
 * A failure the next matching operation suffers instead of its normal outcome:
 *
 * - `network`: no answer arrives. By default the request never reached the source, so nothing
 *   changes. With `afterCommit`, the change is made and only the answer is lost, so a retry
 *   with the same operation ID must find the original result.
 * - `source`: the source refuses with `code`, and nothing changes.
 */
export type MockFailure = { kind: 'network'; afterCommit?: boolean } | { kind: 'source'; code: ApiErrorCode };

/** The fields every domain event starts with; an operation adds `type`, `audience` and `payload`. */
export type EventEnvelope = Pick<DomainEventDto, 'id' | 'schemaVersion' | 'occurredAt'>;

/** What the simulator lends to an operation's work or a scheduled task. */
export type WorkContext<State> = {
  /** The world, which the work may change; see {@link Simulator.run} for the rules. */
  state: State;
  /** Simulated time when the work runs, in milliseconds. */
  now: number;
  ids: IdGenerator;
  /** Seeded randomness for world choices, separate from latency so one never shifts the other. */
  random: SeededRandom;
  receipts: ReceiptStore;
  /** Queues a domain event, published only if the work completes. */
  emit(event: DomainEventDto): void;
  /** A new event ID, the schema version and the current time. */
  eventEnvelope(): EventEnvelope;
  /** A source refusal with a fresh request ID, for the work to throw. */
  sourceError(code: ApiErrorCode, message: string): DataError;
  /** Runs `work` at simulated time `dueAt`, such as a new record's expiry; see {@link Simulator.schedule}. */
  schedule(dueAt: number, work: Work<State, void>): () => void;
};

export type Work<State, Result> = (context: WorkContext<State>) => Result;

/** What a seed function receives to build the starting world. */
export type SeedContext = { now: number; ids: IdGenerator; random: SeededRandom };

export type SimulatorOptions<State> = {
  /** Seed of every random sequence; a scenario's key is a good one. */
  seed: string;
  /** Builds the starting world, at creation and on every reset. */
  createState: (context: SeedContext) => State;
  /** Runs after the world is built, at creation and on every reset, for example to schedule a scenario's timed events. */
  activate?: (simulator: Simulator<State>) => void;
  /** Simulated latency per operation; {@link DEFAULT_LATENCY_MS} unless given. */
  latencyMs?: LatencyRange;
  /** Source of real time for the clock; `Date.now` unless a test passes its own. */
  readTime?: () => number;
};

/** Counts of what the simulator holds, which must return to zero after disposal. */
export type SimulatorStats = {
  pendingOperations: number;
  scheduledTasks: number;
  eventListeners: number;
  connectionWatchers: number;
  receipts: number;
  queuedFailures: number;
};

/**
 * The in-memory stand-in for the future backend: one world, one clock and one event stream.
 * Domain operations (later cards) run their logic through {@link Simulator.run}, and the mock
 * data source adapts them to `AppDataSource`. Nothing here is visible to feature code.
 */
export type Simulator<State> = {
  readonly clock: SimulatedClock;
  /** The current world. Tests and seeds read it; operations change it only inside work. */
  readonly state: State;
  /**
   * Runs one operation the way the future source would:
   *
   * 1. Fails at once with a `network` error while disconnected, and with `aborted` if `signal`
   *    already fired.
   * 2. Waits a seeded latency; aborting `signal` meanwhile cancels the operation, and nothing
   *    changes. Only reads pass a signal.
   * 3. Runs every scheduled task now due, so expiries apply before the work reads the world.
   * 4. Fails with `network` if the connection dropped meanwhile, or with the next matching
   *    {@link MockFailure}.
   * 5. Runs `work` synchronously, so no other operation interleaves with it: rechecking the
   *    world after the latency is what produces real conflicts, such as a last seat taken
   *    meanwhile. Work checks everything before its first change, because a throw after a
   *    change leaves that change in place. It returns serialized DTOs, never state objects.
   * 6. Publishes the events the work emitted, only if it completed.
   *
   * The promise rejects with a `DataError`, or with whatever the work throws.
   *
   * @param operation The data-source operation's name, such as `rides.create`, which failure
   *   controls match.
   */
  run<Result>(operation: string, work: Work<State, Result>, options?: { signal?: AbortSignal }): Promise<Result>;
  /** Runs `work` at simulated time `dueAt`, with the same event rules; returns a cancel function. */
  schedule(dueAt: number, work: Work<State, void>): () => void;
  /** Receives every published domain event until the returned function is called. Disconnecting ends every subscription. */
  subscribe(listener: (event: DomainEventDto) => void): () => void;
  /** Reports the connection state at once and on every change, until the returned function is called. */
  watchConnection(listener: (state: ConnectionState) => void): () => void;
  /** Simulates losing or regaining the connection. Disconnecting ends every event subscription. */
  setConnection(state: ConnectionState): void;
  /** Makes the next operation named `operation`, or the next of any name when omitted, suffer `failure`. Failures queue in order. */
  failNext(failure: MockFailure, operation?: string): void;
  /** Moves simulated time forward and runs the tasks that became due. */
  advanceTime(ms: number): void;
  /** Catches up after the app returns to the foreground: runs every task that became due meanwhile. */
  resume(): void;
  /**
   * Starts the scenario over: pending operations fail with `network`, scheduled tasks, event
   * subscriptions, receipts and queued failures are cleared, the clock offset, IDs and random
   * sequences restart, the world is rebuilt and activated, and the connection is restored.
   * Connection watchers stay, since the app owns them.
   */
  reset(): void;
  /** Releases everything, connection watchers included. Later operations fail; calling it again does nothing. */
  dispose(): void;
  stats(): SimulatorStats;
};

const SIMULATED_REFUSAL = 'The mock source refused this operation (simulated failure).';

type PendingOperation = { cancel: (error: DataError) => void };

export function createSimulator<State>(options: SimulatorOptions<State>): Simulator<State> {
  const latency = options.latencyMs ?? DEFAULT_LATENCY_MS;
  if (!(latency.min >= 0 && latency.max >= latency.min)) throw new RangeError('Expected 0 ≤ min ≤ max latency.');

  const clock = createSimulatedClock(options.readTime);
  const ids = createIdGenerator();
  const latencyRandom = createSeededRandom(`${options.seed}:latency`);
  const worldRandom = createSeededRandom(`${options.seed}:world`);
  const scheduler = createScheduler(clock);
  const events = createEmitter<DomainEventDto>();
  const watchers = createEmitter<ConnectionState>();
  const pending = new Set<PendingOperation>();
  const failures: { operation?: string; failure: MockFailure }[] = [];
  let connection: ConnectionState = 'connected';
  let disposed = false;

  const sourceError = (code: ApiErrorCode, message: string) =>
    DataError.fromSource({ code, message, requestId: ids.next('req') });
  const receipts = createReceiptStore(() =>
    sourceError('IDEMPOTENCY_CONFLICT', 'This operation ID was already used for a different request.'),
  );
  const networkError = () => new DataError('network', 'No answer from the mock source (simulated connection loss).');
  const abortedError = () => new DataError('aborted', 'The read was cancelled.');
  const eventEnvelope = (): EventEnvelope => ({
    id: ids.next('evt'),
    schemaVersion: EVENT_SCHEMA_VERSION,
    occurredAt: clock.nowIso(),
  });

  let state = buildState();

  function buildState(): State {
    return options.createState({ now: clock.now(), ids, random: worldRandom });
  }

  /** Runs work with a context, then publishes the events it queued, only if it completed. */
  function commit<Result>(work: Work<State, Result>): Result {
    const queued: DomainEventDto[] = [];
    const result = work({
      state,
      now: clock.now(),
      ids,
      random: worldRandom,
      receipts,
      emit: (event) => queued.push(event),
      eventEnvelope,
      sourceError,
      schedule,
    });
    for (const event of queued) events.publish(event);
    return result;
  }

  function takeFailure(operation: string): MockFailure | undefined {
    const index = failures.findIndex((entry) => entry.operation === undefined || entry.operation === operation);
    return index === -1 ? undefined : failures.splice(index, 1)[0]?.failure;
  }

  function execute<Result>(operation: string, work: Work<State, Result>): Result {
    scheduler.processDue();
    if (connection === 'disconnected') throw networkError();
    const failure = takeFailure(operation);
    if (failure?.kind === 'source') throw sourceError(failure.code, SIMULATED_REFUSAL);
    if (failure?.kind === 'network' && !failure.afterCommit) throw networkError();
    const result = commit(work);
    if (failure?.kind === 'network') throw networkError();
    return result;
  }

  function cancelPending(error: () => DataError) {
    for (const operation of [...pending]) operation.cancel(error());
  }

  function schedule(dueAt: number, work: Work<State, void>) {
    return scheduler.schedule(dueAt, () => commit(work));
  }

  function setConnection(next: ConnectionState) {
    if (next === connection) return;
    connection = next;
    // A subscription lasts one connection, as the realtime contract says.
    if (next === 'disconnected') events.clear();
    watchers.publish(next);
  }

  const simulator: Simulator<State> = {
    clock,
    get state() {
      return state;
    },

    run<Result>(operation: string, work: Work<State, Result>, { signal }: { signal?: AbortSignal } = {}): Promise<Result> {
      if (disposed) return Promise.reject(new DataSourceUnavailableError('The mock data source was disposed.'));
      if (signal?.aborted) return Promise.reject(abortedError());
      if (connection === 'disconnected') return Promise.reject(networkError());

      const delay = latencyRandom.int(latency.min, latency.max);
      return new Promise<Result>((resolve, reject) => {
        const finish = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          pending.delete(entry);
        };
        const entry: PendingOperation = {
          cancel: (error) => {
            finish();
            reject(error);
          },
        };
        const onAbort = () => entry.cancel(abortedError());
        const timer = setTimeout(() => {
          finish();
          try {
            resolve(execute(operation, work));
          } catch (error) {
            reject(error);
          }
        }, delay);
        pending.add(entry);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },

    schedule,
    subscribe: (listener) => events.subscribe(listener),

    watchConnection(listener) {
      listener(connection);
      return watchers.subscribe(listener);
    },

    setConnection,

    failNext(failure, operation) {
      failures.push({ operation, failure });
    },

    advanceTime(ms) {
      clock.advance(ms);
      scheduler.processDue();
    },

    resume: () => scheduler.processDue(),

    reset() {
      if (disposed) return;
      cancelPending(() => new DataError('network', 'The mock data source was reset.'));
      scheduler.clear();
      events.clear();
      receipts.clear();
      failures.length = 0;
      clock.reset();
      ids.reset();
      latencyRandom.reset();
      worldRandom.reset();
      state = buildState();
      options.activate?.(simulator);
      setConnection('connected');
    },

    dispose() {
      if (disposed) return;
      cancelPending(() => new DataSourceUnavailableError('The mock data source was disposed.'));
      scheduler.clear();
      events.clear();
      watchers.clear();
      receipts.clear();
      failures.length = 0;
      disposed = true;
    },

    stats: () => ({
      pendingOperations: pending.size,
      scheduledTasks: scheduler.pendingCount(),
      eventListeners: events.listenerCount(),
      connectionWatchers: watchers.listenerCount(),
      receipts: receipts.size(),
      queuedFailures: failures.length,
    }),
  };

  options.activate?.(simulator);
  return simulator;
}
