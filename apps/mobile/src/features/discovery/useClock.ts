import { useEffect, useState } from 'react';

/** How often departure times ("Leaving in 5 min") are worded again. */
export const CLOCK_TICK_MS = 30_000;

/**
 * The device time, updated every `intervalMs` ({@link CLOCK_TICK_MS} unless given; a countdown
 * passes a second), for words that depend on it. Rendering reads this value instead of calling
 * `Date.now()`, so a render stays pure.
 */
export function useClock(intervalMs: number = CLOCK_TICK_MS): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
