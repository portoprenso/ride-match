import { useRouter } from 'expo-router';
import { createContext, use, useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';

import type { PendingIntentGate, PendingIntentState, ProtectedIntent, ProtectedIntentKind } from './pendingIntent';

const GateContext = createContext<PendingIntentGate | null>(null);

/** Makes the app's one pending-intent gate available to the hooks below. */
export function PendingIntentProvider({ gate, children }: { gate: PendingIntentGate; children: ReactNode }) {
  return <GateContext value={gate}>{children}</GateContext>;
}

/**
 * Returns the pending-intent gate.
 *
 * @throws {Error} Outside a {@link PendingIntentProvider}, which is a programming error.
 */
export function usePendingIntentGate(): PendingIntentGate {
  const gate = use(GateContext);
  if (gate === null) throw new Error('usePendingIntentGate() must be called inside a PendingIntentProvider.');
  return gate;
}

/** Returns the gate's state and re-renders when it changes. */
export function usePendingIntent(): PendingIntentState {
  const gate = usePendingIntentGate();
  return useSyncExternalStore(gate.subscribe, gate.getState);
}

/**
 * Returns the check a protected action runs first. It answers `true` when a rider is signed in, so
 * the action goes on to its own confirmation. Otherwise it keeps `intent`, opens sign-in and
 * answers `false`; the screen keeps its draft and resumes through {@link useResumeIntent}.
 */
export function useRequireSignIn(): (intent: ProtectedIntent) => boolean {
  const gate = usePendingIntentGate();
  const router = useRouter();
  return useCallback(
    (intent) => {
      if (gate.require(intent) === 'proceed') return true;
      router.push('/auth/phone');
      return false;
    },
    [gate, router],
  );
}

/**
 * Hands the owning screen its intent of `kind` once the rider has signed in for it. `onResume`
 * must read the target again and show the action's final confirmation; it never performs the
 * action itself (`docs/api/authentication.md`, protected-action continuation).
 */
export function useResumeIntent<Kind extends ProtectedIntentKind>(
  kind: Kind,
  onResume: (intent: Extract<ProtectedIntent, { kind: Kind }>) => void,
): void {
  const gate = usePendingIntentGate();
  const state = usePendingIntent();
  const latest = useRef(onResume);
  useEffect(() => {
    latest.current = onResume;
  });
  useEffect(() => {
    if (state.status !== 'ready' || state.intent.kind !== kind) return;
    const intent = gate.take(kind);
    if (intent !== null) latest.current(intent);
  }, [gate, kind, state]);
}
