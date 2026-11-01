/** Whose intent a receipt records: the acting user and the operation ID they sent. */
export type ReceiptKey = { actorId: string; operationId: string };

/** What was asked: the operation's name and its input, compared to recognize a true retry. */
export type ReceiptRequest = { operation: string; input: unknown };

/**
 * Idempotency results, so a retried mutation returns its original result instead of acting
 * twice. Receipts are scoped to the acting user, as the contract's operation IDs are.
 */
export type ReceiptStore = {
  /**
   * Performs `perform` once per key.
   *
   * - A new key runs `perform` and stores a copy of its result. A failure stores nothing, so
   *   a retry after a refusal runs again.
   * - The same key with the same request returns a copy of the stored result without running
   *   `perform`, so no state changes and no events repeat.
   * - The same key with a different request (another operation or input) throws the error
   *   that `conflict` builds, the source's `IDEMPOTENCY_CONFLICT`.
   *
   * Results must be JSON-shaped, as contract DTOs are.
   */
  once<Result>(key: ReceiptKey, request: ReceiptRequest, perform: () => Result): Result;
  size(): number;
  clear(): void;
};

/** JSON text with object keys sorted, so equal inputs compare equal whatever their key order. */
function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested !== null && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
      : nested,
  );
}

/** A deep copy of a JSON-shaped value, so callers never share the stored result. */
function copy<Value>(value: Value): Value {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as Value);
}

/**
 * @param conflict Builds the error for a key reused with a different request.
 */
export function createReceiptStore(conflict: () => Error): ReceiptStore {
  const receipts = new Map<string, { request: string; result: unknown }>();

  return {
    once<Result>(key: ReceiptKey, request: ReceiptRequest, perform: () => Result): Result {
      const id = JSON.stringify([key.actorId, key.operationId]);
      const requestPrint = fingerprint(request);
      const stored = receipts.get(id);
      if (stored !== undefined) {
        if (stored.request !== requestPrint) throw conflict();
        return copy(stored.result as Result);
      }
      const result = perform();
      receipts.set(id, { request: requestPrint, result: copy(result) });
      return result;
    },
    size: () => receipts.size,
    clear() {
      receipts.clear();
    },
  };
}
