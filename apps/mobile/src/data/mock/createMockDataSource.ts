import type { PublicEventDto, SubscriptionRequest } from '@ride-match/contracts';

import type { AccessTokenSource, AppDataSource, EventForRequest, EventSubscription } from '../AppDataSource';
import { createUnavailableDataSource } from '../createUnavailableDataSource';
import { DataSourceUnavailableError } from '../errors';
import { logout, readCurrentUser, refreshSession, requestOtp, verifyOtp } from './auth';
import {
  acceptNearbySubscription,
  isPublicEventInViewport,
  readGroupPreview,
  readNearby,
  readRide,
  searchPlaces,
} from './discovery';
import { scenarioOptions, type MockScenarioKey } from './scenarios';
import { createSimulator, type LatencyRange, type Simulator } from './simulator';
import type { MockWorld } from './world';

const NOT_YET = 'The mock data source does not support this operation yet.';

/**
 * Builds the simulator for a scenario, activated now: its world, deadlines and timed events.
 * The scenario key seeds every random sequence, so a scenario repeats its latencies.
 *
 * The caller owns it: the composition root disposes it when the app's root unmounts, and the
 * demo controls (MOCK-001-C) reset it.
 *
 * @param options.latencyMs Simulated latency; 200–700 ms unless given.
 * @param options.readTime Source of real time; `Date.now` unless a test passes its own.
 */
export function createMockSimulator(
  scenario: MockScenarioKey,
  options: { latencyMs?: LatencyRange; readTime?: () => number } = {},
): Simulator<MockWorld> {
  return createSimulator<MockWorld>({ seed: scenario, ...scenarioOptions(scenario), ...options });
}

/**
 * Adapts a simulator to `AppDataSource`, the only shape feature code sees.
 *
 * - Implemented: sign-in, refresh, logout and the current user (AUTH-001-A, `auth.ts`); place
 *   search, nearby discovery, one ride's public view and a group's public preview (reads that
 *   take an abort signal); nearby subscriptions and the connection state.
 * - Every other operation rejects at once with a `DataSourceUnavailableError` until the card
 *   that implements it lands, never with invented data. So do `user` and `group`
 *   subscriptions, whose events come from operations later cards add.
 *
 * Every implemented call goes through `Simulator.run`, so it gets the seeded latency, the
 * failure controls and the connection state.
 *
 * @param options.accessToken The caller's access token for authenticated operations; anonymous
 *   unless given. The composition root passes the session controller's (AUTH-001-B).
 */
export function createMockDataSource(
  simulator: Simulator<MockWorld>,
  options: { accessToken?: AccessTokenSource } = {},
): AppDataSource {
  const unavailable = createUnavailableDataSource(NOT_YET);
  const accessToken = options.accessToken ?? (() => null);

  return {
    ...unavailable,
    auth: {
      requestOtp: (input) => simulator.run('auth.requestOtp', (context) => requestOtp(context, input)),
      verifyOtp: (input) => simulator.run('auth.verifyOtp', (context) => verifyOtp(context, input)),
      refreshSession: (input) => simulator.run('auth.refreshSession', (context) => refreshSession(context, input)),
      logout: (input) => simulator.run('auth.logout', (context) => logout(context, input)),
      getCurrentUser: (readOptions) => {
        // Read once, when the request starts, as an HTTP client sets its header.
        const token = accessToken();
        return simulator.run('auth.getCurrentUser', (context) => readCurrentUser(context, token), readOptions);
      },
    },
    places: {
      search: (input, options) => simulator.run('places.search', (context) => searchPlaces(context, input), options),
    },
    rides: {
      ...unavailable.rides,
      getNearby: (input, options) => simulator.run('rides.getNearby', (context) => readNearby(context, input), options),
      getRide: (rideId, options) => simulator.run('rides.getRide', (context) => readRide(context, rideId), options),
    },
    groups: {
      ...unavailable.groups,
      getPreview: (groupId, options) =>
        simulator.run('groups.getPreview', (context) => readGroupPreview(context, groupId), options),
    },
    events: {
      subscribe: <Request extends SubscriptionRequest>(
        request: Request,
        onEvent: (event: EventForRequest<Request>) => void,
      ) => subscribeNearby(simulator, request, onEvent as (event: PublicEventDto) => void),
      watchConnection: (listener) => simulator.watchConnection(listener),
    },
  };
}

/**
 * Accepts a nearby subscription after the simulated round trip, then delivers each public event
 * about an item in its viewport. Delivery starts only once the acknowledgement arrives, so an
 * acknowledgement lost to a simulated failure leaves no listener behind. The subscription ends
 * on `unsubscribe`, on disconnection, and on reset or disposal.
 */
async function subscribeNearby(
  simulator: Simulator<MockWorld>,
  request: SubscriptionRequest,
  onEvent: (event: PublicEventDto) => void,
): Promise<EventSubscription> {
  if (request.kind !== 'nearby') throw new DataSourceUnavailableError(NOT_YET);
  const ack = await simulator.run('events.subscribe', (context) => acceptNearbySubscription(context, request));
  const { viewport } = ack.subscription;
  const stop = simulator.subscribe((event) => {
    if (event.type !== 'nearby.upserted' && event.type !== 'nearby.removed') return;
    if (isPublicEventInViewport(simulator.state, event, viewport)) onEvent(event);
  });
  return {
    ack,
    unsubscribe: async () => {
      stop();
    },
  };
}
