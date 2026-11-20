import { purgePrivateContent } from '../chat/retention.js';
import { randomUUID } from 'node:crypto';
import { distanceMeters } from './policy.js';
import { RideStore } from './store.js';
import type { GroupRow, RideRow } from './store.js';

/** Closes group + linked live requests atomically; expiry uses its original deadline after a restart. */
export async function closeGroup(store: RideStore, group: GroupRow, status: 'completed' | 'cancelled',
  reason: 'completed' | 'coordinator_cancelled' | 'expired' | 'members_left', now: Date, closedAt = now): Promise<GroupRow> {
  const rows = (await store.client.query<RideRow>(`UPDATE ride_match.ride_requests SET status=$2,version=version+1
    WHERE group_id=$1 AND status='grouped' RETURNING *`, [group.id, status === 'completed' ? 'completed' : 'cancelled'])).rows;
  await store.client.query('UPDATE ride_match.group_memberships SET live=false WHERE group_id=$1', [group.id]);
  const updated = (await store.client.query<GroupRow>(`UPDATE ride_match.ride_groups SET status=$2,closure_reason=$3,
    closed_at=$4,history_expires_at=$5,version=version+1 WHERE id=$1 RETURNING *`,
  [group.id, status, reason, closedAt, new Date(closedAt.getTime() + 3600000)])).rows[0]!;
  for (const row of rows) await store.intent('ride.changed', row.id, row.version, now);
  await store.intent('group.changed', group.id, updated.version, now, { reason: status });
  await store.intent('nearby.removed.group', group.id, updated.version, now);
  return updated;
}

/**
 * Source-owned landmark policy: a public venue within 3 km of the group's fixed
 * coarse origin, suggested immediately. Changes get a new ID and reopen ready
 * groups. Closed groups are never recomputed; no walking estimate is fabricated.
 */
export async function reconcilePoint(store: RideStore, group: GroupRow, now: Date): Promise<void> {
  const places = (await store.client.query<{ id: string; label: string; latitude: number; longitude: number }>('SELECT id,label,latitude,longitude FROM ride_match.places')).rows;
  const origin = store.origin(group).center;
  const chosen = places.map((place) => ({ place, distance: distanceMeters(origin, place) }))
    .filter(({ distance }) => distance <= 3000).sort((a, b) => a.distance - b.distance || a.place.id.localeCompare(b.place.id))[0]?.place;
  const previous = await store.point(group.id);
  if ((!chosen && !previous) || (chosen && previous && chosen.label === previous.label &&
    chosen.latitude === previous.coordinates.latitude && chosen.longitude === previous.coordinates.longitude)) return;
  await store.client.query('DELETE FROM ride_match.group_meeting_points WHERE group_id=$1', [group.id]);
  if (chosen) await store.client.query('INSERT INTO ride_match.group_meeting_points VALUES ($1,$2,$3,$4,$5,$6)', [group.id, randomUUID(), chosen.id, chosen.latitude, chosen.longitude, chosen.label]);
  const updated = (await store.client.query<GroupRow>(`UPDATE ride_match.ride_groups SET status='forming',version=version+1 WHERE id=$1 RETURNING *`, [group.id])).rows[0]!;
  await store.intent('group.changed', group.id, updated.version, now, { reason: 'meeting_point_changed' });
  await store.intent('nearby.upserted.group', group.id, updated.version, now);
}

/** All authoritative domain operations catch up first; the worker is only a timeliness optimization. */
export async function sweep(store: RideStore, now: Date): Promise<void> {
  const expired = (await store.client.query<RideRow>(`UPDATE ride_match.ride_requests SET status='expired',version=version+1
    WHERE status='active' AND expires_at <= $1 RETURNING *`, [now])).rows;
  for (const row of expired) {
    await store.intent('ride.changed', row.id, row.version, now);
    await store.intent('nearby.removed.ride', row.id, row.version, now);
  }
  const groups = (await store.client.query<GroupRow>("SELECT * FROM ride_match.ride_groups WHERE status IN ('forming','ready') ORDER BY id")).rows;
  for (const group of groups) {
    if (group.expires_at <= now) await closeGroup(store, group, 'cancelled', 'expired', now, group.expires_at);
    else await reconcilePoint(store, group, now);
  }
  const historyExpired = (await store.client.query<{ id: string; version: number }>(`UPDATE ride_match.ride_groups SET history_revoked=true
    WHERE history_expires_at <= $1 AND NOT history_revoked RETURNING id,version`, [now])).rows;
  for (const group of historyExpired) for (const member of await store.members(group.id)) {
    await store.intent('access.revoked', member.id, group.version, now, { reason: 'history_expired' });
  }
  await store.client.query(`UPDATE ride_match.operation_receipts r SET result=NULL
    FROM ride_match.group_memberships m JOIN ride_match.ride_groups g ON g.id=m.group_id
    WHERE r.access_membership_id=m.id AND r.result IS NOT NULL AND (m.left_at IS NOT NULL OR g.history_expires_at <= $1)`, [now]);
  await purgePrivateContent(store, now);
  // Retain key/fingerprint tombstones so an old key can never execute again.
  await store.client.query('UPDATE ride_match.operation_receipts SET result=NULL WHERE replay_until <= $1 AND result IS NOT NULL', [now]);
}
