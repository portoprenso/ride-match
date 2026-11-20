import { z } from 'zod';
import type { NotificationPayloadDto } from '@ride-match/contracts';
import type { ApiConfig } from '../config/environment.js';

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
export type PushResult = { status: 'accepted'; ticketId: string } | { status: 'unregistered' | 'failed' | 'unknown' };
export interface PushProvider {
  readonly enabled: boolean;
  send(token: string, payload: NotificationPayloadDto): Promise<PushResult>;
  receipt(ticketId: string): Promise<'ok' | 'pending' | 'unregistered' | 'failed'>;
}
const copy = {
  'matches.available': 'A person nearby is travelling in your direction.',
  'group.member_joined': 'Someone joined your group.',
  'group.ready': 'Your group is ready.',
  'chat.message_created': 'New message in your group chat.',
} as const;
const ticket = z.object({ status:z.enum(['ok','error']),id:z.string().min(1).max(256).optional(),details:z.object({error:z.string()}).optional() });

/**
 * Real fixed HTTPS Expo boundary, disabled by default. Generic copy and ID-only data; bounded
 * requests, no raw provider diagnostics. A lost POST result is unknown and is not auto-retried.
 * A ticket is Expo acceptance, not proof of OS delivery. No account is provisioned here.
 */
export function createPushProvider(config: ApiConfig, send: typeof fetch = globalThis.fetch): PushProvider {
  if (config.API_PUSH_PROVIDER !== 'expo') return { enabled:false,send:()=>Promise.resolve({status:'failed'}),receipt:()=>Promise.resolve('failed') };
  const post = async (path: string, body: unknown) => {
    const response = await send(`https://exp.host/--/api/v2/push/${path}`, { method:'POST',redirect:'error',signal:AbortSignal.timeout(1500),
      headers:{ Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${config.EXPO_PUSH_ACCESS_TOKEN!}` },body:JSON.stringify(body) });
    if (!response.ok) throw new Error('Push provider request failed');
    return response.json();
  };
  return {
    enabled:true,
    async send(token,payload) {
      try {
        const result = z.object({ data:ticket }).parse(await post('send', { to:token,title:'Ride Match',body:copy[payload.kind],data:payload,ttl:Math.max(1,Math.ceil((Date.parse(payload.expiresAt)-Date.now())/1000)),channelId:'ride-match' })).data;
        if (result.status === 'ok' && result.id) return { status:'accepted',ticketId:result.id };
        return { status:result.details?.error === 'DeviceNotRegistered' ? 'unregistered' : 'failed' };
      } catch { return {status:'unknown'}; }
    },
    async receipt(id) {
      try {
        const result = z.object({data:z.record(z.string(),ticket)}).parse(await post('getReceipts',{ids:[id]})).data[id];
        if (!result) return 'pending';
        return result.status === 'ok' ? 'ok' : result.details?.error === 'DeviceNotRegistered' ? 'unregistered' : 'failed';
      } catch { return 'pending'; }
    },
  };
}
