import type { DomainEventDto } from '@ride-match/contracts';

import type { ConnectionState } from '../src/data/AppDataSource';
import { DataError, DataSourceUnavailableError } from '../src/data/errors';
import { createSimulatedClock } from '../src/data/mock/clock';
import { createEmitter } from '../src/data/mock/events';
import { createIdGenerator } from '../src/data/mock/ids';
import { createSeededRandom } from '../src/data/mock/random';
import { createReceiptStore } from '../src/data/mock/receipts';
import { createScheduler } from '../src/data/mock/scheduler';
import { createSimulator, type Simulator, type SimulatorOptions, type WorkContext } from '../src/data/mock/simulator';

const START = Date.parse('2026-11-01T09:00:00.000Z');

// A minimal synthetic world: a seat count and a log of what happened, in order.
type World = { seats: number; log: string[] };
const createWorld = (): World => ({ seats: 1, log: [] });

/** A valid user event for the synthetic rider A, so emitted events satisfy the contract type. */
const matchesChanged = (context: WorkContext<World>, version: number): DomainEventDto => ({
  ...context.eventEnvelope(),
  type: 'matches.changed',
  audience: { kind: 'user', userId: 'user_rider_a' },
  payload: { rideRequestId: 'ride_1', version },
});

let simulators: Simulator<World>[] = [];
function simulator(overrides: Partial<SimulatorOptions<World>> = {}) {
  const created = createSimulator<World>({ seed: 'active-neighborhood', createState: createWorld, ...overrides });
  simulators.push(created);
  return created;
}

/** Records how a promise settles without awaiting it, so tests can check before and after time passes. */
function track<Value>(promise: Promise<Value>) {
  const outcome: { settled: boolean; value?: Value; error?: unknown } = { settled: false };
  promise.then(
    (value) => Object.assign(outcome, { settled: true, value }),
    (error: unknown) => Object.assign(outcome, { settled: true, error }),
  );
  return outcome;
}

/** Runs `count` operations one after another and returns each one's simulated latency. */
async function latencies(target: Simulator<World>, count: number): Promise<number[]> {
  const measured: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = target.clock.now();
    const done = track(target.run('test.read', (context) => context.now));
    await jest.advanceTimersByTimeAsync(700);
    measured.push((done.value as number) - startedAt);
  }
  return measured;
}

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  // Disposing every simulator must leave nothing behind.
  for (const created of simulators) created.dispose();
  simulators = [];
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('createSeededRandom', () => {
  it('repeats its sequence for a seed, and restarts it on reset', () => {
    const first = createSeededRandom('seed-a');
    const second = createSeededRandom('seed-a');
    const sequence = Array.from({ length: 10 }, () => first.next());

    expect(Array.from({ length: 10 }, () => second.next())).toEqual(sequence);
    first.reset();
    expect(Array.from({ length: 10 }, () => first.next())).toEqual(sequence);
    expect(Array.from({ length: 10 }, () => createSeededRandom('seed-b').next())).not.toEqual(sequence);
  });

  it('draws whole numbers within the inclusive range', () => {
    const random = createSeededRandom('range');
    const draws = Array.from({ length: 2000 }, () => random.int(200, 700));

    expect(Math.min(...draws)).toBe(200);
    expect(Math.max(...draws)).toBe(700);
    expect(draws.every(Number.isInteger)).toBe(true);
  });
});

describe('createIdGenerator', () => {
  it('counts per prefix and restarts on reset', () => {
    const ids = createIdGenerator();

    expect([ids.next('ride'), ids.next('ride'), ids.next('group')]).toEqual(['ride_1', 'ride_2', 'group_1']);
    ids.reset();
    expect(ids.next('ride')).toBe('ride_1');
  });
});

describe('createSimulatedClock', () => {
  it('follows real time plus the advanced offset', () => {
    const clock = createSimulatedClock();

    expect(clock.nowIso()).toBe('2026-11-01T09:00:00.000Z');
    jest.advanceTimersByTime(1000);
    clock.advance(60_000);
    expect(clock.now()).toBe(START + 61_000);
    clock.reset();
    expect(clock.now()).toBe(START + 1000);
    expect(() => clock.advance(-1)).toThrow(RangeError);
  });
});

describe('createScheduler', () => {
  it('runs a task when its time comes, not before', () => {
    const scheduler = createScheduler(createSimulatedClock());
    const ran: string[] = [];
    scheduler.schedule(START + 8000, () => ran.push('ride appears'));

    jest.advanceTimersByTime(7999);
    expect(ran).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(ran).toEqual(['ride appears']);
    expect(scheduler.pendingCount()).toBe(0);
  });

  it('catches up after background time: every overdue task once, in due order', () => {
    const scheduler = createScheduler(createSimulatedClock());
    const ran: string[] = [];
    scheduler.schedule(START + 20_000, () => ran.push('expiry'));
    scheduler.schedule(START + 8000, () => ran.push('first'));
    scheduler.schedule(START + 8000, () => ran.push('second at the same time'));
    scheduler.schedule(START + 90_000, () => ran.push('later'));

    // The operating system suspended timers: time passed, but no timer fired.
    jest.setSystemTime(START + 30_000);
    scheduler.processDue();

    expect(ran).toEqual(['first', 'second at the same time', 'expiry']);
    expect(scheduler.pendingCount()).toBe(1);
    scheduler.clear();
  });

  it('runs, in the same pass, an overdue task that a task schedules', () => {
    const clock = createSimulatedClock();
    const scheduler = createScheduler(clock);
    const ran: string[] = [];
    scheduler.schedule(START + 1000, () => {
      ran.push('group fills');
      scheduler.schedule(START + 2000, () => ran.push('group closes'));
    });

    jest.setSystemTime(START + 5000);
    scheduler.processDue();

    expect(ran).toEqual(['group fills', 'group closes']);
  });

  it('cancels a task, and clear leaves no timer', () => {
    const scheduler = createScheduler(createSimulatedClock());
    const ran: string[] = [];
    const cancel = scheduler.schedule(START + 1000, () => ran.push('cancelled'));
    scheduler.schedule(START + 2000, () => ran.push('kept'));

    cancel();
    cancel();
    jest.advanceTimersByTime(2000);
    expect(ran).toEqual(['kept']);

    scheduler.schedule(START + 9000, () => ran.push('cleared'));
    scheduler.clear();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('removes a task that throws before its error propagates', () => {
    const scheduler = createScheduler(createSimulatedClock());
    const ran: string[] = [];
    scheduler.schedule(START + 1000, () => {
      throw new Error('broken task');
    });
    scheduler.schedule(START + 1000, () => ran.push('next'));

    jest.setSystemTime(START + 1000);
    expect(() => scheduler.processDue()).toThrow('broken task');
    scheduler.processDue();
    expect(ran).toEqual(['next']);
    expect(scheduler.pendingCount()).toBe(0);
  });
});

describe('createEmitter', () => {
  it('delivers in order, and unsubscribing is idempotent', () => {
    const emitter = createEmitter<string>();
    const received: string[] = [];
    const stopFirst = emitter.subscribe((event) => received.push(`first ${event}`));
    emitter.subscribe((event) => received.push(`second ${event}`));

    emitter.publish('a');
    stopFirst();
    stopFirst();
    emitter.publish('b');

    expect(received).toEqual(['first a', 'second a', 'second b']);
    emitter.clear();
    expect(emitter.listenerCount()).toBe(0);
  });

  it('delivers the current event to listeners removed during its delivery', () => {
    const emitter = createEmitter<string>();
    const received: string[] = [];
    let stopSecond = () => {};
    emitter.subscribe(() => stopSecond());
    stopSecond = emitter.subscribe((event) => received.push(event));

    emitter.publish('a');
    emitter.publish('b');

    expect(received).toEqual(['a']);
  });
});

describe('createReceiptStore', () => {
  const conflict = () => new Error('IDEMPOTENCY_CONFLICT');
  const key = { actorId: 'user_rider_a', operationId: '00000000-0000-4000-8000-000000000001' };

  it('performs once and returns copies of the original result to retries', () => {
    const receipts = createReceiptStore(conflict);
    const perform = jest.fn(() => ({ id: 'ride_1', version: 1 }));

    const first = receipts.once(key, { operation: 'rides.create', input: { a: 1, b: 2 } }, perform);
    first.version = 99;
    const retry = receipts.once(key, { operation: 'rides.create', input: { b: 2, a: 1 } }, perform);

    expect(perform).toHaveBeenCalledTimes(1);
    expect(retry).toEqual({ id: 'ride_1', version: 1 });
  });

  it.each([
    ['another input', { operation: 'rides.create', input: { a: 2 } }],
    ['another operation', { operation: 'rides.cancel', input: { a: 1 } }],
  ])('rejects the same key with %s', (_label, request) => {
    const receipts = createReceiptStore(conflict);
    receipts.once(key, { operation: 'rides.create', input: { a: 1 } }, () => 'done');

    expect(() => receipts.once(key, request, () => 'again')).toThrow('IDEMPOTENCY_CONFLICT');
  });

  it('scopes keys by actor, stores no failure, and keeps an empty result', () => {
    const receipts = createReceiptStore(conflict);
    const request = { operation: 'auth.logout', input: {} };

    expect(() =>
      receipts.once(key, request, () => {
        throw new Error('refused');
      }),
    ).toThrow('refused');
    expect(receipts.size()).toBe(0);

    expect(receipts.once(key, request, () => undefined)).toBeUndefined();
    expect(receipts.once({ ...key, actorId: 'user_rider_b' }, { operation: 'other', input: 1 }, () => 'b')).toBe('b');
    expect(receipts.size()).toBe(2);
  });
});

describe('simulator latency', () => {
  it('repeats the seeded latencies, within the default range, and restarts them on reset', async () => {
    const first = simulator();
    const measured = await latencies(first, 5);

    expect(await latencies(simulator(), 5)).toEqual(measured);
    expect(measured.every((delay) => delay >= 200 && delay <= 700)).toBe(true);
    expect(await latencies(simulator({ seed: 'empty-neighborhood' }), 5)).not.toEqual(measured);

    first.reset();
    expect(await latencies(first, 5)).toEqual(measured);
  });

  it('answers only after the latency has passed', async () => {
    const target = simulator({ latencyMs: { min: 300, max: 300 } });
    const done = track(target.run('test.read', () => 'answer'));

    await jest.advanceTimersByTimeAsync(299);
    expect(done.settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(done.value).toBe('answer');
  });
});

describe('simulator operations', () => {
  const fixed = { latencyMs: { min: 300, max: 300 } };

  it('publishes the work’s events only after it completes', async () => {
    const target = simulator(fixed);
    const received: DomainEventDto[] = [];
    target.subscribe((event) => received.push(event));

    const done = track(
      target.run('groups.join', (context) => {
        context.state.seats -= 1;
        context.emit(matchesChanged(context, 2));
        expect(received).toEqual([]);
        return 'joined';
      }),
    );
    await jest.advanceTimersByTimeAsync(300);

    expect(done.value).toBe('joined');
    expect(received).toEqual([
      {
        id: 'evt_1',
        schemaVersion: 1,
        occurredAt: '2026-11-01T09:00:00.300Z',
        type: 'matches.changed',
        audience: { kind: 'user', userId: 'user_rider_a' },
        payload: { rideRequestId: 'ride_1', version: 2 },
      },
    ]);
  });

  it('publishes nothing when the work refuses, and rejects with its source error', async () => {
    const target = simulator(fixed);
    const received: DomainEventDto[] = [];
    target.subscribe((event) => received.push(event));

    const done = track(
      target.run('groups.join', (context) => {
        context.emit(matchesChanged(context, 2));
        if (context.state.seats === 1) throw context.sourceError('GROUP_FULL', 'The group is full.');
        return 'joined';
      }),
    );
    await jest.advanceTimersByTimeAsync(300);

    expect(received).toEqual([]);
    expect(done.error).toBeInstanceOf(DataError);
    expect((done.error as DataError).body).toEqual({ code: 'GROUP_FULL', message: 'The group is full.', requestId: 'req_1' });
  });

  it('applies tasks that became due in the background before the work reads the world', async () => {
    const target = simulator(fixed);
    target.schedule(START + 10_000, (context) => {
      context.state.log.push('expired');
    });

    // Timers were suspended for a minute; only the operation's own latency timer runs.
    jest.setSystemTime(START + 60_000);
    const done = track(target.run('rides.getOwnRequest', (context) => [...context.state.log]));
    await jest.advanceTimersByTimeAsync(300);

    expect(done.value).toEqual(['expired']);
  });

  it('catches up on foreground return and when simulated time advances', () => {
    const target = simulator(fixed);
    target.schedule(START + 10_000, (context) => {
      context.state.log.push('first');
    });
    target.schedule(START + 120_000, (context) => {
      context.state.log.push('second');
    });

    jest.setSystemTime(START + 15_000);
    target.resume();
    expect(target.state.log).toEqual(['first']);

    target.advanceTime(120_000);
    expect(target.state.log).toEqual(['first', 'second']);
    expect(target.stats().scheduledTasks).toBe(0);
  });
});

describe('simulator connection and failures', () => {
  const fixed = { latencyMs: { min: 300, max: 300 } };

  it('fails at once while disconnected, and ends subscriptions when the connection drops', async () => {
    const target = simulator(fixed);
    const states: ConnectionState[] = [];
    target.watchConnection((state) => states.push(state));
    target.subscribe(() => {});

    target.setConnection('disconnected');
    target.setConnection('disconnected');
    const work = jest.fn();
    const done = track(target.run('places.search', work));
    await Promise.resolve();

    expect((done.error as DataError).kind).toBe('network');
    expect(work).not.toHaveBeenCalled();
    expect(target.stats().eventListeners).toBe(0);

    target.setConnection('connected');
    expect(states).toEqual(['connected', 'disconnected', 'connected']);
  });

  it('fails without changing anything when the connection drops during the latency', async () => {
    const target = simulator(fixed);
    const work = jest.fn();
    const done = track(target.run('rides.create', work));

    await jest.advanceTimersByTimeAsync(100);
    target.setConnection('disconnected');
    await jest.advanceTimersByTimeAsync(200);

    expect((done.error as DataError).kind).toBe('network');
    expect(work).not.toHaveBeenCalled();
  });

  it('loses the request before the source, then succeeds on retry', async () => {
    const target = simulator(fixed);
    target.failNext({ kind: 'network' });
    const join = (context: WorkContext<World>) => {
      context.state.seats -= 1;
      return context.state.seats;
    };

    const lost = track(target.run('groups.join', join));
    await jest.advanceTimersByTimeAsync(300);
    expect((lost.error as DataError).kind).toBe('network');
    expect(target.state.seats).toBe(1);

    const retry = track(target.run('groups.join', join));
    await jest.advanceTimersByTimeAsync(300);
    expect(retry.value).toBe(0);
  });

  it('loses only the answer after committing, so a retry with the same operation ID finds the original result', async () => {
    const target = simulator(fixed);
    target.failNext({ kind: 'network', afterCommit: true }, 'groups.join');
    const join = (context: WorkContext<World>) =>
      context.receipts.once(
        { actorId: 'user_rider_a', operationId: '00000000-0000-4000-8000-000000000002' },
        { operation: 'groups.join', input: { targetId: 'group_1' } },
        () => {
          context.state.seats -= 1;
          return { seatsLeft: context.state.seats };
        },
      );

    const lost = track(target.run('groups.join', join));
    await jest.advanceTimersByTimeAsync(300);
    expect((lost.error as DataError).kind).toBe('network');
    expect(target.state.seats).toBe(0);

    const retry = track(target.run('groups.join', join));
    await jest.advanceTimersByTimeAsync(300);
    expect(retry.value).toEqual({ seatsLeft: 0 });
    expect(target.state.seats).toBe(0);
  });

  it('matches failures to their operation, in order, and refuses with a chosen code', async () => {
    const target = simulator(fixed);
    target.failNext({ kind: 'source', code: 'SERVICE_UNAVAILABLE' }, 'rides.create');
    target.failNext({ kind: 'network' });

    const search = track(target.run('places.search', () => 'places'));
    await jest.advanceTimersByTimeAsync(300);
    const create = track(target.run('rides.create', () => 'ride'));
    await jest.advanceTimersByTimeAsync(300);
    const again = track(target.run('rides.create', () => 'ride'));
    await jest.advanceTimersByTimeAsync(300);

    expect((search.error as DataError).kind).toBe('network');
    expect((create.error as DataError).code).toBe('SERVICE_UNAVAILABLE');
    expect(again.value).toBe('ride');
    expect(target.stats().queuedFailures).toBe(0);
  });

  it('cancels an aborted read without running it or leaving its timer', async () => {
    const target = simulator(fixed);
    const work = jest.fn();
    const controller = new AbortController();

    const done = track(target.run('rides.getNearby', work, { signal: controller.signal }));
    await jest.advanceTimersByTimeAsync(100);
    controller.abort();
    await Promise.resolve();

    expect((done.error as DataError).kind).toBe('aborted');
    expect(target.stats().pendingOperations).toBe(0);
    await jest.advanceTimersByTimeAsync(300);
    expect(work).not.toHaveBeenCalled();

    const early = track(target.run('rides.getNearby', work, { signal: controller.signal }));
    await Promise.resolve();
    expect((early.error as DataError).kind).toBe('aborted');
  });
});

describe('simulator reset and disposal', () => {
  /** Schedules a scenario event 8 seconds after activation, as a seed would. */
  const activate = (target: Simulator<World>) => {
    target.schedule(target.clock.now() + 8000, (context) => {
      context.state.log.push('ride appears');
    });
  };

  it('starts the scenario over', async () => {
    const target = simulator({ activate, latencyMs: { min: 300, max: 300 } });
    const states: ConnectionState[] = [];
    target.watchConnection((state) => states.push(state));
    target.advanceTime(5000);
    const write = track(
      target.run('test.write', (context) =>
        context.receipts.once({ actorId: 'user_rider_a', operationId: 'op_1' }, { operation: 'test.write', input: {} }, () => {
          context.state.seats = 0;
          return context.ids.next('ride');
        }),
      ),
    );
    await jest.advanceTimersByTimeAsync(300);
    expect(write.value).toBe('ride_1');
    target.subscribe(() => {});
    target.failNext({ kind: 'network' });
    target.setConnection('disconnected');
    target.setConnection('connected');
    target.subscribe(() => {});
    const pending = track(target.run('rides.create', () => 'never'));

    target.reset();
    await Promise.resolve();

    expect((pending.error as DataError).message).toBe('The mock data source was reset.');
    expect(target.state).toEqual({ seats: 1, log: [] });
    expect(target.clock.now()).toBe(Date.now());
    expect(target.stats()).toEqual({
      pendingOperations: 0,
      scheduledTasks: 1,
      eventListeners: 0,
      connectionWatchers: 1,
      receipts: 0,
      queuedFailures: 0,
    });
    const fresh = track(target.run('test.write', (context) => context.ids.next('ride')));
    await jest.advanceTimersByTimeAsync(300);
    expect(fresh.value).toBe('ride_1');
  });

  it('accumulates no timers, tasks or listeners over repeated resets', () => {
    const target = simulator({ activate });
    const stats = [];

    for (let round = 0; round < 10; round += 1) {
      target.subscribe(() => {});
      target.schedule(target.clock.now() + 60_000, () => {});
      void target.run('test.read', () => 'late').catch(() => {});
      target.reset();
      stats.push(target.stats());
    }

    expect(new Set(stats.map((entry) => JSON.stringify(entry))).size).toBe(1);
    expect(stats[0]).toMatchObject({ pendingOperations: 0, scheduledTasks: 1, eventListeners: 0 });
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(8000);
    expect(target.state.log).toEqual(['ride appears']);
  });

  it('releases everything on disposal and refuses later operations', async () => {
    const target = simulator({ activate });
    target.watchConnection(() => {});
    target.subscribe(() => {});
    const pending = track(target.run('rides.create', () => 'never'));

    target.dispose();
    target.dispose();
    target.reset();
    await Promise.resolve();

    expect(pending.error).toBeInstanceOf(DataSourceUnavailableError);
    expect(target.stats()).toEqual({
      pendingOperations: 0,
      scheduledTasks: 0,
      eventListeners: 0,
      connectionWatchers: 0,
      receipts: 0,
      queuedFailures: 0,
    });
    expect(jest.getTimerCount()).toBe(0);
    await expect(target.run('places.search', () => 'places')).rejects.toBeInstanceOf(DataSourceUnavailableError);
  });
});
