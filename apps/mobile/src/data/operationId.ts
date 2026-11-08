import type { OperationId } from '@ride-match/contracts';

/**
 * A new operation ID (a version 4 UUID, as `OperationIdSchema` requires) for one mutation the
 * user started. Retrying that mutation sends the same ID, so the source returns the original
 * result instead of acting twice; a new mutation, or a changed input, gets a new one.
 *
 * It uses the platform's `crypto.randomUUID` when there is one, otherwise `Math.random`. The ID
 * is an idempotency key scoped to the signed-in user, not a secret, so it needs to be unique, not
 * unpredictable; no extra dependency is needed for that.
 */
export function createOperationId(): OperationId {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (typeof native === 'function') return native.call((globalThis as { crypto: object }).crypto);
  const hex = (count: number) =>
    Array.from({ length: count }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const variant = ((Math.floor(Math.random() * 4) + 8) as number).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}
