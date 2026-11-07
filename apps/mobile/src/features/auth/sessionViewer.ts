import { ANONYMOUS_VIEWER, type Viewer } from '../../data/queryKeys';
import type { ViewerSource } from '../../data/createSyncCoordinator';
import type { SessionController, SessionState } from './createSessionController';

/**
 * Who reads as the session: the signed-in rider, or anonymous in every other state (restoring,
 * a failed restore, signed out). Reads keyed by this viewer never mix two riders' data.
 */
export function viewerOfSession(state: SessionState): Viewer {
  return state.status === 'signed-in' ? { kind: 'user', userId: state.user.id } : ANONYMOUS_VIEWER;
}

/** The session as the sync coordinator's {@link ViewerSource}. */
export function sessionViewerSource(session: SessionController): ViewerSource {
  return {
    getViewer: () => viewerOfSession(session.getState()),
    subscribe: (listener) => session.subscribe(listener),
  };
}
