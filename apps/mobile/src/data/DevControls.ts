import type { ConnectionState } from './AppDataSource';

/** A scenario from docs/MOCK_SCENARIOS.md, as the demo controls list it. */
export type DemoScenario = Readonly<{
  key: string;
  label: string;
  description: string;
  /** Whether the scenario is built and can run; the others are listed but cannot be selected. */
  available: boolean;
}>;

/**
 * How the next request to the data source fails: `no-answer` loses it on the way, so nothing
 * changes; `refused` gets an error answer from the source (`SERVICE_UNAVAILABLE`).
 */
export type DemoFailure = 'no-answer' | 'refused';

/** What the demo controls show; a new object after every change. */
export type DevControlsSnapshot = Readonly<{
  /** Key of the running scenario. */
  scenario: string;
  connection: ConnectionState;
  /** How far the source's clock runs ahead of real time, in milliseconds; 0 after every reset. */
  timeAheadMs: number;
}>;

/**
 * The demo controls (screen 50): a port onto the mock data source that the composition root
 * injects only into development and preview builds running it, never into production or the
 * API data source. Features use it through `useDevControls()` and never reach the simulator.
 *
 * Starting a scenario, or the same one over, discards everything the source held: pending
 * requests fail, live subscriptions end, timers and queued failures are cleared and the
 * connection comes back. The caller clears what the app cached from the old world.
 */
export type DevControls = {
  /** Every documented scenario, in documentation order. */
  readonly scenarios: readonly DemoScenario[];
  getSnapshot(): DevControlsSnapshot;
  /** Calls `listener` after every change, until the returned function is called. */
  subscribe(listener: () => void): () => void;
  /**
   * Starts `key` from the beginning.
   *
   * @throws {RangeError} For a scenario that is not available.
   */
  selectScenario(key: string): void;
  /** Starts the running scenario over. */
  reset(): void;
  /** Loses or restores the connection: while disconnected, requests fail and live updates stop. */
  setConnection(state: ConnectionState): void;
  /** Queues `failure` for the next request of any kind; failures queue in order. */
  failNext(failure: DemoFailure): void;
  /** Moves the source's clock forward, so deadlines and timed events within `ms` happen now. */
  advanceTime(ms: number): void;
};
