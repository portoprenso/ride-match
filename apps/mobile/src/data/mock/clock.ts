/**
 * The simulator's clock: real time plus an offset that the time-advance control adds to.
 *
 * Every expiry and scheduled event reads this clock, never `Date.now()` directly, so advancing
 * it makes deadlines pass at once. In tests, Jest's fake timers control the real time it reads.
 */
export type SimulatedClock = {
  /** Current simulated time, in milliseconds since the epoch. */
  now(): number;
  /** Current simulated time as a contract timestamp, such as `2026-11-01T09:00:00.000Z`. */
  nowIso(): string;
  /** Moves simulated time forward by `ms` (0 or more); time never goes back. */
  advance(ms: number): void;
  /** Removes the advanced offset, back to real time. */
  reset(): void;
};

/**
 * @param readTime Source of real time; `Date.now` unless a test passes its own.
 */
export function createSimulatedClock(readTime: () => number = Date.now): SimulatedClock {
  let offset = 0;
  const now = () => readTime() + offset;

  return {
    now,
    nowIso: () => new Date(now()).toISOString(),
    advance(ms) {
      if (!(ms >= 0)) throw new RangeError('Simulated time can only move forward.');
      offset += ms;
    },
    reset() {
      offset = 0;
    },
  };
}
