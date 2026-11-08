import type { UserDto, VerifyOtpInput } from '@ride-match/contracts';

import type { AccessTokenSource, AuthOperations } from '../../data/AppDataSource';
import { toDataError, type DataError } from '../../data/errors';
import type { CredentialStore } from '../../platform/secureStorage/credentialStore';

/**
 * Why nobody is signed in:
 *
 * - `none`: nobody signed in on this device, or the stored session was not kept (see
 *   `resumeStoredSession`).
 * - `signed-out`: the rider signed out.
 * - `expired`: the source no longer accepts the session's refresh token, so the rider must sign in
 *   again (screen 31 explains it in AUTH-001-C).
 * - `reset`: the demo controls started a scenario, which signs everyone out of the simulator.
 */
export type SignedOutReason = 'none' | 'signed-out' | 'expired' | 'reset';

/**
 * What the app knows about the session, replaced as a whole on every change. Anonymous browsing
 * works in every state; only `signed-in` sends an access token.
 *
 * - `restoring`: reading and renewing the stored session at launch.
 * - `restore-failed`: a stored session exists but could not be renewed, because the source was
 *   unreachable or the store could not be read. `restore()` tries again; signing in replaces it.
 * - `persisted` is `false` when the refresh token could not be saved, so the session lasts only
 *   until the app closes.
 */
export type SessionState = Readonly<
  | { status: 'restoring' }
  | { status: 'restore-failed' }
  | { status: 'signed-out'; reason: SignedOutReason }
  | { status: 'signed-in'; user: UserDto; persisted: boolean }
>;

/**
 * How signing out went. The rider is signed out locally whatever it says; it reports what could
 * not be confirmed, so the app never presents an unconfirmed revocation as done.
 */
export type SignOutResult = Readonly<{
  /** The source confirmed the session's revocation. */
  revoked: boolean;
  /** Why revocation failed, or `null` when it succeeded or there was no session to revoke. */
  revokeError: DataError | null;
  /** The stored refresh token was removed. */
  storageCleared: boolean;
}>;

/** A session operation was asked for while there is no session to use. */
export class NoSessionError extends Error {
  constructor() {
    super('There is no signed-in session.');
    this.name = 'NoSessionError';
  }
}

export type SessionControllerOptions = {
  auth: AuthOperations;
  store: CredentialStore;
  /**
   * Whether a stored session is renewed at launch. The mock data source passes `false`: its
   * world lives in memory, so a session stored by an earlier launch can never be valid, and the
   * demo namespace is cleared instead (a cold start resets demo credentials).
   */
  resumeStoredSession: boolean;
  /**
   * Runs at the start of a sign-out, while the session still works: the push-device
   * deregistration (NOTIFICATION-001-B). It must not reject; the sign-out continues either way.
   */
  beforeSignOut?: () => Promise<void>;
};

/**
 * The auth session: which rider is signed in and the credentials that prove it.
 *
 * Credential handling (`docs/api/authentication.md`, session lifecycle):
 * - The access token lives only in memory and reaches the data source through
 *   {@link SessionController.getAccessToken}; feature code never sees a token.
 * - The refresh token is kept in memory and in the namespaced {@link CredentialStore}; each
 *   rotation replaces both. Storage writes and removals run one at a time, in call order, so a
 *   write that finishes late can never bring back a token that signing out removed.
 * - Every late result is checked against the session it started in: one that finishes after
 *   signing out, signing in again or a demo reset changes nothing.
 */
export type SessionController = {
  getState(): SessionState;
  /** Calls `listener` after every change, until the returned function is called. */
  subscribe(listener: () => void): () => void;
  /** The current access token, or `null` without a usable session. This is the data source's {@link AccessTokenSource}. */
  getAccessToken: AccessTokenSource;
  /**
   * Restores the stored session: renews it with the stored refresh token and reads the rider.
   * Runs at launch (`restoring`) or after `restore-failed`, otherwise does nothing; concurrent
   * calls share one attempt. Never rejects: the outcome is the new state.
   */
  restore(): Promise<void>;
  /**
   * Exchanges a one-time code for a session and stores its refresh token. Rejects with the
   * source's `DataError` (for example `OTP_INVALID`), leaving the state unchanged.
   *
   * @throws {Error} While a rider is signed in; sign out first.
   */
  signIn(input: VerifyOtpInput): Promise<UserDto>;
  /**
   * Rotates the credentials. Callers that find the access token expired at the same time share
   * one attempt. When the source refuses the refresh token (`REFRESH_TOKEN_INVALID`) the session
   * ends as `expired` and the promise rejects with that error; on a network failure the session
   * stays and the promise rejects, so a later call can try again.
   *
   * @throws {NoSessionError} Without a session.
   */
  refresh(): Promise<void>;
  /**
   * Runs an authenticated operation and, if the source answers `SESSION_EXPIRED`, refreshes once
   * and runs it again. Use it only where running twice is safe: reads, and mutations whose
   * closure keeps the same operation or client-message ID for the retry. Any other failure,
   * including a failed refresh, rejects as it came.
   */
  runAuthenticated<Value>(operation: () => Promise<Value>): Promise<Value>;
  /**
   * Signs out: asks the source to revoke the session while its refresh token is still known,
   * then clears the credentials from memory and storage. The rider is signed out locally even
   * when revocation or storage cleanup fails (offline, keychain error); the result says which
   * parts were confirmed. Waits for a refresh in flight so the newest token is the one revoked.
   * Concurrent calls share one attempt. The `beforeSignOut` option (push-device deregistration)
   * runs first, while the session still works.
   */
  signOut(): Promise<SignOutResult>;
  /**
   * Forgets the session locally without asking the source, after the source itself forgot every
   * session (a demo scenario reset). Resolves with whether the stored token was removed.
   */
  discard(): Promise<boolean>;
  /** Stops notifying listeners and ignores every result still in flight. */
  dispose(): void;
};

/**
 * Builds the session controller. Nothing happens until `restore()` is called, which the root
 * layout does once at launch.
 */
export function createSessionController({
  auth,
  store,
  resumeStoredSession,
  beforeSignOut,
}: SessionControllerOptions): SessionController {
  let state: SessionState = Object.freeze({ status: 'restoring' });
  const listeners = new Set<() => void>();
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  // Incremented whenever the session is replaced or ended; a result from an older one is ignored.
  let epoch = 0;
  let disposed = false;
  let restoring: Promise<void> | null = null;
  let refreshing: Promise<void> | null = null;
  let signingOut: Promise<SignOutResult> | null = null;
  let storageQueue: Promise<unknown> = Promise.resolve();

  function setState(next: SessionState) {
    if (disposed) return;
    state = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  }

  /** Runs a storage call after every earlier one has settled, whatever their outcome. */
  function queueStorage<Value>(work: () => Promise<Value>): Promise<Value> {
    const result = storageQueue.then(work, work);
    storageQueue = result.catch(() => undefined);
    return result;
  }

  /** Saves the refresh token; resolves with whether it was saved. */
  function persist(token: string): Promise<boolean> {
    return queueStorage(() => store.write(token)).then(
      () => true,
      () => false,
    );
  }

  /** Removes the stored token; resolves with whether that succeeded. */
  function clearStored(): Promise<boolean> {
    return queueStorage(() => store.clear()).then(
      () => true,
      () => false,
    );
  }

  /**
   * Ends the session in memory at once, then removes the stored token. A failed removal leaves
   * at most a token the source no longer accepts (or, after an unconfirmed sign-out, one that
   * the next launch's restore renews); the caller reports it where the rider needs to know.
   */
  function endLocally(reason: SignedOutReason): Promise<boolean> {
    epoch += 1;
    accessToken = null;
    refreshToken = null;
    setState({ status: 'signed-out', reason });
    return clearStored();
  }

  function isCurrent(started: number) {
    return !disposed && epoch === started;
  }

  async function runRestore(started: number) {
    if (refreshToken === null) {
      if (!resumeStoredSession) {
        // Not reported: nothing is signed in either way, and a leftover demo token is never sent
        // anywhere because every launch clears it again before it could be read.
        await clearStored();
        if (isCurrent(started)) setState({ status: 'signed-out', reason: 'none' });
        return;
      }
      let stored: string | null;
      try {
        stored = await queueStorage(() => store.read());
      } catch {
        if (isCurrent(started)) setState({ status: 'restore-failed' });
        return;
      }
      if (!isCurrent(started)) return;
      if (stored === null) {
        setState({ status: 'signed-out', reason: 'none' });
        return;
      }
      refreshToken = stored;
    }

    let user: UserDto;
    try {
      const credentials = await auth.refreshSession({ refreshToken });
      if (!isCurrent(started)) return;
      refreshToken = credentials.refreshToken;
      accessToken = credentials.accessToken;
      const persisted = await persist(credentials.refreshToken);
      if (!isCurrent(started)) return;
      user = (await auth.getCurrentUser()).user;
      if (!isCurrent(started)) return;
      setState({ status: 'signed-in', user, persisted });
    } catch (error) {
      if (!isCurrent(started)) return;
      const failure = toDataError(error);
      if (failure.kind === 'source' && failure.code !== 'RATE_LIMITED' && failure.code !== 'SERVICE_UNAVAILABLE') {
        // The source refused the stored session (`REFRESH_TOKEN_INVALID`, `UNAUTHENTICATED`, …).
        await endLocally('expired');
        return;
      }
      // Unreachable or temporarily unavailable: keep the newest refresh token for the next try.
      accessToken = null;
      setState({ status: 'restore-failed' });
    }
  }

  function refresh(): Promise<void> {
    if (refreshing) return refreshing;
    const token = refreshToken;
    if (token === null) return Promise.reject(new NoSessionError());
    const started = epoch;
    const attempt = (async () => {
      try {
        const credentials = await auth.refreshSession({ refreshToken: token });
        if (!isCurrent(started)) return;
        accessToken = credentials.accessToken;
        refreshToken = credentials.refreshToken;
        const persisted = await persist(credentials.refreshToken);
        if (isCurrent(started) && state.status === 'signed-in' && state.persisted !== persisted) {
          setState({ ...state, persisted });
        }
      } catch (error) {
        const failure = toDataError(error);
        if (isCurrent(started) && failure.code === 'REFRESH_TOKEN_INVALID') await endLocally('expired');
        throw failure;
      }
    })();
    refreshing = attempt;
    // Cleared once settled, so the next expiry starts a new attempt.
    void attempt.then(
      () => {
        if (refreshing === attempt) refreshing = null;
      },
      () => {
        if (refreshing === attempt) refreshing = null;
      },
    );
    return attempt;
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // Also set while restoring, between the renewal and reading the rider; every path that ends
    // or suspends a session clears it.
    getAccessToken: () => accessToken,

    restore() {
      if (state.status !== 'restoring' && state.status !== 'restore-failed') return Promise.resolve();
      if (restoring) return restoring;
      if (state.status === 'restore-failed') setState({ status: 'restoring' });
      const attempt = runRestore(epoch).finally(() => {
        restoring = null;
      });
      restoring = attempt;
      return attempt;
    },

    async signIn(input) {
      if (state.status === 'signed-in') throw new Error('A rider is already signed in; sign out first.');
      const session = await auth.verifyOtp(input);
      // Replaces whatever the launch restore was doing; its late results are ignored.
      epoch += 1;
      const started = epoch;
      accessToken = session.accessToken;
      refreshToken = session.refreshToken;
      const persisted = await persist(session.refreshToken);
      if (isCurrent(started)) setState({ status: 'signed-in', user: session.user, persisted });
      return session.user;
    },

    refresh,

    async runAuthenticated(operation) {
      const tokenAtStart = accessToken;
      try {
        return await operation();
      } catch (error) {
        if (toDataError(error).code !== 'SESSION_EXPIRED' || refreshToken === null) throw error;
        // Another caller may already have renewed the token while this one was in flight.
        if (accessToken === tokenAtStart) await refresh();
        return operation();
      }
    },

    signOut() {
      if (signingOut) return signingOut;
      const attempt = (async (): Promise<SignOutResult> => {
        // Revoke the newest credentials: a refresh in flight may be rotating them.
        await refreshing?.catch(() => undefined);
        await beforeSignOut?.().catch(() => undefined);
        const token = refreshToken;
        let revoked = false;
        let revokeError: DataError | null = null;
        if (token !== null) {
          try {
            await auth.logout({ refreshToken: token });
            revoked = true;
          } catch (error) {
            revokeError = toDataError(error);
          }
        }
        const storageCleared = await endLocally('signed-out');
        return Object.freeze({ revoked, revokeError, storageCleared });
      })().finally(() => {
        signingOut = null;
      });
      signingOut = attempt;
      return attempt;
    },

    discard: () => endLocally('reset'),

    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
