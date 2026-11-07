import type { SessionController, SessionState } from './createSessionController';

/**
 * A protected action an anonymous rider started, kept while they sign in
 * (`docs/api/authentication.md`, protected-action continuation).
 *
 * It is plain data naming what to resume, never a callback or a payload to send: the screen that
 * owns the action keeps its own draft (destination, departure, message text) and, after sign-in,
 * reads the target again and shows its final confirmation. Nothing is created, joined or sent
 * because sign-in succeeded.
 */
export type ProtectedIntent = Readonly<
  | { kind: 'create-request' }
  | { kind: 'join-ride'; rideId: string }
  | { kind: 'join-group'; groupId: string }
  | { kind: 'send-message'; groupId: string }
>;

export type ProtectedIntentKind = ProtectedIntent['kind'];

/**
 * - `none`: nothing waits.
 * - `awaiting-sign-in`: the rider is signing in for `intent`.
 * - `ready`: they signed in; the owning screen takes `intent` and resumes it.
 */
export type PendingIntentState = Readonly<
  | { status: 'none' }
  | { status: 'awaiting-sign-in'; intent: ProtectedIntent }
  | { status: 'ready'; intent: ProtectedIntent }
>;

/**
 * Holds at most one {@link ProtectedIntent} across sign-in and hands it back afterwards.
 *
 * - `require` lets a signed-in rider proceed at once; otherwise it keeps the intent, replacing an
 *   older one, and the caller opens sign-in.
 * - Signing in makes the intent `ready`. An expired session puts a `ready` intent back to
 *   `awaiting-sign-in`, for the next sign-in. A sign-out or a demo reset drops it, because its
 *   target may no longer exist for anyone.
 * - `cancel` (sign-in left without signing in) drops a waiting intent: the rider is back to
 *   browsing, with their draft but nothing to resume.
 * - `take` gives a `ready` intent of one kind to the screen that owns it, once.
 */
export type PendingIntentGate = {
  getState(): PendingIntentState;
  /** Calls `listener` after every change, until the returned function is called. */
  subscribe(listener: () => void): () => void;
  /**
   * `proceed` when a rider is signed in; otherwise keeps `intent` and returns `sign-in-required`,
   * and the caller opens sign-in.
   */
  require(intent: ProtectedIntent): 'proceed' | 'sign-in-required';
  /** Sign-in was left without signing in: forgets a waiting intent. */
  cancel(): void;
  /** Returns the `ready` intent if it is of `kind` and forgets it; otherwise `null`. */
  take<Kind extends ProtectedIntentKind>(kind: Kind): Extract<ProtectedIntent, { kind: Kind }> | null;
  /** Stops following the session. */
  dispose(): void;
};

const NONE: PendingIntentState = Object.freeze({ status: 'none' });

/** Builds the gate for `session`. */
export function createPendingIntentGate(session: Pick<SessionController, 'getState' | 'subscribe'>): PendingIntentGate {
  let state: PendingIntentState = NONE;
  let lastSession: SessionState = session.getState();
  const listeners = new Set<() => void>();

  function setState(next: PendingIntentState) {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  const stop = session.subscribe(() => {
    const next = session.getState();
    const previous = lastSession;
    lastSession = next;
    if (next === previous) return;
    if (next.status === 'signed-in') {
      if (state.status === 'awaiting-sign-in') setState(Object.freeze({ status: 'ready', intent: state.intent }));
    } else if (next.status === 'signed-out') {
      if (next.reason === 'expired') {
        if (state.status === 'ready') setState(Object.freeze({ status: 'awaiting-sign-in', intent: state.intent }));
      } else if (next.reason !== 'none') {
        setState(NONE);
      }
    }
  });

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    require(intent) {
      if (session.getState().status === 'signed-in') return 'proceed';
      setState(Object.freeze({ status: 'awaiting-sign-in', intent }));
      return 'sign-in-required';
    },

    cancel() {
      if (state.status === 'awaiting-sign-in') setState(NONE);
    },

    take(kind) {
      if (state.status !== 'ready' || state.intent.kind !== kind) return null;
      const { intent } = state;
      setState(NONE);
      return intent as Extract<ProtectedIntent, { kind: typeof kind }>;
    },

    dispose() {
      stop();
      listeners.clear();
    },
  };
}

/**
 * What the sign-in screens say about the kept intent, so the rider knows nothing is lost and
 * nothing happens without them; `null` when nothing waits.
 */
export function describeIntent(intent: ProtectedIntent | null): string | null {
  if (intent === null) return null;
  switch (intent.kind) {
    case 'create-request':
      return 'Your ride plan is saved while you sign in. You review it before it is created.';
    case 'join-ride':
      return 'After sign-in, the ride is checked again and you confirm before joining.';
    case 'join-group':
      return 'After sign-in, the group is checked again and you confirm before joining.';
    case 'send-message':
      return 'Your message is kept. It is not sent until you send it.';
  }
}
