import { LeaveGroupResultSchema } from '@ride-match/contracts';
import { RideStore, domainError, live } from './store.js';
import type { RideRow, GroupRow } from './store.js';
import { closeGroup } from './lifecycle.js';

/**
 * Leaves inside an existing RideDomain transaction; never acquires a second domain lock.
 * Shared by ordinary leave and block-and-leave so revocation, transfer, receipts and
 * lifecycle effects cannot diverge. Returns only the leaver's own request.
 */
export async function leaveLiveGroup(store: RideStore, actor: string, id: string, now: Date) {
  const member = (await store.members(id)).find((entry) => entry.user_id === actor);
  const group = await store.group(id);
  if (!member || !group) throw domainError('MEMBERSHIP_REQUIRED', 403, 'Group membership required.');
  if (!live(group)) throw domainError('GROUP_CLOSED', 409, 'Group is closed.');
  await store.client.query('UPDATE ride_match.group_memberships SET left_at=$2,live=false WHERE id=$1', [member.id, now]);
  await store.client.query('UPDATE ride_match.operation_receipts SET result=NULL WHERE access_membership_id=$1', [member.id]);
  const own = (await store.client.query<RideRow>("UPDATE ride_match.ride_requests SET status='cancelled',version=version+1 WHERE id=$1 RETURNING *", [member.request_id])).rows[0]!;
  await store.intent('ride.changed', own.id, own.version, now);
  const remaining = await store.members(id);
  await store.client.query('UPDATE ride_match.ride_groups SET coordinator_id=$2 WHERE id=$1', [id,
    group.coordinator_id === actor ? remaining[0]!.user_id : group.coordinator_id]);
  if (remaining.length < 2) await closeGroup(store, (await store.group(id))!, 'cancelled', 'members_left', now);
  else {
    const updated = (await store.client.query<GroupRow>("UPDATE ride_match.ride_groups SET status='forming',version=version+1 WHERE id=$1 RETURNING *", [id])).rows[0]!;
    await store.intent('group.changed', id, updated.version, now, { reason: 'member_left' });
    await store.intent('nearby.upserted.group', id, updated.version, now);
  }
  await store.intent('access.revoked', member.id, (await store.group(id))!.version, now, { reason: 'left' });
  return LeaveGroupResultSchema.parse({ groupId: id, rideRequest: await store.ownRide(own) });
}
