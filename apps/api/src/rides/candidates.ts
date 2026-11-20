import type { NearbyItemDto } from '@ride-match/contracts';
import { RideStore } from './store.js';
import type { RideRow, GroupRow } from './store.js';

/** Public candidates omit exact origins and, for authenticated discovery, the viewer's own intentions. */
export async function publicCandidates(store: RideStore, actor: string | null): Promise<NearbyItemDto[]> {
  const rides = (await store.client.query<RideRow>("SELECT * FROM ride_match.ride_requests WHERE status='active' ORDER BY id")).rows;
  const groups = (await store.client.query<GroupRow>("SELECT * FROM ride_match.ride_groups WHERE status IN ('forming','ready') ORDER BY id")).rows;
  const items: NearbyItemDto[] = [];
  for (const ride of rides) if (ride.user_id !== actor && (!actor || !await store.relationship(actor, [ride.user_id]))) items.push({ kind: 'ride', ...await store.publicRide(ride) });
  for (const group of groups) {
    if (actor && (await store.members(group.id)).some((member) => member.user_id === actor)) continue;
    if (actor && await store.relationship(actor, (await store.members(group.id)).map((m) => m.user_id))) continue;
    items.push({ kind: 'group', ...await store.preview(group) });
  }
  return items;
}
