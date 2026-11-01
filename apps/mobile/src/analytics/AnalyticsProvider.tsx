import { createContext, use, type ReactNode } from 'react';

import type { Analytics } from './createAnalytics';

const AnalyticsContext = createContext<Analytics | null>(null);

type AnalyticsProviderProps = {
  /** The app's one analytics client; whoever creates it starts and disposes it. */
  analytics: Analytics;
  children: ReactNode;
};

/** Makes the analytics client available to `useAnalytics()` below it. */
export function AnalyticsProvider({ analytics, children }: AnalyticsProviderProps) {
  return <AnalyticsContext value={analytics}>{children}</AnalyticsContext>;
}

/**
 * Returns the analytics client. Features track catalog events through it and never choose a
 * sink or a vendor.
 *
 * @throws {Error} Outside an {@link AnalyticsProvider}, which is a programming error.
 */
export function useAnalytics(): Analytics {
  const analytics = use(AnalyticsContext);
  if (analytics === null) throw new Error('useAnalytics() must be called inside an AnalyticsProvider.');
  return analytics;
}
