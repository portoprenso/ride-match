/*
 * Shared steps for tests that drive a mock data source directly under Jest's fake timers.
 * Simulators built for these tests use a fixed latency of {@link MOCK_LATENCY_MS}.
 */

/** A fixed, short latency, so calls barely move simulated time and never reach a timed event by accident. */
export const MOCK_LATENCY_MS = 10;

/** Runs a data-source call through its simulated latency and settles like it. */
export async function settle<Value>(call: Promise<Value>): Promise<Value> {
  const outcome = call.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await jest.advanceTimersByTimeAsync(MOCK_LATENCY_MS);
  const settled = await outcome;
  if (settled.ok) return settled.value;
  throw settled.error;
}
