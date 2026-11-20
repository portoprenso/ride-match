import { createHash } from 'node:crypto';
import { RideMatchSetSchema } from '@ride-match/contracts';
import type { RideMatchDto } from '@ride-match/contracts';
import type { RideStore, RideRow } from './store.js';
import { publicCandidates } from './candidates.js';
import { compatible, distanceMeters } from './policy.js';

/** Recomputes the authoritative ordered set under the domain lock and journals changes atomically. */
export async function refreshMatches(store: RideStore, own: RideRow, now: Date) {
  const actor = own.user_id; const id = own.id;
  const matches: RideMatchDto[] = [];
  if (own.status === 'active') {
    const candidates = await publicCandidates(store, actor);
    const ranked = candidates.filter((item) => item.kind !== 'group' || (item.status === 'forming' && item.memberCount < 4))
      .map((item) => ({ item, level: compatible({ origin: store.origin(own).center, destinationId: own.destination.id, departure: own.departure_at.getTime() },
        { origin: item.publicOrigin.center, destinationId: item.destination.id, departure: Date.parse(item.departureAt) }) }))
      .filter((entry) => entry.level !== null)
      .sort((a, b) => {
        const rank = { excellent: 0, good: 1, possible: 2 };
        return rank[a.level!] - rank[b.level!] || distanceMeters(store.origin(own).center, a.item.publicOrigin.center) - distanceMeters(store.origin(own).center, b.item.publicOrigin.center) || `${a.item.kind}:${a.item.id}`.localeCompare(`${b.item.kind}:${b.item.id}`);
      }).slice(0, 20);
    for (const { item, level } of ranked) matches.push({ target: { kind: item.kind, id: item.id }, level: level!, additionalMinutes: null,
      expiresAt: new Date(Math.min(own.expires_at.getTime(), Date.parse(item.expiresAt))).toISOString() });
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(matches)).digest('hex');
  const previous = (await store.client.query<{ fingerprint: string; version: number; targets: {kind:string;id:string}[] }>('SELECT * FROM ride_match.match_sets WHERE request_id=$1', [id])).rows[0]!;
  const version = previous.version + Number(previous.fingerprint !== fingerprint);
  if (version !== previous.version) {
    await store.client.query('UPDATE ride_match.match_sets SET fingerprint=$2,version=$3,targets=$4 WHERE request_id=$1', [id, fingerprint, version, JSON.stringify(matches.map((m)=>m.target))]);
    const added = matches.filter((m) => !previous.targets.some((p) => p.kind === m.target.kind && p.id === m.target.id));
    await store.intent('matches.changed', id, version, now, {added:added.length>0,target:added.length===1 ? added[0]!.target : null});
  }
  return RideMatchSetSchema.parse({ version, matches });
}

/** Local eager invalidation trades throughput for correctness before a dedicated matching service. */
export async function refreshAllMatches(store: RideStore, now: Date): Promise<void> {
  const rows = (await store.client.query<RideRow>("SELECT r.* FROM ride_match.ride_requests r JOIN ride_match.match_sets m ON m.request_id=r.id ORDER BY r.id")).rows;
  for (const row of rows) await refreshMatches(store, row, now);
}
