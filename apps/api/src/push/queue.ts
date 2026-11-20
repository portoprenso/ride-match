import { ApiException } from '../http/api-exception.js';
import { randomUUID } from 'node:crypto';
import { NotificationPayloadSchema } from '@ride-match/contracts';
import type { NotificationPayloadDto } from '@ride-match/contracts';
import type { RideStore } from '../rides/store.js';
import type { Intent } from '../realtime/project.js';

/** Reference-only push work is committed with domain/outbox changes; registrations bind the current revision and membership epoch. */
export async function prepareNotifications(store: RideStore, now: Date): Promise<void> {
  const rows = (await store.client.query<Intent>('SELECT * FROM ride_match.domain_outbox WHERE NOT push_prepared ORDER BY ordinal')).rows;
  for (const row of rows) {
    const targets: {actor:string;membership?:string}[] = [];
    let shape: Record<string,unknown> | null = null;
    let expires = now.getTime();
    if (row.kind === 'matches.changed' && row.details.added) {
      const ride = await store.ride(row.resource_id);
      if (ride?.status === 'active' && ride.expires_at > now) { targets.push({actor:ride.user_id}); expires=ride.expires_at.getTime(); shape={kind:'matches.available',rideRequestId:ride.id,target:row.details.target ?? null}; }
    }
    if (row.kind === 'group.changed' && ['member_joined','ready'].includes(row.details.reason ?? '')) {
      const group = await store.group(row.resource_id);
      if (group && group.expires_at > now && group.version === row.version && (group.status === 'forming' || group.status === 'ready')) {
        for (const member of await store.members(group.id)) if (member.user_id !== row.details.actorId) targets.push({actor:member.user_id,membership:member.id});
        expires=group.expires_at.getTime(); shape={kind:row.details.reason === 'ready' ? 'group.ready' : 'group.member_joined',groupId:group.id};
      }
    }
    if (row.kind === 'chat.message.created') {
      const intent = (await store.client.query<{group_id:string;sender_id:string}>('SELECT group_id,sender_id FROM ride_match.chat_intents WHERE message_id=$1',[row.resource_id])).rows[0];
      const group = intent ? await store.group(intent.group_id) : null;
      if (group && group.expires_at > now) {
        for (const member of await store.members(group.id)) if (member.user_id !== intent!.sender_id) targets.push({actor:member.user_id,membership:member.id});
        expires=group.expires_at.getTime(); shape={kind:'chat.message_created',groupId:group.id,messageId:row.resource_id};
      }
    }
    if (shape) for (const recipient of targets) {
      const devices = (await store.client.query<{installation_id:string;revision:string}>(`SELECT d.installation_id,d.revision FROM ride_match.push_devices d JOIN ride_match.sessions s ON s.id=d.session_id
        WHERE d.user_id=$1 AND d.permission='granted' AND NOT s.revoked AND s.refresh_expires_at > $2`,[recipient.actor,now])).rows;
      for (const device of devices) {
        const payload = NotificationPayloadSchema.parse({...shape,id:randomUUID(),schemaVersion:1,issuedAt:now.toISOString(),expiresAt:new Date(Math.min(expires,now.getTime()+3600000)).toISOString()});
        await store.client.query(`INSERT INTO ride_match.push_deliveries (id,event_id,installation_id,revision,user_id,payload,state,created_at,expires_at,membership_id)
          VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9) ON CONFLICT (event_id,installation_id,revision) DO NOTHING`,
        [randomUUID(),row.id,device.installation_id,device.revision,recipient.actor,JSON.stringify(payload),now,payload.expiresAt,recipient.membership ?? null]);
      }
    }
    await store.client.query('UPDATE ride_match.domain_outbox SET push_prepared=true WHERE id=$1',[row.id]);
  }
}

/** Current authorization, resource state and original epoch are rechecked before external enqueue. */
export async function pushAllowed(store: RideStore, now: Date, actor: string, membership: string | null, payload: NotificationPayloadDto): Promise<boolean> {
  if (Date.parse(payload.expiresAt) <= now.getTime()) return false;
  if (payload.kind === 'matches.available') {
    const ride=await store.ride(payload.rideRequestId);
    if (!ride || ride.user_id!==actor || ride.status!=='active' || ride.expires_at<=now) return false;
    const set=(await store.client.query<{targets:{kind:string;id:string}[]}>('SELECT targets FROM ride_match.match_sets WHERE request_id=$1',[ride.id])).rows[0];
    return !!set?.targets.length && (!payload.target || set.targets.some((t)=>t.kind===payload.target!.kind && t.id===payload.target!.id));
  }
  try {
    const {group}=await store.readable(payload.groupId,actor,now,membership ?? undefined);
    if (payload.kind==='group.ready') return group.status==='ready' && group.expires_at>now;
    if (payload.kind==='group.member_joined') return ['forming','ready'].includes(group.status) && group.expires_at>now;
    return !!(await store.client.query('SELECT 1 FROM ride_match.chat_messages WHERE id=$1 AND group_id=$2',[payload.messageId,payload.groupId])).rowCount;
  } catch (error) { if(error instanceof ApiException)return false;throw error; }
}
