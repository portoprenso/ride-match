import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import { SubscriptionRequestSchema, UnsubscribeInputSchema } from '@ride-match/contracts';
import { AuthService } from '../auth/auth.service.js';
import { CLOCK } from '../auth/runtime.js';
import type { Clock } from '../auth/runtime.js';
import { RideDomain } from '../rides/domain.js';
import { ApiException } from '../http/api-exception.js';
import { domainError } from '../rides/store.js';
import { API_CONFIG } from '../config/environment.js';
import type { ApiConfig } from '../config/environment.js';
import { PushService } from '../push/push.service.js';
import { project } from './project.js';
import type { Intent, Scope } from './project.js';

type Events = Record<string,(...args:unknown[])=>void>;
type SocketData = {authorization?:string};
type LiveSocket = Socket<Events,Events,Events,SocketData>;
type Sub = Scope & {id:string;cursor:bigint};
type Client = {socket:LiveSocket;authorization?:string;subs:Map<string,Sub>};
const failure=(error:unknown)=> ({...(error instanceof ApiException ? error.failure : {code:'SERVICE_UNAVAILABLE',message:'Service temporarily unavailable.'}),requestId:randomUUID()});

/**
 * Local Socket.IO transport on /v1/socket.io. No room names from clients and no stored bearer
 * in DB/URLs. Per-instance cursors fan out committed references without Redis; disconnect
 * recovery uses subscribe-before-snapshot. Every queue operation rechecks session and epoch
 * while holding domain then session locks; in-flight bytes cannot be recalled after enqueue.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private io?:Server<Events,Events,Events,SocketData>;
  private timer?:ReturnType<typeof setInterval>;
  private running?:Promise<void>;
  private clients=new Set<Client>();
  constructor(@Inject(AuthService) private readonly auth:AuthService,@Inject(RideDomain) private readonly domain:RideDomain,
    @Inject(API_CONFIG) private readonly config:ApiConfig,@Inject(PushService) private readonly push:PushService,
    @Inject(CLOCK) private readonly clock:Clock) {}

  attach(server:HttpServer,pollMs=250):void {
    this.io=new Server<Events,Events,Events,SocketData>(server,{path:'/v1/socket.io',serveClient:false,transports:['websocket'],maxHttpBufferSize:16384,
      perMessageDeflate:false,cors:{origin:this.config.API_ALLOWED_ORIGINS},allowRequest:(request,done)=>done(null,!request.headers.origin || this.config.API_ALLOWED_ORIGINS.includes(request.headers.origin))});
    this.io.use((socket,next)=> {
      void (async()=> {
        const input:unknown=socket.handshake.auth;
        if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some((key)=>key!=='token')) throw domainError('UNAUTHENTICATED',401,'Authentication required.');
        const token=(input as {token?:unknown}).token;
        if(token!==undefined && (typeof token!=='string' || token.length>4096)) throw domainError('UNAUTHENTICATED',401,'Authentication required.');
        const authorization=token===undefined ? undefined : `Bearer ${token}`;
        await this.auth.rateLimit('socket.connect',socket.handshake.address);
        await this.auth.authenticate(authorization,true);
        socket.data.authorization=authorization;
      })().then(()=>next(),(error:unknown)=> {const safe=new Error('Connection refused.');Object.assign(safe,{data:failure(error)});next(safe);});
    });
    this.io.on('connection',(socket)=> {
      const client:Client={socket,authorization:socket.data.authorization,subs:new Map()};this.clients.add(client);
      socket.on('disconnect',()=> {client.subs.clear();this.clients.delete(client);});
      socket.on('rm:subscribe',(value:unknown,ack:unknown)=> {void this.subscribe(client,value,ack);});
      socket.on('rm:unsubscribe',(value:unknown,ack:unknown)=> {
        const reply=typeof ack==='function' ? ack as (value:unknown)=>void : ()=>undefined;
        const parsed=UnsubscribeInputSchema.safeParse(value);
        if(!parsed.success){reply({ok:false,error:failure(domainError('VALIDATION_FAILED',422,'Invalid subscription.'))});return;}
        client.subs.delete(parsed.data.subscriptionId);reply({ok:true});
      });
    });
    this.timer=setInterval(()=> {
      if(this.running)return;
      this.running=this.tick().catch(()=> {new Logger('Realtime').error('realtime_tick_failed');this.disconnectAll();}).finally(()=>{this.running=undefined;});
    },Math.max(25,pollMs));this.timer.unref();
  }
  private async subscribe(client:Client,value:unknown,ack:unknown):Promise<void> {
    if(typeof ack!=='function')return;
    const reply=ack as (value:unknown)=>void;
    try {
      const parsed=SubscriptionRequestSchema.safeParse(value);
      if(!parsed.success)throw domainError('VALIDATION_FAILED',422,'Invalid subscription.');
      await this.auth.rateLimit('socket.subscribe',client.socket.handshake.address);
      await this.domain.run(()=>Promise.resolve());
      await this.domain.deliver(async(store,now)=> {
        const identity=await this.auth.authenticateSession(client.authorization,parsed.data.kind==='nearby',store.client);
        if(client.subs.size>=8)throw domainError('RATE_LIMITED',429,'Subscription limit reached.');
        let membership:string|undefined;
        if(parsed.data.kind==='group') membership=(await store.readable(parsed.data.groupId,identity!.userId,now)).member.id;
        if(parsed.data.kind==='nearby') {
          const {southWest:sw,northEast:ne}=parsed.data.viewport;
          if(!(await store.client.query('SELECT 1 FROM ride_match.place_coverage WHERE north >= $1 AND south <= $2 AND east >= $3 AND west <= $4',[sw.latitude,ne.latitude,sw.longitude,ne.longitude])).rowCount)throw domainError('UNSUPPORTED_AREA',422,'Viewport is not supported.');
        }
        if(!client.socket.connected)return;
        const cursor=BigInt((await store.client.query<{n:string}>('SELECT COALESCE(max(ordinal),0)::text n FROM ride_match.domain_outbox')).rows[0]!.n);
        const sub:Sub={id:randomUUID(),request:parsed.data,actor:identity?.userId??null,membership,cursor};client.subs.set(sub.id,sub);
        reply({ok:true,data:{subscriptionId:sub.id,subscription:sub.request}});
      });
    }catch(error){reply({ok:false,error:failure(error)});}
  }
  /**
   * Rechecks source-clock deadlines after awaited projection, immediately before enqueue.
   * Locks preserve session/epoch state, but cannot freeze time during database reads.
   * Exposed for deterministic integration checks; timer calls never overlap.
   */
  async tick():Promise<void> {
    await this.domain.run(()=>Promise.resolve());
    for(const client of this.clients) {
      try {
        await this.domain.deliver(async(store)=> {
          const identity=await this.auth.authenticateSession(client.authorization,true,store.client);
          for(const sub of [...client.subs.values()]) {
            let historyDeadline:number|undefined;
            if(sub.request.kind==='group') {
              try{
                const {group}=await store.readable(sub.request.groupId,sub.actor!,this.clock.now(),sub.membership);
                historyDeadline=group.history_expires_at?.getTime() ?? group.expires_at.getTime()+3600000;
              }
              catch(error){if(!(error instanceof ApiException))throw error;client.subs.delete(sub.id);client.socket.emit('rm:ended',{subscriptionId:sub.id});continue;}
            }
            const canQueue=(at:Date):boolean=> {
              if(identity && identity.expiresAt<=at)throw domainError('SESSION_EXPIRED',401,'Session expired.');
              if(historyDeadline!==undefined && historyDeadline<=at.getTime()){client.subs.delete(sub.id);client.socket.emit('rm:ended',{subscriptionId:sub.id});return false;}
              return true;
            };
            const rows=(await store.client.query<Intent>('SELECT * FROM ride_match.domain_outbox WHERE ordinal>$1 ORDER BY ordinal LIMIT 100',[sub.cursor.toString()])).rows;
            for(const row of rows) {
              const now=this.clock.now();
              if(!canQueue(now))break;
              const event=await project(store,now,sub,row);
              if(!canQueue(this.clock.now()))break;
              if(event && client.socket.connected && client.subs.has(sub.id))client.socket.emit('rm:event',{subscriptionId:sub.id,event});
              sub.cursor=BigInt(row.ordinal);
            }
          }
        });
      }catch(error){client.socket.emit('rm:session-error',failure(error));client.socket.disconnect(true);}
    }
    await this.push.tick();
  }
  private disconnectAll():void{for(const client of this.clients)client.socket.disconnect(true);}
  async onModuleDestroy():Promise<void>{clearInterval(this.timer);await this.running;this.disconnectAll();await this.io?.close();}
}
