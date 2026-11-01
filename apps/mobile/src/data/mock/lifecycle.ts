import { GROUP_POLICY } from '@ride-match/contracts';

import { groupChanged, nearbyRemoved, nearbyUpserted, rideChanged, toNearbyItemDto } from './serializers';
import type { WorkContext } from './simulator';
import { isLiveGroup, type MockWorld, type RideRecord } from './world';

/*
 * Time-driven transitions of rides and groups. Each runs as simulator work, so its events are
 * published only once it completes, and it checks the current state first: a deadline task that
 * finds its record already ended does nothing.
 */

type Context = WorkContext<MockWorld>;

/** Schedules simulator work at a simulated time; both `Simulator.schedule` and `WorkContext.schedule` fit. */
export type Schedule = Context['schedule'];

/**
 * Ends an active request at its discovery deadline: it becomes `expired`, discovery removes it
 * with reason `expired`, and its owner is told. A grouped request is governed by its group's
 * deadline instead, so this leaves it alone.
 */
export function expireRide(context: Context, rideId: string): void {
  const ride = context.state.rides.get(rideId);
  if (ride?.status !== 'active') return;
  ride.status = 'expired';
  ride.version += 1;
  context.emit(nearbyRemoved(context.eventEnvelope(), { kind: 'ride', id: ride.id }, ride.version, 'expired'));
  context.emit(rideChanged(context.eventEnvelope(), ride));
}

/**
 * Cancels a live group at its deadline (`docs/api/groups.md`): the closure reason is `expired`,
 * dated at the deadline even when the task runs late after background time, and the history
 * stays readable for `GROUP_POLICY.historyRetentionSeconds`. Its members' grouped requests are
 * cancelled with it. Discovery removes the group with reason `expired`; the members and each
 * owner are told through their own audiences.
 */
export function expireGroup(context: Context, groupId: string): void {
  const group = context.state.groups.get(groupId);
  if (group === undefined || !isLiveGroup(group)) return;
  group.status = 'cancelled';
  group.closure = {
    reason: 'expired',
    closedAt: group.expiresAt,
    historyExpiresAt: group.expiresAt + GROUP_POLICY.historyRetentionSeconds * 1000,
  };
  group.version += 1;
  const cancelled: RideRecord[] = [];
  for (const member of group.members) {
    const ride = context.state.rides.get(member.rideRequestId);
    if (ride?.status !== 'grouped') continue;
    ride.status = 'cancelled';
    ride.version += 1;
    cancelled.push(ride);
  }
  context.emit(nearbyRemoved(context.eventEnvelope(), { kind: 'group', id: group.id }, group.version, 'expired'));
  context.emit(groupChanged(context.eventEnvelope(), group, 'cancelled'));
  for (const ride of cancelled) context.emit(rideChanged(context.eventEnvelope(), ride));
}

/**
 * Schedules the deadline of every active ride and live group in `world`. Scenarios call it on
 * activation; a record added later schedules its own deadline (see {@link admitRide}).
 */
export function scheduleDeadlines(world: MockWorld, schedule: Schedule): void {
  for (const ride of world.rides.values()) {
    if (ride.status === 'active') schedule(ride.expiresAt, (context) => expireRide(context, ride.id));
  }
  for (const group of world.groups.values()) {
    if (isLiveGroup(group)) schedule(group.expiresAt, (context) => expireGroup(context, group.id));
  }
}

/**
 * Adds another rider's new active request to the world, as a scenario's timed event: discovery
 * shows it at once (`nearby.upserted`) and its deadline is scheduled. The rider must already be
 * in the world and have no other live request.
 *
 * @throws {Error} When the ride is not active, its ID is taken, or its rider is unknown or
 *   already has a live request, which is a seed bug.
 */
export function admitRide(context: Context, ride: RideRecord): void {
  const { rides, users } = context.state;
  const riderIsBusy = [...rides.values()].some(
    (existing) => existing.userId === ride.userId && (existing.status === 'active' || existing.status === 'grouped'),
  );
  if (ride.status !== 'active' || rides.has(ride.id) || !users.has(ride.userId) || riderIsBusy) {
    throw new Error(`Ride ${ride.id} cannot be admitted as a new active request.`);
  }
  rides.set(ride.id, ride);
  context.emit(nearbyUpserted(context.eventEnvelope(), toNearbyItemDto(context.state, { kind: 'ride', record: ride })));
  context.schedule(ride.expiresAt, (later) => expireRide(later, ride.id));
}
