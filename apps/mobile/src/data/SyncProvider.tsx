import type { SubscriptionRequest } from '@ride-match/contracts';
import { createContext, use, useEffect, useRef, type ReactNode } from 'react';

import type { SubscriptionErrorListener, SyncCoordinator } from './createSyncCoordinator';

const SyncContext = createContext<SyncCoordinator | null>(null);

type SyncProviderProps = {
  /** The app's one sync coordinator, built by the composition root. */
  coordinator: SyncCoordinator;
  children: ReactNode;
};

/** Makes the sync coordinator available to {@link useEventSubscription}. */
export function SyncProvider({ coordinator, children }: SyncProviderProps) {
  return <SyncContext value={coordinator}>{children}</SyncContext>;
}

/**
 * Keeps a realtime subscription live while the calling component is mounted and `request` is
 * not `null`; its events update the cached reads. A new request (compared by value, such as a
 * moved viewport) replaces the previous one. `onError` receives a refusal; the latest callback
 * is used without resubscribing.
 *
 * @throws {Error} Outside a {@link SyncProvider}, which is a programming error.
 */
export function useEventSubscription(request: SubscriptionRequest | null, onError?: SubscriptionErrorListener): void {
  const coordinator = use(SyncContext);
  if (coordinator === null) throw new Error('useEventSubscription() must be called inside a SyncProvider.');
  const latestOnError = useRef(onError);
  useEffect(() => {
    latestOnError.current = onError;
  });
  const key = request === null ? null : JSON.stringify(request);

  useEffect(() => {
    if (key === null) return undefined;
    return coordinator.watch(JSON.parse(key) as SubscriptionRequest, (error) => latestOnError.current?.(error));
  }, [coordinator, key]);
}
