import type { DomainEventDto, PublicEventDto, SubscriptionRequest } from '@ride-match/contracts';

import type { AccessTokenSource, AppDataSource, EventForRequest, EventSubscription } from '../AppDataSource';
import { createUnavailableDataSource } from '../createUnavailableDataSource';
import { DataSourceUnavailableError } from '../errors';
import { logout, readCurrentUser, refreshSession, requestOtp, verifyOtp, viewerOf } from './auth';
import {
  acceptNearbySubscription,
  acceptUserSubscription,
  isPublicEventInViewport,
  isViewersOwn,
  readGroupPreview,
  readNearby,
  readRide,
  searchPlaces,
} from './discovery';
import { joinGroup } from './groups';
import { cancelRide, createRide, readMatches, readOwnRequest } from './rides';
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
 *   take an abort signal); the caller's own request: create, read and cancel (RIDE-001-A,
 *   `rides.ts`); joining a ride or group (GROUP-001-A, `groups.ts`); nearby and `user` subscriptions and the connection state.
 * - Every other operation rejects at once with a `DataSourceUnavailableError` until the card
 *   that implements it lands, never with invented data. So do `group` subscriptions for now,
 *   although joins already emit `group.changed`; a later GROUP card delivers them.
 * - Signed-in operations read the access token when they start, as an HTTP client sets its
 *   header. Discovery reads it too: a signed-in viewer's own request is left out.
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
      getNearby: (input, options) => {
        const token = accessToken();
        return simulator.run(
          'rides.getNearby',
          (context) => readNearby(context, input, viewerOf(context, token)?.id ?? null),
          options,
        );
      },
      getOwnRequest: (options) => {
        const token = accessToken();
        return simulator.run('rides.getOwnRequest', (context) => readOwnRequest(context, token), options);
      },
      create: (input) => {
        const token = accessToken();
        return simulator.run('rides.create', (context) => createRide(context, token, input));
      },
      getMatches: (rideId, options) => {
        const token = accessToken();
        return simulator.run('rides.getMatches', (context) => readMatches(context, token, rideId), options);
      },
      cancel: (rideId, input) => {
        const token = accessToken();
        return simulator.run('rides.cancel', (context) => cancelRide(context, token, rideId, input));
      },
      getRide: (rideId, options) => simulator.run('rides.getRide', (context) => readRide(context, rideId), options),
    },
    groups: {
      ...unavailable.groups,
      join: (input) => {
        const token = accessToken();
        return simulator.run('groups.join', (context) => joinGroup(context, token, input));
      },
      getPreview: (groupId, options) =>
        simulator.run('groups.getPreview', (context) => readGroupPreview(context, groupId), options),
    },
    events: {
      subscribe: <Request extends SubscriptionRequest>(
        request: Request,
        onEvent: (event: EventForRequest<Request>) => void,
      ) =>
        request.kind === 'user'
          ? subscribeUser(simulator, request, accessToken(), onEvent as (event: DomainEventDto) => void)
          : subscribeNearby(simulator, request, accessToken(), onEvent as (event: PublicEventDto) => void),
      watchConnection: (listener) => simulator.watchConnection(listener),
    },
  };
}

/**
 * Accepts a nearby subscription after the simulated round trip, then delivers each public event
 * about an item in its viewport. Delivery starts only once the acknowledgement arrives, so an
 * acknowledgement lost to a simulated failure leaves no listener behind. The subscription ends
 * on `unsubscribe`, on disconnection, and on reset or disposal.
 *
 * A signed-in subscriber (as the token said when subscribing; the app subscribes again for each
 * viewer) is not sent upserts of their own request or group, as discovery leaves them out.
 */
async function subscribeNearby(
  simulator: Simulator<MockWorld>,
  request: SubscriptionRequest,
  token: string | null,
  onEvent: (event: PublicEventDto) => void,
): Promise<EventSubscription> {
  if (request.kind !== 'nearby') throw new DataSourceUnavailableError(NOT_YET);
  const ack = await simulator.run('events.subscribe', (context) => ({
    ...acceptNearbySubscription(context, request),
    viewerId: viewerOf(context, token)?.id ?? null,
  }));
  const { viewport } = ack.subscription;
  const { viewerId } = ack;
  const stop = simulator.subscribe((event) => {
    if (event.type !== 'nearby.upserted' && event.type !== 'nearby.removed') return;
    if (!isPublicEventInViewport(simulator.state, event, viewport)) return;
    if (event.type === 'nearby.upserted' && viewerId !== null) {
      const { item } = event.payload;
      if (isViewersOwn(simulator.state, item.kind, item.id, viewerId)) return;
    }
    onEvent(event);
  });
  return {
    ack: { subscriptionId: ack.subscriptionId, subscription: ack.subscription },
    unsubscribe: async () => {
      stop();
    },
  };
}

/**
 * Accepts a `user` subscription for the signed-in caller after the simulated round trip, then
 * delivers every event addressed to that rider (`audience` `user`), such as `ride.changed` for
 * their own request. It ends like a nearby subscription.
 */
async function subscribeUser(
  simulator: Simulator<MockWorld>,
  request: SubscriptionRequest,
  token: string | null,
  onEvent: (event: DomainEventDto) => void,
): Promise<EventSubscription> {
  const ack = await simulator.run('events.subscribe', (context) => acceptUserSubscription(context, request, token));
  const stop = simulator.subscribe((event) => {
    if (event.audience.kind === 'user' && event.audience.userId === ack.userId) onEvent(event);
  });
  return {
    ack: { subscriptionId: ack.subscriptionId, subscription: ack.subscription },
    unsubscribe: async () => {
      stop();
    },
  };
}
