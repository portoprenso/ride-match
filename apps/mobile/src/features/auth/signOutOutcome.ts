import type { SignOutResult } from './createSessionController';

/**
 * What a finished sign-out could confirm, as a short code that can travel in a route parameter
 * (it names no rider, token or error detail):
 *
 * - `confirmed`: the source ended the session and the stored credentials were removed.
 * - `unconfirmed`: signed out on this device, but the source did not confirm that the session
 *   ended (offline, refused); it stays valid there until it expires.
 * - `storage-kept`: the source ended the session, but the stored refresh token could not be
 *   removed from secure storage.
 * - `unconfirmed-storage-kept`: both of the above.
 *
 * In every case the rider is signed out on this device: memory holds no credentials, and the
 * private reads and subscriptions were cleared (`createSyncCoordinator`).
 */
export type SignOutOutcome = 'confirmed' | 'unconfirmed' | 'storage-kept' | 'unconfirmed-storage-kept';

const OUTCOMES: readonly SignOutOutcome[] = ['confirmed', 'unconfirmed', 'storage-kept', 'unconfirmed-storage-kept'];

/** Reduces the session controller's sign-out result to its {@link SignOutOutcome}. */
export function signOutOutcome(result: SignOutResult): SignOutOutcome {
  if (result.revoked) return result.storageCleared ? 'confirmed' : 'storage-kept';
  return result.storageCleared ? 'unconfirmed' : 'unconfirmed-storage-kept';
}

/** Reads an outcome back from a route parameter; anything else, including a list, is `null`. */
export function parseSignOutOutcome(value: unknown): SignOutOutcome | null {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value)
    ? (value as SignOutOutcome)
    : null;
}

/**
 * The words for a sign-out outcome. They never present an unconfirmed revocation or a failed
 * cleanup as done; `tone` is `warning` whenever something could not be confirmed.
 */
export function describeSignOutOutcome(outcome: SignOutOutcome): {
  tone: 'neutral' | 'warning';
  message: string;
} {
  const UNCONFIRMED =
    'The service couldn’t confirm that the session ended, so it stays valid there until it expires. It can’t be used from this phone.';
  const STORAGE_KEPT = 'The saved sign-in couldn’t be removed from this phone’s secure storage.';
  switch (outcome) {
    case 'confirmed':
      return {
        tone: 'neutral',
        message: 'You’re signed out. Private details were cleared from this phone.',
      };
    case 'unconfirmed':
      return {
        tone: 'warning',
        message: `You’re signed out on this phone. ${UNCONFIRMED}`,
      };
    case 'storage-kept':
      return {
        tone: 'warning',
        message: `You’re signed out, and the session was ended. ${STORAGE_KEPT}`,
      };
    case 'unconfirmed-storage-kept':
      return {
        tone: 'warning',
        message: `You’re signed out on this phone. The service couldn’t confirm that the session ended, and ${STORAGE_KEPT.charAt(0).toLowerCase()}${STORAGE_KEPT.slice(1)}`,
      };
  }
}
