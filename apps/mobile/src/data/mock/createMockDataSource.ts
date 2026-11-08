import type { DomainEventDto, PublicEventDto, SubscriptionRequest } from '@ride-match/contracts';

import type { AccessTokenSource, AppDataSource, EventForRequest, EventSubscription } from '../AppDataSource';
import { createUnavailableDataSource } from '../createUnavailableDataSource';
import { DataSourceUnavailableError } from '../errors';
import { logout, readCurrentUser, refreshSession, requestOtp, verifyOtp, viewerOf } from './auth';
import {
  acceptNearbySubscription,
  acceptUserSubscription,
  isHiddenByBlock,
  isHiddenFrom,
  isPublicEventInViewport,
  isStillDiscoverable,
  readGroupPreview,
  readNearby,
  readRide,
  searchPlaces,
} from './discovery';
import { readChatHistory, sendChatMessage } from './chat';
import { acceptGroupSubscription, isMember, joinGroup, leaveGroup, readGroup, updateGroupStatus } from './groups';
import { cancelRide, createRide, readMatches, readOwnRequest } from './rides';
import { blockUser, listBlocks, reportUser, unblockUser } from './safety';
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
 *   `rides.ts`); joining a ride or group (GROUP-001-A, `groups.ts`), leaving it and the
 *   member-only group read (GROUP-001-B), and the coordinator's status changes (GROUP-001-C);
 *   chat history pages and sending (CHAT-001-A, `chat.ts`); reports, blocks, unblocks and the
 *   block list (SAFETY-001-A, `safety.ts`); nearby and `user` subscriptions and the connection
 *   state.
 * - Every other operation rejects at once with a `DataSourceUnavailableError` until the card
 *   that implements it lands, never with invented data. `group` subscriptions are
 *   delivered since GROUP-002-B.
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
      getGroup: (groupId, options) => {
        const token = accessToken();
        return simulator.run('groups.getGroup', (context) => readGroup(context, token, groupId), options);
      },
      leave: (groupId, input) => {
        const token = accessToken();
        return simulator.run('groups.leave', (context) => leaveGroup(context, token, groupId, input));
      },
      updateStatus: (groupId, input) => {
        const token = accessToken();
        return simulator.run('groups.updateStatus', (context) => updateGroupStatus(context, token, groupId, input));
      },
      getPreview: (groupId, options) =>
        simulator.run('groups.getPreview', (context) => readGroupPreview(context, groupId), options),
    },
    chat: {
      getHistory: (groupId, input, options) => {
        const token = accessToken();
        return simulator.run('chat.getHistory', (context) => readChatHistory(context, token, groupId, input), options);
      },
      send: (groupId, input) => {
        const token = accessToken();
        return simulator.run('chat.send', (context) => sendChatMessage(context, token, groupId, input));
      },
    },
    safety: {
      report: (input) => {
        const token = accessToken();
        return simulator.run('safety.report', (context) => reportUser(context, token, input));
      },
      block: (userId, input) => {
        const token = accessToken();
        return simulator.run('safety.block', (context) => blockUser(context, token, userId, input));
      },
      unblock: (userId) => {
        const token = accessToken();
        return simulator.run('safety.unblock', (context) => unblockUser(context, token, userId));
      },
      listBlocks: (input, options) => {
        const token = accessToken();
        return simulator.run('safety.listBlocks', (context) => listBlocks(context, token, input), options);
      },
    },
    events: {
      subscribe: <Request extends SubscriptionRequest>(
        request: Request,
        onEvent: (event: EventForRequest<Request>) => void,
      ) =>
        request.kind === 'user'
          ? subscribeUser(simulator, request, accessToken(), onEvent as (event: DomainEventDto) => void)
          : request.kind === 'group'
            ? subscribeGroup(simulator, request, accessToken(), onEvent as (event: DomainEventDto) => void)
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
 * viewer) is not sent upserts of what discovery hides from them: their own request or group, and
 * anything of a rider in a block with them (SAFETY-001-A).
 *
 * A removal of an item that is still discoverable comes only from a block: it goes only to the
 * subscribers the item is now hidden from (the two riders of the block), never to anyone else, so
 * nobody else learns of the block.
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
      if (isHiddenFrom(simulator.state, item.kind, item.id, viewerId)) return;
    }
    if (event.type === 'nearby.removed') {
      const { target } = event.payload;
      const fromBlock = isStillDiscoverable(simulator.state, target.kind, target.id);
      if (fromBlock && (viewerId === null || !isHiddenByBlock(simulator.state, target.kind, target.id, viewerId)))
        return;
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

/**
 * Accepts a `group` subscription for a member of that group after the simulated round trip, then
 * delivers every event addressed to the group (`group.changed`, `chat.message.created`), only while the subscriber is
 * still a member: a member who leaves stops receiving it at once. It ends like a nearby
 * subscription.
 */
async function subscribeGroup(
  simulator: Simulator<MockWorld>,
  request: SubscriptionRequest,
  token: string | null,
  onEvent: (event: DomainEventDto) => void,
): Promise<EventSubscription> {
  const ack = await simulator.run('events.subscribe', (context) => acceptGroupSubscription(context, request, token));
  const { groupId } = ack.subscription;
  const stop = simulator.subscribe((event) => {
    if (event.audience.kind !== 'group' || event.audience.groupId !== groupId) return;
    const group = simulator.state.groups.get(groupId);
    if (group !== undefined && isMember(group, ack.userId)) onEvent(event);
  });
  return {
    ack: { subscriptionId: ack.subscriptionId, subscription: ack.subscription },
    unsubscribe: async () => {
      stop();
    },
  };
}
