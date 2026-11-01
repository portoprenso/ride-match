import type { ConnectionState } from '../AppDataSource';
import type { DemoFailure, DemoScenario, DevControls, DevControlsSnapshot } from '../DevControls';
import { isMockScenarioKey, scenarioOptions, type MockScenarioKey } from './scenarios';
import type { Simulator } from './simulator';
import type { MockWorld } from './world';

/**
 * The scenarios of docs/MOCK_SCENARIOS.md (A to N), in its order, with the words the demo controls
 * show. A scenario becomes available when its key is implemented in `scenarios.ts`.
 */
const DEMO_SCENARIOS: readonly Omit<DemoScenario, 'available'>[] = [
  { key: 'active-neighborhood', label: 'Active neighbourhood', description: 'Ride and group discovery' },
  { key: 'empty-neighborhood', label: 'Quiet neighbourhood', description: 'Honest empty state' },
  { key: 'match-appears', label: 'Match appears', description: 'A strong match after your request' },
  { key: 'group-formation', label: 'Group forms', description: 'Riders join until the group is full' },
  { key: 'last-seat-conflict', label: 'Last seat taken', description: 'Capacity conflict' },
  { key: 'request-expiration', label: 'Request expires', description: 'Your request reaches its deadline' },
  { key: 'offline-resync', label: 'Offline / stale', description: 'No queued mutations' },
  { key: 'failed-message', label: 'Chat send failure', description: 'Explicit retry without duplicates' },
  { key: 'location-unavailable', label: 'Location unavailable', description: 'Browse and choose a pickup by hand' },
  { key: 'safety', label: 'Block and report', description: 'Leave a group and stop meeting a rider' },
  { key: 'notification-entry', label: 'Notification entry', description: 'Open a match or group from a notification' },
  { key: 'taxi-unavailable', label: 'Taxi app unavailable', description: 'Fallback when the taxi app does not open' },
  { key: 'map-density', label: 'Busy map', description: 'A hundred nearby items' },
  { key: 'session-expiration', label: 'Session expires', description: 'One refresh, then continue or sign in' },
];

/** The refusal a `refused` failure answers with. */
const REFUSAL_CODE = 'SERVICE_UNAVAILABLE';

/**
 * The demo controls over the app's one simulator. Starting a scenario resets that simulator into
 * the new world rather than building another, so the data source and the app's connection
 * watchers stay valid.
 *
 * @param initial The scenario the simulator was created with.
 */
export function createMockDevControls(simulator: Simulator<MockWorld>, initial: MockScenarioKey): DevControls {
  const listeners = new Set<() => void>();
  let snapshot: DevControlsSnapshot = { scenario: initial, connection: 'connected', timeAheadMs: 0 };

  const update = (change: Partial<DevControlsSnapshot>) => {
    snapshot = { ...snapshot, ...change };
    listeners.forEach((listener) => listener());
  };

  // The simulator reports the state at once and after every change, a reset's reconnection included.
  simulator.watchConnection((connection) => {
    if (connection !== snapshot.connection) update({ connection });
  });

  return {
    scenarios: DEMO_SCENARIOS.map((scenario) => ({ ...scenario, available: isMockScenarioKey(scenario.key) })),
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectScenario(key) {
      if (!isMockScenarioKey(key)) throw new RangeError(`The mock scenario ${JSON.stringify(key)} is not available.`);
      simulator.reset({ seed: key, ...scenarioOptions(key) });
      update({ scenario: key, timeAheadMs: 0 });
    },
    reset() {
      simulator.reset();
      update({ timeAheadMs: 0 });
    },
    setConnection(state: ConnectionState) {
      simulator.setConnection(state);
    },
    failNext(failure: DemoFailure) {
      simulator.failNext(failure === 'no-answer' ? { kind: 'network' } : { kind: 'source', code: REFUSAL_CODE });
    },
    advanceTime(ms) {
      simulator.advanceTime(ms);
      update({ timeAheadMs: snapshot.timeAheadMs + ms });
    },
  };
}
