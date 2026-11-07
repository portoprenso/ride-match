import { useEffect, useState } from 'react';

/** How often departure times ("Leaving in 5 min") are worded again. */
export const CLOCK_TICK_MS = 30_000;

/**
 * The device time, updated every {@link CLOCK_TICK_MS}, for words that depend on it. Rendering
 * reads this value instead of calling `Date.now()`, so a render stays pure.
 */
export function useClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
