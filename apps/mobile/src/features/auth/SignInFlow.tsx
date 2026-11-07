import type { OtpChallengeDto } from '@ride-match/contracts';
import { useNavigation } from 'expo-router';
import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useSessionController, useSessionState } from './AuthSessionProvider';
import { usePendingIntentGate } from './PendingIntentProvider';

/** The sign-in flow's state while the auth screens are open, kept in memory only. */
export type SignInFlowState = {
  /** The normalized number the current challenge was requested for; never put in a route. */
  phoneNumber: string | null;
  challenge: OtpChallengeDto | null;
  /** Records a challenge requested for `phoneNumber`. */
  setChallenge(phoneNumber: string, challenge: OtpChallengeDto): void;
  /** Closes the whole sign-in flow, back to the screen it was opened from. */
  leave(): void;
};

const FlowContext = createContext<SignInFlowState | null>(null);

/**
 * Wraps the auth stack. It keeps the number and challenge between the phone and code screens
 * (outside the URL, so the number never reaches navigation state), closes the flow once a rider
 * is signed in, and, when the flow closes any other way (Close, Browse anonymously, a back
 * gesture), tells the pending-intent gate that sign-in was cancelled.
 */
export function SignInFlow({ children }: { children: ReactNode }) {
  const navigation = useNavigation();
  const session = useSessionController();
  const gate = usePendingIntentGate();
  const status = useSessionState().status;
  const [entry, setEntry] = useState<{ phoneNumber: string; challenge: OtpChallengeDto } | null>(null);
  const left = useRef(false);

  const flow = useMemo<SignInFlowState>(
    () => ({
      phoneNumber: entry?.phoneNumber ?? null,
      challenge: entry?.challenge ?? null,
      setChallenge: (phoneNumber, challenge) => setEntry({ phoneNumber, challenge }),
      leave() {
        if (left.current) return;
        left.current = true;
        // The auth stack is one route of the root stack; going back there removes all of it.
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.reset({ index: 0, routes: [{ name: 'index' as never }] });
      },
    }),
    [entry, navigation],
  );

  useEffect(() => {
    if (status === 'signed-in') flow.leave();
  }, [status, flow]);

  useEffect(
    () => () => {
      if (session.getState().status !== 'signed-in') gate.cancel();
    },
    [session, gate],
  );

  return <FlowContext value={flow}>{children}</FlowContext>;
}

/**
 * Returns the sign-in flow.
 *
 * @throws {Error} Outside {@link SignInFlow}, which is a programming error.
 */
export function useSignInFlow(): SignInFlowState {
  const flow = use(FlowContext);
  if (flow === null) throw new Error('useSignInFlow() must be called inside a SignInFlow.');
  return flow;
}
