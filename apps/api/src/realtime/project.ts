import { DomainEventSchema } from '@ride-match/contracts';
import type { DomainEventDto, SubscriptionRequest } from '@ride-match/contracts';
import type { RideStore, MemberRow } from '../rides/store.js';
import { live } from '../rides/store.js';

export type Intent = { id: string; ordinal: string; kind: string; resource_id: string; version: number; occurred_at: Date; details: { reason?: string; actorId?: string; added?: boolean; target?: {kind: 'ride' | 'group';id:string} | null } };
export type Scope = { request: SubscriptionRequest; actor: string | null; membership?: string };

/** Purely reference-based committed projection. Private checks happen immediately before queueing under domain/session locks. */
export async function project(store: RideStore, now: Date, scope: Scope, row: Intent): Promise<DomainEventDto | null> {
  const envelope = { id: row.id, schemaVersion: 1, occurredAt: row.occurred_at.toISOString() };
  const { request, actor } = scope;
  if (request.kind === 'nearby') {
    const kind = row.kind.endsWith('.ride') ? 'ride' : row.kind.endsWith('.group') ? 'group' : null;
    if (!row.kind.startsWith('nearby.') || !kind) return null;
    const ride = kind === 'ride' ? await store.ride(row.resource_id) : undefined;
    const group = kind === 'group' ? await store.group(row.resource_id) : undefined;
    const resource = ride ?? group;
    if (!resource) return null;
    const { southWest: sw, northEast: ne } = request.viewport;
    if (resource.public_latitude < sw.latitude || resource.public_latitude > ne.latitude || resource.public_longitude < sw.longitude || resource.public_longitude > ne.longitude) return null;
    const participants = ride ? [ride.user_id] : (await store.members(group!.id)).map((m) => m.user_id);
    if (participants.includes(actor ?? '')) return null;
    const hidden = actor && await store.relationship(actor, participants);
    const available = !hidden && (ride ? ride.status === 'active' && ride.expires_at > now : live(group!) && group!.expires_at > now);
    const version = group?.public_version ?? ride!.version;
    if (available) return DomainEventSchema.parse({ ...envelope, type: 'nearby.upserted', audience: { kind:'public' },
      payload: { item: ride ? { kind:'ride',...await store.publicRide(ride) } : { kind:'group',...await store.preview(group!) } } });
    return DomainEventSchema.parse({ ...envelope, type: 'nearby.removed', audience: { kind:'public' },
      payload: { target:{ kind,id:resource.id },version,reason: ride?.status === 'expired' || group?.closure_reason === 'expired' ? 'expired' : 'unavailable' } });
  }
  if (request.kind === 'user' && actor) {
    if (row.kind === 'ride.changed' || row.kind === 'matches.changed') {
      const ride = await store.ride(row.resource_id);
      if (!ride || ride.user_id !== actor) return null;
      if (row.kind === 'ride.changed') return DomainEventSchema.parse({ ...envelope,type:'ride.changed',audience:{ kind:'user',userId:actor }, payload:{ rideRequestId:ride.id,version:ride.version,status:ride.status } });
      const set = (await store.client.query<{version:number}>('SELECT version FROM ride_match.match_sets WHERE request_id=$1',[ride.id])).rows[0]!;
      return DomainEventSchema.parse({ ...envelope,type:'matches.changed',audience:{kind:'user',userId:actor},payload:{rideRequestId:ride.id,version:set.version} });
    }
    if (row.kind === 'access.revoked') {
      const member = (await store.client.query<MemberRow>('SELECT * FROM ride_match.group_memberships WHERE id=$1',[row.resource_id])).rows[0];
      if (!member || member.user_id !== actor) return null;
      if ((await store.members(member.group_id)).some((m) => m.user_id === actor && m.id !== member.id)) return null;
      return DomainEventSchema.parse({ ...envelope,type:'access.revoked',audience:{kind:'user',userId:actor},payload:{groupId:member.group_id,version:row.version,reason:row.details.reason ?? 'left'} });
    }
    return null;
  }
  if (request.kind !== 'group' || !actor) return null;
  await store.readable(request.groupId,actor,now,scope.membership);
  const group = (await store.group(request.groupId))!;
  // Even before a delayed sweep, original deadlines bound all private delivery.
  if (live(group) && now.getTime() >= group.expires_at.getTime() + 3600000) return null;
  if (row.kind === 'group.changed' && row.resource_id === group.id) {
    return DomainEventSchema.parse({ ...envelope,type:'group.changed',audience:{kind:'group',groupId:group.id},payload:{groupId:group.id,version:group.version,
      reason:group.status === 'completed' ? 'completed' : group.status === 'cancelled' ? 'cancelled' : row.details.reason ?? 'member_joined'} });
  }
  if (row.kind === 'chat.message.created') {
    const message = (await store.client.query<{ id:string; group_id:string; sequence:number; sender:unknown; text:string; created_at:Date; client_message_id:string }>(`SELECT m.*,i.client_message_id FROM ride_match.chat_messages m
      JOIN ride_match.chat_intents i ON i.message_id=m.id WHERE m.id=$1 AND m.group_id=$2`,[row.resource_id,group.id])).rows[0];
    if (!message) return null;
    return DomainEventSchema.parse({ ...envelope,type:'chat.message.created',audience:{kind:'group',groupId:group.id},payload:{message:{id:message.id,groupId:group.id,sender:message.sender,text:message.text,
      sequence:message.sequence,createdAt:message.created_at.toISOString(),clientMessageId:message.client_message_id}} });
  }
  return null;
}
