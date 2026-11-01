/** A repeatable sequence of pseudo-random numbers. */
export type SeededRandom = {
  /** The next number in [0, 1). */
  next(): number;
  /** The next whole number from `min` to `max`, both included. */
  int(min: number, max: number): number;
  /** Restarts the sequence from its seed. */
  reset(): void;
};

/** Hashes a seed text into a 32-bit start state (FNV-1a). */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Builds a seeded generator (mulberry32): the same seed always yields the same sequence, so a
 * scenario's latencies and choices repeat run after run. It is for simulation only, never for
 * anything secret.
 */
export function createSeededRandom(seed: string): SeededRandom {
  let state = hashSeed(seed);

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    reset() {
      state = hashSeed(seed);
    },
  };
}
