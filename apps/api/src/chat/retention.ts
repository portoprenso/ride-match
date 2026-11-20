import type { RideStore } from '../rides/store.js';

/**
 * Purges live-table message bodies/sender snapshots and their pending event references at
 * history expiry, retaining only content-free intent tombstones/counters. Reports carry
 * references, never copied messages; local report bodies and event references expire at 7 d.
 * Runs inside the same serialized sweep before access checks, including refused retries.
 * Offline workers defer physical cleanup until the next sweep; authorization never waits.
 * This does not erase WAL/backups or define production auth/location retention.
 */
export async function purgePrivateContent(store: RideStore, now: Date): Promise<void> {
  await store.client.query(`DELETE FROM ride_match.domain_outbox o USING ride_match.chat_intents i,ride_match.ride_groups g
    WHERE o.kind='chat.message.created' AND o.resource_id=i.message_id AND i.group_id=g.id AND g.history_expires_at <= $1`, [now]);
  await store.client.query(`DELETE FROM ride_match.chat_messages m USING ride_match.ride_groups g
    WHERE m.group_id=g.id AND g.history_expires_at <= $1`, [now]);
  await store.client.query(`DELETE FROM ride_match.domain_outbox o USING ride_match.user_reports r
    WHERE o.kind='report.received' AND o.resource_id=r.id AND r.purge_at <= $1`, [now]);
  await store.client.query('DELETE FROM ride_match.user_reports WHERE purge_at <= $1', [now]);
}
