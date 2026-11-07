import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSessionController } from './AuthSessionProvider';
import type { SessionState } from './createSessionController';

/**
 * Opens the session-ended screen (design 31) when a session ends as `expired`: a refresh the
 * source refused, or a stored session it no longer accepts at launch. A sign-out, a demo reset or
 * a launch without a session opens nothing. Renders nothing; the root layout mounts it once.
 */
export function SessionExpiryRedirect() {
  const session = useSessionController();
  const router = useRouter();

  useEffect(() => {
    let previous: SessionState = session.getState();
    return session.subscribe(() => {
      const next = session.getState();
      const wasActive = previous.status === 'signed-in' || previous.status === 'restoring';
      previous = next;
      if (wasActive && next.status === 'signed-out' && next.reason === 'expired') {
        router.push('/auth/session-ended');
      }
    });
  }, [session, router]);

  return null;
}
