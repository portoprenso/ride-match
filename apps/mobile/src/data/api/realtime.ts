import { io } from 'socket.io-client';
import { ApiErrorSchema, DomainEventSchema, SubscriptionAckSchema, SubscriptionRequestSchema } from '@ride-match/contracts';
import type { EventOperations, AccessTokenSource, ConnectionState, EventSubscription } from '../AppDataSource';
import { DataError } from '../errors';

type Wire = {subscriptionId:string;event:unknown};
/** Socket owns one connection generation. Reconnect ends old subscriptions; the existing coordinator resubscribes then refetches. */
export function createRealtime(options:{baseUrl:string;accessToken:AccessTokenSource;timeoutMs?:number}) {
  const url=new URL(options.baseUrl);
  const socket=io(url.origin,{path:`${url.pathname.replace(/\/$/,'')}/socket.io`,autoConnect:false,forceNew:true,transports:['websocket'],
    reconnection:true,reconnectionDelay:500,reconnectionDelayMax:5000,timeout:options.timeoutMs??10000,
    auth:(done)=> {const token=options.accessToken();done(token?{token}:{});} });
  let state:ConnectionState='disconnected'; let disposed=false;let token=options.accessToken();let generation=0;
  let renewing:Promise<void>|null=null;let renew:(()=>Promise<void>)|null=null;
  const waits=new Set<()=>void>();
  let reconnectTimer:ReturnType<typeof setTimeout>|undefined;
  const listeners=new Set<(state:ConnectionState)=>void>();
  const subscriptions=new Map<string,{listener:(event:unknown)=>void;generation:number}>();
  const change=(next:ConnectionState)=> {if(state!==next){state=next;for(const listener of listeners)listener(next);}};
  const reset=()=>{generation++;subscriptions.clear();change('disconnected');};
  const reconnect=()=>{if(disposed)return;reset();socket.disconnect();socket.connect();};
  const recover=(value:unknown)=> {
    const parsed=ApiErrorSchema.safeParse(value);
    if(parsed.success && parsed.data.code==='SERVICE_UNAVAILABLE' && !disposed){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>{if(!disposed)socket.connect();},1000);}
    if(parsed.success && ['SESSION_EXPIRED','UNAUTHENTICATED'].includes(parsed.data.code) && renew && !renewing) {
      renewing=renew().then(()=>{const next=options.accessToken();if(next!==token){token=next;reconnect();}else if(!socket.connected && !socket.active)socket.connect();},()=>{reset();socket.disconnect();}).finally(()=>{renewing=null;});
    }
  };
  socket.on('connect',()=> {token=options.accessToken();change('connected');});
  socket.on('disconnect',(reason)=>{reset();if(reason==='io server disconnect' && !renewing && !disposed)socket.connect();});
  socket.on('connect_error',(error:{data?:unknown})=>{reset();recover(error.data);});
  socket.on('rm:session-error',(error:unknown)=>{recover(error);});
  socket.on('rm:ended',(value:{subscriptionId?:unknown})=>{if(typeof value?.subscriptionId==='string')subscriptions.delete(value.subscriptionId);});
  socket.on('rm:event',(value:Wire)=> {
    const sub=subscriptions.get(value?.subscriptionId);
    if(sub && sub.generation===generation) {
      const parsed=DomainEventSchema.safeParse(value.event);
      // An invalid wire event resets the connection generation and forces resubscribe/refetch, without logging body content.
      if(parsed.success)sub.listener(parsed.data);else reconnect();
    }
  });
  const connected=async()=> {
    if(disposed)throw new DataError('unavailable','Realtime was disposed.');
    if(socket.connected)return;
    await new Promise<void>((resolve,reject)=> {
      const timer=setTimeout(()=>{cleanup();reject(new DataError('network','Realtime connection unavailable.'));},options.timeoutMs??10000);
      const ready=()=>{cleanup();resolve();};
      const cancel=()=>{cleanup();reject(new DataError('aborted','Realtime was disposed.'));};
      const cleanup=()=>{clearTimeout(timer);socket.off('connect',ready);waits.delete(cancel);};
      waits.add(cancel);
      socket.once('connect',ready);socket.connect();
    });
  };
  const events:EventOperations={
    watchConnection(listener){listener(state);listeners.add(listener);if(!disposed)socket.connect();return()=>{listeners.delete(listener);};},
    async subscribe(request,onEvent):Promise<EventSubscription> {
      const parsed=SubscriptionRequestSchema.safeParse(request);
      if(!parsed.success)throw new DataError('unexpected','Invalid subscription request.');
      await connected();const current=generation;
      const ack=await new Promise<ReturnType<typeof SubscriptionAckSchema.parse>>((resolve,reject)=> {
        socket.timeout(options.timeoutMs??10000).emit('rm:subscribe',parsed.data,(error:unknown,value:unknown)=> {
          if(error){reject(new DataError('network','Subscription was not acknowledged.'));return;}
          if(disposed || current!==generation){reject(new DataError('aborted','Connection changed.'));return;}
          const response=value as {ok?:boolean;data?:unknown;error?:unknown};
          if(response?.ok!==true){reject(DataError.fromSource(response?.error));return;}
          const result=SubscriptionAckSchema.safeParse(response.data);
          if(!result.success || JSON.stringify(result.data.subscription)!==JSON.stringify(parsed.data)){reject(new DataError('unexpected','Invalid subscription acknowledgement.'));return;}
          subscriptions.set(result.data.subscriptionId,{generation:current,listener:(event)=>onEvent(event as never)});
          resolve(result.data);
        });
      });
      return {ack,async unsubscribe(){subscriptions.delete(ack.subscriptionId);if(socket.connected && current===generation)socket.emit('rm:unsubscribe',{subscriptionId:ack.subscriptionId});}};
    },
  };
  return {events,setSessionRenewal(callback:()=>Promise<void>){renew=callback;},identityChanged(){const next=options.accessToken();if(next!==token){token=next;if(listeners.size || socket.connected)reconnect();}},
    dispose(){disposed=true;clearTimeout(reconnectTimer);for(const cancel of [...waits])cancel();reset();listeners.clear();socket.removeAllListeners();socket.disconnect();}};
}
