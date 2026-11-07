import { useCallback, useSyncExternalStore } from 'react';

import type { ConnectionState } from './AppDataSource';
import { useDataSource } from './DataSourceProvider';

/**
 * The data source's realtime connection, for screens that must say when what they show may be
 * out of date. While `disconnected`, reads wait for the connection (the sync coordinator ties
 * Query's online state to it) and live updates stop.
 */
export function useConnectionState(): ConnectionState {
  const events = useDataSource().events;
  const subscribe = useCallback(
    (onChange: () => void) => {
      return events.watchConnection(() => onChange());
    },
    [events],
  );
  const read = useCallback(() => {
    let current: ConnectionState = 'connected';
    // `watchConnection` reports the current state at once, then stops here.
    events.watchConnection((state) => {
      current = state;
    })();
    return current;
  }, [events]);
  return useSyncExternalStore(subscribe, read);
}
