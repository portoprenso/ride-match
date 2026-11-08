import {
  GROUP_POLICY,
  JoinGroupInputSchema,
  LeaveGroupInputSchema,
  type JoinGroupResultDto,
  type LeaveGroupResultDto,
  type RideGroupDto,
} from '@ride-match/contracts';

import { authenticate } from './auth';
import { expireGroup } from './lifecycle';
import {
  groupChanged,
  nearbyRemoved,
  nearbyUpserted,
  rideChanged,
  toNearbyItemDto,
  toOwnRideRequestDto,
  toRideGroupDto,
} from './serializers';
import type { WorkContext } from './simulator';
import type { GroupRecord, MockWorld, RideRecord } from './world';

/*
 * Joining a ride or a group (docs/api/groups.md, "Atomic joining"), leaving one, and the
 * member-only group read. The simulator runs each
 * piece of work alone and to completion, so a join reads and changes the world in one step:
 * of two joins that arrive together, the second sees what the first did. That is the mock's
 * stand-in for the backend's transaction; it resolves the canonical group and checks seats at
 * that moment, never from what the caller saw earlier.
 */

type Context = WorkContext<MockWorld>;

const SECOND = 1000;

/** Where a join lands: a solo ride to group with, or an existing group to add a seat to. */
type Destination = { kind: 'solo'; ride: RideRecord } | { kind: 'group'; group: GroupRecord };

/**
 * The target as it is now. A ride that another join already grouped resolves to its group, so
 * two first joins of one solo ride end in one group. `null` when the target is unknown or
 * ended: a ride that expired, was cancelled or completed, or a closed group.
 */
function resolveTarget(world: MockWorld, target: { kind: 'ride' | 'group'; id: string }): Destination | null {
  if (target.kind === 'ride') {
    const ride = world.rides.get(target.id);
    if (ride === undefined) return null;
    if (ride.status === 'active') return { kind: 'solo', ride };
    if (ride.status !== 'grouped' || ride.groupId === null) return null;
    return resolveGroup(world, ride.groupId);
  }
  return resolveGroup(world, target.id);
}

function resolveGroup(world: MockWorld, groupId: string): Destination | null {
  const group = world.groups.get(groupId);
  if (group === undefined || group.status === 'completed' || group.status === 'cancelled') return null;
  return { kind: 'group', group };
}

/** Moves an active request into a group; its discovery deadline no longer applies. */
function groupRide(ride: RideRecord, groupId: string): void {
  ride.status = 'grouped';
  ride.groupId = groupId;
  ride.version += 1;
}

/**
 * `POST /groups/join`: joins the caller's active request to a solo ride or a group.
 *
 * In this order: `VALIDATION_FAILED` (an invalid input, including the caller's own ride as the
 * target), `UNAUTHENTICATED`/`SESSION_EXPIRED`, then the receipt: a retry with the same
 * operation ID and input returns the original result, even after the group changed, and the
 * same ID with another input fails with `IDEMPOTENCY_CONFLICT`. A new join then fails, first
 * match wins, with:
 *
 * - `FORBIDDEN` when the request is not the caller's (an unknown request too, so the answer
 *   never reveals whether someone else's request exists);
 * - `ALREADY_IN_GROUP`, `RIDE_EXPIRED`, then `INVALID_TRANSITION` for the caller's request;
 * - `TARGET_UNAVAILABLE` for a target that is unknown or ended;
 * - `GROUP_CLOSED` when the group (or the group the target ride joined) is `ready`;
 * - `GROUP_FULL` when it has `GROUP_POLICY.capacity` members.
 *
 * Blocks are not checked yet: the world has no block records until the safety cards add them,
 * so `BLOCKED_RELATIONSHIP` and the blocked user's `TARGET_UNAVAILABLE` never occur here.
 *
 * A failed join changes nothing, so the caller's request stays active. On success:
 *
 * - A solo target becomes a new `forming` group of two, coordinated by the target's rider, with
 *   the target's destination, departure and public area, expiring
 *   `GROUP_POLICY.lifetimeSeconds` later (scheduled). Discovery removes the ride and shows the
 *   group; both requests become `grouped`, and both owners are told (`ride.changed`).
 * - A group target gains the caller as its last member and stays `forming`, even with four
 *   members. Discovery shows the new count; the members are told (`group.changed`,
 *   `member_joined`).
 *
 * Either way discovery removes the caller's own ride with reason `unavailable`, which never
 * says it joined a group, and the caller is told. The result is the member-only group and the
 * caller's grouped request.
 */
export function joinGroup(context: Context, accessToken: string | null, input: unknown): JoinGroupResultDto {
  const parsed = JoinGroupInputSchema.safeParse(input);
  if (!parsed.success) throw context.sourceError('VALIDATION_FAILED', 'The join is not valid.');
  const request = parsed.data;
  const user = authenticate(context, accessToken);

  return context.receipts.once(
    { actorId: user.id, operationId: request.operationId },
    { operation: 'groups.join', input: request },
    () => {
      const { state } = context;
      const own = state.rides.get(request.rideRequestId);
      if (own === undefined || own.userId !== user.id) {
        throw context.sourceError('FORBIDDEN', 'This request is not yours.');
      }
      switch (own.status) {
        case 'grouped':
          throw context.sourceError('ALREADY_IN_GROUP', 'You are already in a group.');
        case 'expired':
          throw context.sourceError('RIDE_EXPIRED', 'Your request has expired.');
        case 'completed':
        case 'cancelled':
          throw context.sourceError('INVALID_TRANSITION', 'Your request has already ended.');
        case 'active':
          break;
      }
      const destination = resolveTarget(state, request.target);
      if (destination === null) throw context.sourceError('TARGET_UNAVAILABLE', 'This plan is no longer available.');
      if (destination.kind === 'group' && destination.group.status === 'ready') {
        throw context.sourceError('GROUP_CLOSED', 'This group is no longer taking riders.');
      }
      if (destination.kind === 'group' && destination.group.members.length >= GROUP_POLICY.capacity) {
        throw context.sourceError('GROUP_FULL', 'This group is full.');
      }

      const group = destination.kind === 'solo' ? formGroup(context, destination.ride, own) : destination.group;
      if (destination.kind === 'group') {
        group.members.push({ userId: own.userId, rideRequestId: own.id, joinedAt: context.now });
        group.version += 1;
        groupRide(own, group.id);
      }

      context.emit(nearbyRemoved(context.eventEnvelope(), { kind: 'ride', id: own.id }, own.version, 'unavailable'));
      context.emit(nearbyUpserted(context.eventEnvelope(), toNearbyItemDto(state, { kind: 'group', record: group })));
      context.emit(rideChanged(context.eventEnvelope(), own));
      if (destination.kind === 'group') context.emit(groupChanged(context.eventEnvelope(), group, 'member_joined'));
      return { group: toRideGroupDto(state, group), rideRequest: toOwnRideRequestDto(state, own) };
    },
  );
}

/**
 * Forms a group of two from a solo ride and the joiner's request, both joined now, and
 * schedules its deadline. The target's rider coordinates; the group takes the target's plan.
 */
function formGroup(context: Context, target: RideRecord, joiner: RideRecord): GroupRecord {
  const group: GroupRecord = {
    id: context.ids.next('group'),
    status: 'forming',
    coordinatorId: target.userId,
    members: [
      { userId: target.userId, rideRequestId: target.id, joinedAt: context.now },
      { userId: joiner.userId, rideRequestId: joiner.id, joinedAt: context.now },
    ],
    destinationPlaceId: target.destinationPlaceId,
    departureAt: target.departureAt,
    publicOrigin: { ...target.publicOrigin, center: { ...target.publicOrigin.center } },
    meetingPoint: null,
    createdAt: context.now,
    expiresAt: context.now + GROUP_POLICY.lifetimeSeconds * SECOND,
    closure: null,
    version: 1,
  };
  context.state.groups.set(group.id, group);
  groupRide(target, group.id);
  groupRide(joiner, group.id);
  context.emit(nearbyRemoved(context.eventEnvelope(), { kind: 'ride', id: target.id }, target.version, 'unavailable'));
  context.emit(rideChanged(context.eventEnvelope(), target));
  context.schedule(group.expiresAt, (later) => expireGroup(later, group.id));
  return group;
}

/** Whether `userId` is listed among the group's members now; a member who left is not. */
function isMember(group: GroupRecord, userId: string): boolean {
  return group.members.some((member) => member.userId === userId);
}

/**
 * `GET /groups/{groupId}`: the member-only group, for its current members.
 *
 * `MEMBERSHIP_REQUIRED` for an unknown group, a non-member and a member who left, so a private
 * read never reveals whether a group exists, and leaving ends access at once. A closed group
 * stays readable by the members it had at closure (for a group closed because members left,
 * the one who remained) until its `historyExpiresAt`, then answers `HISTORY_EXPIRED`.
 */
export function readGroup(context: Context, accessToken: string | null, groupId: string): RideGroupDto {
  const user = authenticate(context, accessToken);
  const group = context.state.groups.get(groupId);
  if (group === undefined || !isMember(group, user.id)) {
    throw context.sourceError('MEMBERSHIP_REQUIRED', 'Only this group’s members can see it.');
  }
  if (group.closure !== null && context.now >= group.closure.historyExpiresAt) {
    throw context.sourceError('HISTORY_EXPIRED', 'This group’s history is no longer kept.');
  }
  return toRideGroupDto(context.state, group);
}

/** Cancels a grouped request with its group; its `groupId` stays, naming the group it ended with. */
function cancelGrouped(ride: RideRecord | undefined): RideRecord | null {
  if (ride?.status !== 'grouped') return null;
  ride.status = 'cancelled';
  ride.version += 1;
  return ride;
}

/**
 * `DELETE /groups/{groupId}/members/me`: the caller leaves a live group.
 *
 * In this order: `VALIDATION_FAILED`, `UNAUTHENTICATED`/`SESSION_EXPIRED`, then the receipt: a
 * retry with the same operation ID returns the original result, even though the caller is no
 * longer a member; the same ID with another group fails with `IDEMPOTENCY_CONFLICT`. A new leave
 * then fails with `MEMBERSHIP_REQUIRED` for an unknown group or a non-member (a former member
 * too), and with `GROUP_CLOSED` for a completed or cancelled group. There is no version check.
 *
 * On success the caller is removed from the members, so their access ends at once, and their
 * request is `cancelled` (keeping the group's ID); nothing replaces it. Then:
 *
 * - **At least two remain:** a `ready` group returns to `forming`, keeping its meeting point; a
 *   `forming` group stays. If the coordinator left, the earliest remaining member (join order)
 *   takes over. Discovery shows the new count; the members are told (`group.changed`,
 *   `member_left`).
 * - **One remains:** the group is `cancelled` with closure `members_left`, closed now and
 *   readable by the remaining member for `GROUP_POLICY.historyRetentionSeconds`. That member
 *   becomes coordinator if needed (the coordinator is always listed) and their request is
 *   cancelled too. Discovery removes the group (`unavailable`); the members are told
 *   (`group.changed`, `cancelled`).
 *
 * Every owner whose request ended is told (`ride.changed`). The group's version rises once.
 */
export function leaveGroup(
  context: Context,
  accessToken: string | null,
  groupId: string,
  input: unknown,
): LeaveGroupResultDto {
  const parsed = LeaveGroupInputSchema.safeParse(input);
  if (!parsed.success) throw context.sourceError('VALIDATION_FAILED', 'The leave is not valid.');
  const { operationId } = parsed.data;
  const user = authenticate(context, accessToken);

  return context.receipts.once(
    { actorId: user.id, operationId },
    { operation: 'groups.leave', input: { groupId } },
    () => {
      const { state } = context;
      const group = state.groups.get(groupId);
      if (group === undefined || !isMember(group, user.id)) {
        throw context.sourceError('MEMBERSHIP_REQUIRED', 'You are not a member of this group.');
      }
      if (group.status === 'completed' || group.status === 'cancelled') {
        throw context.sourceError('GROUP_CLOSED', 'This group has already closed.');
      }

      const leaving = group.members.find((member) => member.userId === user.id);
      const own = cancelGrouped(state.rides.get(leaving?.rideRequestId ?? ''));
      if (own === null) throw new Error(`The leaver of group ${group.id} had no grouped request.`);
      group.members = group.members.filter((member) => member.userId !== user.id);
      const [earliest] = group.members;
      if (earliest === undefined) throw new Error(`Group ${group.id} had fewer than two members.`);
      if (group.coordinatorId === user.id) group.coordinatorId = earliest.userId;
      group.version += 1;
      const ended = [own];

      if (group.members.length >= GROUP_POLICY.minMembers) {
        if (group.status === 'ready') group.status = 'forming';
        context.emit(nearbyUpserted(context.eventEnvelope(), toNearbyItemDto(state, { kind: 'group', record: group })));
        context.emit(groupChanged(context.eventEnvelope(), group, 'member_left'));
      } else {
        group.status = 'cancelled';
        group.closure = {
          reason: 'members_left',
          closedAt: context.now,
          historyExpiresAt: context.now + GROUP_POLICY.historyRetentionSeconds * SECOND,
        };
        const remaining = cancelGrouped(state.rides.get(earliest.rideRequestId));
        if (remaining !== null) ended.push(remaining);
        context.emit(
          nearbyRemoved(context.eventEnvelope(), { kind: 'group', id: group.id }, group.version, 'unavailable'),
        );
        context.emit(groupChanged(context.eventEnvelope(), group, 'cancelled'));
      }

      for (const ride of ended) context.emit(rideChanged(context.eventEnvelope(), ride));
      return { groupId: group.id, rideRequest: toOwnRideRequestDto(state, own) };
    },
  );
}
