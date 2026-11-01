import type { AppDataSource } from './AppDataSource';
import { DataSourceUnavailableError } from './errors';

/**
 * Builds a data source in which nothing is available yet: every operation and subscription
 * rejects with a {@link DataSourceUnavailableError} carrying `message`, and the connection
 * reports `disconnected`. It holds no data and no users, so it can never pass for real or
 * synthetic activity.
 *
 * The mock data source reuses it for the operations whose cards have not landed yet.
 *
 * @param message Why the operations are unavailable, shown with each rejection.
 */
export function createUnavailableDataSource(message: string): AppDataSource {
  const reject = () => Promise.reject(new DataSourceUnavailableError(message));

  return {
    auth: { requestOtp: reject, verifyOtp: reject, refreshSession: reject, logout: reject, getCurrentUser: reject },
    places: { search: reject },
    rides: { getNearby: reject, getRide: reject, getOwnRequest: reject, create: reject, cancel: reject, getMatches: reject },
    groups: { join: reject, getPreview: reject, getGroup: reject, leave: reject, updateStatus: reject },
    chat: { getHistory: reject, send: reject },
    safety: { report: reject, block: reject, unblock: reject, listBlocks: reject },
    devices: { register: reject, remove: reject },
    events: {
      subscribe: reject,
      watchConnection: (listener) => {
        listener('disconnected');
        return () => {};
      },
    },
  };
}
