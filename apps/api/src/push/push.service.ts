import { Inject, Injectable } from '@nestjs/common';
import type { NotificationPayloadDto } from '@ride-match/contracts';
import { RideDomain } from '../rides/domain.js';
import type { RideStore } from '../rides/store.js';
import { API_CONFIG } from '../config/environment.js';
import type { ApiConfig } from '../config/environment.js';
import { PUSH_PROVIDER } from './provider.js';
import type { PushProvider } from './provider.js';
import { pushAllowed } from './queue.js';
import { decryptToken } from '../devices/secrets.js';

type Delivery = {id:string;installation_id:string;revision:string;user_id:string;payload:NotificationPayloadDto;membership_id:string|null;ticket_id:string|null};
type Device = {session_id:string;token_cipher:string;permission:string;user_id:string};

/**
 * Durable claim before external IO gives at most one automatic POST attempt. Ambiguous/crashed
 * sending work is never blindly resent; Expo has no client idempotency key. A bounded request
 * holds domain/session/device locks through enqueue, preventing takeover/logout/leave races.
 * This intentionally limits local throughput. Accepted tickets are polled without resending.
 */
@Injectable()
export class PushService {
  constructor(@Inject(RideDomain) private readonly domain: RideDomain,@Inject(API_CONFIG) private readonly config:ApiConfig,@Inject(PUSH_PROVIDER) private readonly provider:PushProvider) {}
  async tick():Promise<void> {
    const item=await this.domain.deliver(async(store)=> (await store.client.query<Delivery>(`UPDATE ride_match.push_deliveries SET state='sending' WHERE id=(
      SELECT id FROM ride_match.push_deliveries WHERE state='pending' ORDER BY created_at,id LIMIT 1) AND state='pending' RETURNING *`)).rows[0]);
    if (item) {
      await this.domain.deliver(async(store,now)=> {
        const device=await this.registration(store,item,now);
        let state:string='cancelled'; let ticket:string|null=null;
        if (device && await pushAllowed(store,now,item.user_id,item.membership_id,item.payload)) {
          if (!this.provider.enabled) state='disabled';
          else {
            const result=await this.provider.send(decryptToken(this.config.API_AUTH_SECRET,device.token_cipher),item.payload);
            state=result.status==='unregistered' ? 'failed' : result.status;
            if(result.status==='accepted')ticket=result.ticketId;
            if(result.status==='unregistered') await this.removeRevision(store,item);
          }
        }
        await store.client.query('UPDATE ride_match.push_deliveries SET state=$2,ticket_id=$3,checked_at=$4 WHERE id=$1',[item.id,state,ticket,now]);
      });
    }
    await this.domain.deliver(async(store,now)=> {
      const pending=(await store.client.query<Delivery>(`SELECT * FROM ride_match.push_deliveries WHERE state='accepted' AND ticket_id IS NOT NULL
        AND checked_at <= $1 ORDER BY checked_at LIMIT 1`,[new Date(now.getTime()-60000)])).rows[0];
      if(pending && this.provider.enabled) {
        const device=await this.registration(store,pending,now);
        const result=await this.provider.receipt(pending.ticket_id!);
        if(result==='unregistered' && device) await this.removeRevision(store,pending);
        await store.client.query('UPDATE ride_match.push_deliveries SET ticket_id=$2,checked_at=$3,state=$4 WHERE id=$1',
          [pending.id,result==='pending'?pending.ticket_id:null,now,['failed','unregistered'].includes(result)?'failed':'accepted']);
      }
      await store.client.query('DELETE FROM ride_match.push_deliveries WHERE expires_at <= $1',[new Date(now.getTime()-86400000)]);
      await store.client.query(`DELETE FROM ride_match.push_devices d USING ride_match.sessions s WHERE d.session_id=s.id AND (s.revoked OR s.refresh_expires_at <= $1)`,[now]);
    });
  }
  private async registration(store:RideStore,item:Delivery,now:Date):Promise<Device|undefined> {
    const found=(await store.client.query<Device>('SELECT * FROM ride_match.push_devices WHERE installation_id=$1 AND revision=$2',[item.installation_id,item.revision])).rows[0];
    if(!found)return;
    const session=(await store.client.query<{revoked:boolean;refresh_expires_at:Date}>('SELECT revoked,refresh_expires_at FROM ride_match.sessions WHERE id=$1 FOR SHARE',[found.session_id])).rows[0];
    if(!session || session.revoked || session.refresh_expires_at<=now)return;
    const locked=(await store.client.query<Device>('SELECT * FROM ride_match.push_devices WHERE installation_id=$1 AND revision=$2 FOR SHARE',[item.installation_id,item.revision])).rows[0];
    return locked?.user_id===item.user_id && locked.permission==='granted' ? locked : undefined;
  }
  private async removeRevision(store:RideStore,item:Delivery):Promise<void> {
    await store.client.query('DELETE FROM ride_match.push_devices WHERE installation_id=$1 AND revision=$2',[item.installation_id,item.revision]);
  }
}
