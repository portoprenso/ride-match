import { useEffect, useState } from 'react';

import { useDemoTimeAhead } from '../../data/DevControlsProvider';

/** How often departure times ("Leaving in 5 min") are worded again. */
export const CLOCK_TICK_MS = 30_000;

/**
 * The presentation time, updated every `intervalMs` ({@link CLOCK_TICK_MS} unless given; a
 * countdown passes a second). Demo's source-time shift also applies immediately, so deadlines
 * such as closed-chat access expire when its clock advances. Other builds use device time.
 * Rendering reads this value instead of calling `Date.now()`, so a render stays pure.
 */
export function useClock(intervalMs: number = CLOCK_TICK_MS): number {
  const timeAheadMs = useDemoTimeAhead();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now + timeAheadMs;
}
