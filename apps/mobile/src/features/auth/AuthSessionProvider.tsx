import { createContext, use, useSyncExternalStore, type ReactNode } from 'react';

import type { SessionController, SessionState } from './createSessionController';

const SessionContext = createContext<SessionController | null>(null);

type AuthSessionProviderProps = {
  /** The app's one session controller, built by the composition root. */
  controller: SessionController;
  children: ReactNode;
};

/** Makes the session controller available to `useSessionController()` and `useSessionState()`. */
export function AuthSessionProvider({ controller, children }: AuthSessionProviderProps) {
  return <SessionContext value={controller}>{children}</SessionContext>;
}

/**
 * Returns the session controller, for signing in and out. Feature code never reads tokens from
 * it; the data source does.
 *
 * @throws {Error} Outside an {@link AuthSessionProvider}, which is a programming error.
 */
export function useSessionController(): SessionController {
  const controller = use(SessionContext);
  if (controller === null) throw new Error('useSessionController() must be called inside an AuthSessionProvider.');
  return controller;
}

/** Returns the current session state and re-renders when it changes. */
export function useSessionState(): SessionState {
  const controller = useSessionController();
  return useSyncExternalStore(controller.subscribe, controller.getState);
}
