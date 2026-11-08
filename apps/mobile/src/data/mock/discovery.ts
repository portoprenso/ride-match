import {
  NearbyQueryInputSchema,
  SearchPlacesInputSchema,
  SubscriptionRequestSchema,
  type DepartureOffsetMinutes,
  type GroupPreviewDto,
  type MapViewport,
  type MatchPreviewDto,
  type NearbyItemDto,
  type NearbySnapshotDto,
  type PlaceDto,
  type PlaceSearchResultsDto,
  type PublicEventDto,
  type RideRequestDto,
  type SubscriptionAckDto,
} from '@ride-match/contracts';

import { boundsIntersect, centerOf, circleReaches, contains, distanceMeters, viewportBounds } from './geometry';
import { authenticate } from './auth';
import { COVERAGE, CURATED_PLACES, findPlace } from './places';
import {
  discoveryRecords,
  toGroupPreviewDto,
  toMatchPreviewDto,
  toNearbyItemDto,
  toPlaceDto,
  toRideRequestDto,
} from './serializers';
import type { WorkContext } from './simulator';
import { isBlockedPair, isDiscoverableRide, isLiveGroup, type MockWorld, type SuppliedMatchRecord } from './world';

/*
 * Public reads: curated place search, nearby discovery, and one ride's or group's public view,
 * as the future source answers them (docs/api/rides.md, docs/api/groups.md). They are open to
 * anonymous callers. Since RIDE-001-A, discovery leaves out a signed-in viewer's own request and
 * any group they belong to, without changing what other items show, and since SAFETY-001-A
 * anything of a rider they blocked or who blocked them.
 *
 * Each runs as simulator work: the source validates the input itself, because a caller may send
 * anything, and answers with contract errors.
 */

type Context = WorkContext<MockWorld>;

const invalidInput = (context: Context) => context.sourceError('VALIDATION_FAILED', 'The request is not valid.');
const outsideCoverage = (context: Context) =>
  context.sourceError('UNSUPPORTED_AREA', 'This area is outside the demo coverage.');

/**
 * How well a place matches the search text, lower first, or `null` for no match: a label that
 * starts with it, then a word of the label that does, then a label or detail containing it.
 */
function relevance(place: PlaceDto, query: string): number | null {
  const label = place.label.toLowerCase();
  if (label.startsWith(query)) return 0;
  if (label.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 1;
  if (label.includes(query)) return 2;
  if (place.detail?.toLowerCase().includes(query)) return 3;
  return null;
}

/**
 * Curated place search (`GET /places/search`): the places inside the search area (`center` and
 * `radiusMeters`), at most `limit` of them. Without a query they come nearest the area's center
 * first; with one, by {@link relevance}, then by distance. Matching ignores case.
 *
 * Fails with `VALIDATION_FAILED` for an invalid input and `UNSUPPORTED_AREA` for an area that
 * does not reach the covered city.
 */
export function searchPlaces(context: Context, input: unknown): PlaceSearchResultsDto {
  const parsed = SearchPlacesInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(context);
  const { query, area, limit } = parsed.data;
  if (!circleReaches(COVERAGE, area.center, area.radiusMeters)) throw outsideCoverage(context);

  const text = query?.toLowerCase();
  return CURATED_PLACES.flatMap((place) => {
    const distance = distanceMeters(area.center, place.coordinates);
    const rank = text === undefined ? 0 : relevance(place, text);
    return distance <= area.radiusMeters && rank !== null ? [{ place, rank, distance }] : [];
  })
    .sort((first, second) => first.rank - second.rank || first.distance - second.distance)
    .slice(0, limit)
    .map(({ place }) => toPlaceDto(place));
}

/**
 * Nearby discovery (`GET /rides/nearby`): the active solo rides and live groups whose public
 * area's center lies in the viewport, nearest its center first, each once. A grouped request
 * never appears on its own; its group stands for it.
 *
 * With a destination (and optionally a departure choice), `previews` holds the scenario's
 * supplied matches for it ({@link matchPreviews}); without one it is empty. The mock never
 * computes compatibility. A destination must name a curated place.
 *
 * A signed-in viewer (`viewerId`) never sees their own request, a group they belong to, or a
 * ride or group of a rider in a block with them ({@link isHiddenFrom}).
 *
 * Fails with `VALIDATION_FAILED` for an invalid input or an unknown destination, and
 * `UNSUPPORTED_AREA` for a viewport entirely outside the covered city.
 */
export function readNearby(context: Context, input: unknown, viewerId: string | null = null): NearbySnapshotDto {
  const parsed = NearbyQueryInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(context);
  const { viewport, destinationPlaceId, departureOffsetMinutes, limit } = parsed.data;
  if (destinationPlaceId !== undefined && findPlace(destinationPlaceId) === undefined) throw invalidInput(context);
  const bounds = viewportBounds(viewport);
  if (!boundsIntersect(bounds, COVERAGE)) throw outsideCoverage(context);

  const center = centerOf(bounds);
  const found = discoveryRecords(context.state)
    .filter((item) => contains(bounds, item.record.publicOrigin.center))
    .filter((item) => viewerId === null || !isHiddenFrom(context.state, item.kind, item.record.id, viewerId))
    .map((item) => ({ item, distance: distanceMeters(center, item.record.publicOrigin.center) }))
    .sort((first, second) => first.distance - second.distance);

  const items = found.slice(0, limit).map(({ item }) => toNearbyItemDto(context.state, item));
  return {
    items,
    truncated: found.length > limit,
    previews:
      destinationPlaceId === undefined ? [] : matchPreviews(context.state, items, destinationPlaceId, departureOffsetMinutes),
  };
}

/**
 * The supplied matches for a destination choice, as previews of the returned items only, in the
 * items' order (nearest the viewport's center first), each target once. A match whose
 * `departures` leave out the read's departure choice is skipped. An item that left discovery
 * (expired, grouped, closed) is not returned, so its match is not either.
 */
export function matchPreviews(
  world: MockWorld,
  items: readonly NearbyItemDto[],
  destinationPlaceId: string,
  departure: DepartureOffsetMinutes | undefined,
): MatchPreviewDto[] {
  const fitting = new Map<string, SuppliedMatchRecord>();
  for (const match of world.suppliedMatches) {
    const key = `${match.target.kind}:${match.target.id}`;
    if (match.destinationPlaceId !== destinationPlaceId || fitting.has(key)) continue;
    if (departure !== undefined && match.departures !== null && !match.departures.includes(departure)) continue;
    fitting.set(key, match);
  }
  return items.flatMap((item) => {
    const match = fitting.get(`${item.kind}:${item.id}`);
    return match === undefined ? [] : [toMatchPreviewDto(match)];
  });
}

/**
 * One active request's public view (`GET /rides/{rideId}`). An unknown, grouped or ended
 * request fails with `TARGET_UNAVAILABLE`, so a public read never links a rider to a group.
 */
export function readRide(context: Context, rideId: string): RideRequestDto {
  const ride = context.state.rides.get(rideId);
  if (ride === undefined || !isDiscoverableRide(ride)) {
    throw context.sourceError('TARGET_UNAVAILABLE', 'This ride is no longer available.');
  }
  return toRideRequestDto(context.state, ride);
}

/** A live group's public preview (`GET /groups/{groupId}/preview`); otherwise `TARGET_UNAVAILABLE`. */
export function readGroupPreview(context: Context, groupId: string): GroupPreviewDto {
  const group = context.state.groups.get(groupId);
  if (group === undefined || !isLiveGroup(group)) {
    throw context.sourceError('TARGET_UNAVAILABLE', 'This group is no longer available.');
  }
  return toGroupPreviewDto(group);
}

/**
 * Accepts a `nearby` subscription for a viewport, open to anonymous connections, and
 * acknowledges it with a new subscription ID and the scope exactly as requested. Fails with
 * `VALIDATION_FAILED` for an invalid request and `UNSUPPORTED_AREA` for an uncovered viewport.
 * Delivery is the data source's job ({@link isPublicEventInViewport}).
 */
export function acceptNearbySubscription(context: Context, request: unknown): SubscriptionAckDto & {
  subscription: { kind: 'nearby'; viewport: MapViewport };
} {
  const parsed = SubscriptionRequestSchema.safeParse(request);
  if (!parsed.success || parsed.data.kind !== 'nearby') throw invalidInput(context);
  if (!boundsIntersect(viewportBounds(parsed.data.viewport), COVERAGE)) throw outsideCoverage(context);
  return { subscriptionId: context.ids.next('sub'), subscription: parsed.data };
}

/**
 * Whether a discovery item is hidden from a signed-in viewer: their own request or group
 * ({@link isViewersOwn}), or a ride or group of a rider who is in a block with them, in either
 * direction. Anonymous viewers are never filtered.
 */
export function isHiddenFrom(world: MockWorld, kind: 'ride' | 'group', id: string, viewerId: string): boolean {
  return isViewersOwn(world, kind, id, viewerId) || isHiddenByBlock(world, kind, id, viewerId);
}

/** Whether a discovery item holds a rider who is in a block with the viewer, in either direction. */
export function isHiddenByBlock(world: MockWorld, kind: 'ride' | 'group', id: string, viewerId: string): boolean {
  const riders =
    kind === 'ride'
      ? [world.rides.get(id)?.userId]
      : (world.groups.get(id)?.members.map((member) => member.userId) ?? []);
  return riders.some((rider) => rider !== undefined && isBlockedPair(world, rider, viewerId));
}

/** Whether a discovery item is still shown to viewers it isn't hidden from: an active ride or a live group. */
export function isStillDiscoverable(world: MockWorld, kind: 'ride' | 'group', id: string): boolean {
  if (kind === 'ride') {
    const ride = world.rides.get(id);
    return ride !== undefined && isDiscoverableRide(ride);
  }
  const group = world.groups.get(id);
  return group !== undefined && isLiveGroup(group);
}

/** Whether a discovery item is the viewer's own request, or a group the viewer belongs to. */
export function isViewersOwn(world: MockWorld, kind: 'ride' | 'group', id: string, viewerId: string): boolean {
  if (kind === 'ride') return world.rides.get(id)?.userId === viewerId;
  return world.groups.get(id)?.members.some((member) => member.userId === viewerId) ?? false;
}

/**
 * Accepts a `user` subscription for the signed-in caller, whose private events (such as
 * `ride.changed` for their own request) it delivers. Fails with `UNAUTHENTICATED` or
 * `SESSION_EXPIRED` like any signed-in operation.
 */
export function acceptUserSubscription(
  context: Context,
  request: unknown,
  accessToken: string | null,
): SubscriptionAckDto & { subscription: { kind: 'user' } } & { userId: string } {
  const parsed = SubscriptionRequestSchema.safeParse(request);
  if (!parsed.success || parsed.data.kind !== 'user') throw invalidInput(context);
  const user = authenticate(context, accessToken);
  return { subscriptionId: context.ids.next('sub'), subscription: parsed.data, userId: user.id };
}

/**
 * Whether a public event concerns an item inside `viewport`, the rule a nearby subscription
 * delivers by. An upsert carries the item's public area; a removal tombstone carries none, so
 * the world's record of the target says where it was. Records outlive their removal, so a
 * removal always finds it.
 */
export function isPublicEventInViewport(world: MockWorld, event: PublicEventDto, viewport: MapViewport): boolean {
  const bounds = viewportBounds(viewport);
  if (event.type === 'nearby.upserted') return contains(bounds, event.payload.item.publicOrigin.center);
  const { target } = event.payload;
  const record = target.kind === 'ride' ? world.rides.get(target.id) : world.groups.get(target.id);
  return record !== undefined && contains(bounds, record.publicOrigin.center);
}
