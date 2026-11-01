/** Hands out deterministic resource IDs, such as `ride_1`, `ride_2`, `group_1`. */
export type IdGenerator = {
  /**
   * The next ID for `prefix`, counting from 1 per prefix. The prefix must be URL-safe
   * (letters, digits, `_`, `-`), so the ID satisfies the contract's `IdSchema`. Seed fixtures
   * use this generator or prefixes of their own, so generated IDs never collide with them.
   */
  next(prefix: string): string;
  /** Restarts every counter. */
  reset(): void;
};

export function createIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();

  return {
    next(prefix) {
      const count = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, count);
      return `${prefix}_${count}`;
    },
    reset() {
      counters.clear();
    },
  };
}
