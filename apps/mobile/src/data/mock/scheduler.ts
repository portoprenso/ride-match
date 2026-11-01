import type { SimulatedClock } from './clock';

/** The longest delay `setTimeout` accepts; a longer one would fire at once. */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

type Task = { id: number; dueAt: number; run: () => void };

/**
 * A queue of tasks due at simulated times, such as a request's expiry or a scenario's
 * "a ride appears after 8 seconds".
 *
 * Tasks run because their time has passed, not because a timer fired. One timer wakes the
 * queue for the earliest task while the app is in the foreground. When the operating system
 * suspends timers in the background, or simulated time jumps ahead, {@link Scheduler.processDue}
 * catches up by running every overdue task in due order. The simulator calls it before each
 * operation and on foreground return.
 */
export type Scheduler = {
  /** Queues `run` for `dueAt` (simulated milliseconds) and returns a function that cancels it. */
  schedule(dueAt: number, run: () => void): () => void;
  /**
   * Runs every task due by now, earliest first and in scheduling order for equal times,
   * including tasks that those tasks schedule for a time already passed. Each task leaves the
   * queue before it runs, so one that throws is not retried; its error propagates.
   */
  processDue(): void;
  /** How many tasks are waiting. */
  pendingCount(): number;
  /** Cancels every task and the wake-up timer. */
  clear(): void;
};

export function createScheduler(clock: SimulatedClock): Scheduler {
  let tasks: Task[] = [];
  let nextId = 1;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function disarm() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function arm() {
    disarm();
    const earliest = tasks[0];
    if (earliest === undefined) return;
    const delay = Math.min(Math.max(earliest.dueAt - clock.now(), 0), MAX_TIMER_DELAY_MS);
    timer = setTimeout(() => {
      timer = null;
      processDue();
    }, delay);
  }

  function processDue() {
    try {
      for (let task = tasks[0]; task !== undefined && task.dueAt <= clock.now(); task = tasks[0]) {
        tasks.shift();
        task.run();
      }
    } finally {
      arm();
    }
  }

  return {
    schedule(dueAt, run) {
      const task: Task = { id: nextId, dueAt, run };
      nextId += 1;
      // Kept sorted by due time, then by scheduling order.
      const index = tasks.findIndex((queued) => queued.dueAt > dueAt);
      tasks.splice(index === -1 ? tasks.length : index, 0, task);
      arm();
      return () => {
        const before = tasks.length;
        tasks = tasks.filter((queued) => queued !== task);
        if (tasks.length !== before) arm();
      };
    },
    processDue,
    pendingCount: () => tasks.length,
    clear() {
      tasks = [];
      disarm();
    },
  };
}
