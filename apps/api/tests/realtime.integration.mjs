import { resetDomain } from './reset-domain.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { io } from 'socket.io-client';
import { DomainEventSchema,NotificationPayloadSchema } from '@ride-match/contracts';
import { createApplication } from '../dist/application.js';
import { readEnvironment } from '../dist/config/environment.js';
import { createPool } from '../dist/database/pool.js';
import { runMigrations } from '../dist/database/migrations.js';
import { loadMobileAdapter } from './mobile-adapter.mjs';
const viewport={southWest:{latitude:42.80,longitude:74.50},northEast:{latitude:42.95,longitude:74.70}};
const input=()=>({operationId:randomUUID(),origin:{source:'manual',coordinates:{latitude:42.8753,longitude:74.6067}},destinationPlaceId:'dev_central_square',departureOffsetMinutes:0});
async function until(read,predicate=(value)=>!!value){const end=Date.now()+8000;while(Date.now()<end){const value=await read();if(predicate(value))return value;await delay(30);}assert.fail('Expected state was not observed before the bounded deadline');}
const rejected=(promise,code)=>assert.rejects(promise,(error)=>error.code===code);
const fetch=(url,options)=>globalThis.fetch(url,{...options,headers:{...options?.headers,Connection:'close'}});

test('BE-005 two-instance realtime, revocation, devices and generic push boundary',async(t)=>{
  const config=readEnvironment(process.env);const url=new URL(config.DATABASE_URL);
  assert.ok(config.API_APP_ENV!=='production' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  const admin=createPool(config.DATABASE_URL);const name=`be005_${randomUUID().replaceAll('-','')}`;
  let database,first,second,mobile,created=false,base;
  let time=Date.parse('2026-11-20T10:00:00Z');const clock={now:()=>new Date(time)};
  const actors=[],extra=[],posts=[];const receipts=new Map();
  const provider={enabled:true,async send(token,payload){NotificationPayloadSchema.parse(payload);const id=randomUUID();posts.push({token,payload});return {status:'accepted',ticketId:id};},async receipt(id){return receipts.get(id)??'ok';}};
  async function reset(){for(const actor of actors){actor.adapter.identityChanged();}time+=60000;await resetDomain(database,`TRUNCATE ride_match.current_requests,ride_match.ride_origins,ride_match.operation_receipts,ride_match.domain_outbox,
    ride_match.match_sets,ride_match.group_meeting_points,ride_match.group_memberships,ride_match.ride_requests,ride_match.ride_groups,ride_match.user_blocks,ride_match.rate_limits,ride_match.push_devices,ride_match.push_deliveries CASCADE`);posts.length=0;}
  const create=(a)=>a.api.rides.create(input());
  async function form(){const target=await create(actors[0]);const own=await create(actors[1]);return (await actors[1].api.groups.join({operationId:randomUUID(),rideRequestId:own.id,target:{kind:'ride',id:target.id}})).group;}
  async function watch(actor,scope){const events=[];const subscription=await actor.api.events.subscribe(scope,(event)=>{DomainEventSchema.parse(event);events.push(event);});return {events,subscription};}
  const rawSocket=(auth={})=>{const socket=io(base,{path:'/v1/socket.io',transports:['websocket'],auth,forceNew:true,reconnection:false});extra.push({dispose:()=>socket.disconnect()});return socket;};
  try{
    await admin.query(`CREATE DATABASE ${name}`);created=true;url.pathname=`/${name}`;database=createPool(url.href,'migration');assert.equal(await runMigrations(database),5);
    const isolated={...config,DATABASE_URL:url.href,API_LOG_LEVEL:'error'};
    first=await createApplication(isolated,{clock,pushProvider:provider,realtimePollMs:40});await first.listen(0,'127.0.0.1');base=await first.getUrl();
    second=await createApplication(isolated,{clock,pushProvider:provider,realtimePollMs:40});await second.listen(0,'127.0.0.1');mobile=await loadMobileAdapter();
    for(let n=0;n<5;n++){
      let session;const adapter=mobile.createHttpDataSource({baseUrl:`${n%2?await second.getUrl():base}/v1`,accessToken:()=>session?.getAccessToken()??null,now:()=>time,fetch});
      session=mobile.createSessionController({auth:adapter.dataSource.auth,resumeStoredSession:true,store:{read:async()=>null,write:async()=>undefined,clear:async()=>undefined}});
      const api=mobile.withSessionRenewal(adapter.dataSource,()=>session);adapter.setSessionRenewal(async()=>{await api.auth.getCurrentUser();});session.subscribe(()=>adapter.identityChanged());
      const challenge=await api.auth.requestOtp({phoneNumber:`+4477009007${String(n).padStart(2,'0')}`});await session.signIn({challengeId:challenge.id,code:'123456'});
      actors.push({adapter,session,api,id:session.getState().user.id});
    }
    await t.test('strict acknowledgements, anonymous scopes, cross-instance public/private event projection',async()=>{
      await reset();const anon=mobile.createHttpDataSource({baseUrl:`${base}/v1`,accessToken:()=>null,fetch});extra.push(anon);
      const nearby=await watch({api:anon.dataSource},{kind:'nearby',viewport});
      await rejected(anon.dataSource.events.subscribe({kind:'user'},()=>{}),'UNAUTHENTICATED');
      const own=await watch(actors[0],{kind:'user'});const target=await create(actors[0]);
      await until(()=>nearby.events.find((event)=>event.type==='nearby.upserted'&&event.payload.item.id===target.id));
      await until(()=>own.events.find((event)=>event.type==='ride.changed'&&event.payload.rideRequestId===target.id));
      assert.ok(nearby.events.every((event)=>event.audience.kind==='public'));assert.ok(!JSON.stringify(nearby.events).includes('"origin"'));
      const request=await create(actors[1]);const group=(await actors[1].api.groups.join({operationId:randomUUID(),rideRequestId:request.id,target:{kind:'ride',id:target.id}})).group;
      const firstWatch=await watch(actors[0],{kind:'group',groupId:group.id});const secondWatch=await watch(actors[1],{kind:'group',groupId:group.id});
      const message=await actors[1].api.chat.send(group.id,{clientMessageId:randomUUID(),text:'Synthetic realtime message'});
      await until(()=>firstWatch.events.find((event)=>event.type==='chat.message.created'&&event.payload.message.id===message.id));
      await until(()=>secondWatch.events.find((event)=>event.type==='chat.message.created'&&event.payload.message.id===message.id));
      assert.ok(!JSON.stringify(nearby.events).includes(message.text));
      await firstWatch.subscription.unsubscribe();const held=firstWatch.events.length;
      await actors[1].api.chat.send(group.id,{clientMessageId:randomUUID(),text:'Synthetic after unsubscribe'});await delay(150);assert.equal(firstWatch.events.length,held);
      for(const item of [nearby,own,secondWatch])await item.subscription.unsubscribe();anon.dispose();
    });
    await t.test('leave/block revoke old group scopes and public visibility; unblock supersedes tombstones',async()=>{
      await reset();const group=await form();const user=await watch(actors[0],{kind:'user'});const groupWatch=await watch(actors[0],{kind:'group',groupId:group.id});
      await actors[0].api.safety.block(actors[1].id,{operationId:randomUUID()});
      await until(()=>user.events.find((event)=>event.type==='access.revoked'&&event.payload.groupId===group.id));
      await rejected(actors[0].api.groups.getGroup(group.id),'MEMBERSHIP_REQUIRED');const held=groupWatch.events.filter((event)=>event.type==='chat.message.created').length;
      await rejected(actors[0].api.chat.send(group.id,{clientMessageId:randomUUID(),text:'Synthetic denied'}),'MEMBERSHIP_REQUIRED');await delay(100);
      assert.equal(groupWatch.events.filter((event)=>event.type==='chat.message.created').length,held);
      const b=await create(actors[1]);const discovery=await watch(actors[0],{kind:'nearby',viewport});
      await actors[0].api.safety.unblock(actors[1].id);
      const up=await until(()=>discovery.events.find((event)=>event.type==='nearby.upserted'&&event.payload.item.id===b.id));
      await actors[0].api.safety.block(actors[1].id,{operationId:randomUUID()});
      const removed=await until(()=>discovery.events.find((event)=>event.type==='nearby.removed'&&event.payload.target.id===b.id));assert.ok(removed.payload.version>up.payload.item.version);
      await actors[0].api.safety.unblock(actors[1].id);
      await until(()=>discovery.events.find((event)=>event.type==='nearby.upserted'&&event.payload.item.id===b.id&&event.payload.item.version>removed.payload.version));
      for(const item of [user,groupWatch,discovery])await item.subscription.unsubscribe();
    });
    await t.test('connection generations, refresh and catch-up after a missed message',async()=>{
      await reset();const group=await form();let user=await watch(actors[0],{kind:'user'});let groupWatch=await watch(actors[0],{kind:'group',groupId:group.id});
      const states=[];const stop=actors[0].api.events.watchConnection((state)=>states.push(state));
      time+=15*60000+1;
      await until(()=>states.includes('disconnected'));await until(()=>states.at(-1)==='connected');
      user=await watch(actors[0],{kind:'user'});groupWatch=await watch(actors[0],{kind:'group',groupId:group.id});
      await groupWatch.subscription.unsubscribe();const message=await actors[1].api.chat.send(group.id,{clientMessageId:randomUUID(),text:'Synthetic missed event'});
      groupWatch=await watch(actors[0],{kind:'group',groupId:group.id});
      const page=await actors[0].api.chat.getHistory(group.id,{afterSequence:0,limit:50});assert.equal(page.messages[0].id,message.id);
      await user.subscription.unsubscribe();await groupWatch.subscription.unsubscribe();
      const port=Number(new URL(base).port);await first.close();
      const missed=await actors[1].api.chat.send(group.id,{clientMessageId:randomUUID(),text:'Synthetic during server outage'});
      first=await createApplication(isolated,{clock,pushProvider:provider,realtimePollMs:40});await first.listen(port,'127.0.0.1');
      await until(()=>states.at(-1)==='connected');groupWatch=await watch(actors[0],{kind:'group',groupId:group.id});
      assert.ok((await actors[0].api.chat.getHistory(group.id,{afterSequence:message.sequence,limit:50})).messages.some((item)=>item.id===missed.id));
      await groupWatch.subscription.unsubscribe();stop();
    });
    await t.test('device installation/token reassignment, session cleanup and no plaintext persistence',async()=>{
      await reset();const id=randomUUID();const token='ExpoPushToken[synthetic-be005-shared]';
      const register=(actor,installation=id,value=token)=>actor.api.devices.register(installation,{pushToken:value,platform:'ios',permission:'granted'});
      assert.deepEqual(Object.keys(await register(actors[0])).sort(),['installationId','registeredAt']);
      let row=(await database.query('SELECT * FROM ride_match.push_devices')).rows[0];
      assert.ok(!JSON.stringify(row).includes(token));await register(actors[0]);assert.equal((await database.query('SELECT revision FROM ride_match.push_devices')).rows[0].revision,row.revision);await register(actors[1]);await actors[0].api.devices.remove(id);
      assert.equal((await database.query('SELECT user_id FROM ride_match.push_devices')).rows[0].user_id,actors[1].id);
      assert.equal((await actors[0].session.signOut()).revoked,true);assert.equal((await database.query('SELECT 1 FROM ride_match.push_devices')).rowCount,1);
      const other=randomUUID();await register(actors[2],other);assert.equal((await database.query('SELECT 1 FROM ride_match.push_devices')).rowCount,1);
      await actors[2].api.devices.remove(other);await actors[2].api.devices.remove(other);assert.equal((await database.query('SELECT 1 FROM ride_match.push_devices')).rowCount,0);
      // Restore actor 0 after its deliberately revoked session for the next journey.
      const challenge=await actors[0].api.auth.requestOtp({phoneNumber:'+447700900700'});await actors[0].session.signIn({challengeId:challenge.id,code:'123456'});
    });
    await t.test('generic pushes use current revision/membership, never sender content; receipts retire only matching tokens',async()=>{
      await reset();const a=actors[0],b=actors[1];const id=randomUUID();const token='ExpoPushToken[synthetic-be005-recipient]';
      await a.api.devices.register(id,{pushToken:token,platform:'ios',permission:'granted'});const group=await form();
      await until(()=>posts.find((item)=>item.payload.kind==='group.member_joined'));
      posts.length=0;const message=await b.api.chat.send(group.id,{clientMessageId:randomUUID(),text:'Synthetic secret message body'});
      const post=await until(()=>posts.find((item)=>item.payload.kind==='chat.message_created'&&item.payload.messageId===message.id));
      assert.equal(post.token,token);assert.ok(!JSON.stringify(post.payload).includes(message.text));assert.ok(!JSON.stringify(post.payload).includes(b.id));
      const accepted=await until(async()=> (await database.query("SELECT * FROM ride_match.push_deliveries WHERE state='accepted' AND payload->>'messageId'=$1",[message.id])).rows[0]);
      receipts.set(accepted.ticket_id,'unregistered');time+=60001;
      await until(async()=>!(await database.query('SELECT 1 FROM ride_match.push_devices WHERE installation_id=$1',[id])).rowCount);
      const outbox=(await database.query('SELECT * FROM ride_match.domain_outbox')).rows;assert.ok(!JSON.stringify(outbox).includes(message.text));
    });
    await t.test('history expiry revokes sockets and purges queued private message references',async()=>{
      await reset();const group=await form();let user=await watch(actors[0],{kind:'user'});let privateScope=await watch(actors[0],{kind:'group',groupId:group.id});
      await actors[1].api.chat.send(group.id,{clientMessageId:randomUUID(),text:'Synthetic expiring message'});
      const closed=await actors[0].api.groups.updateStatus(group.id,{operationId:randomUUID(),expectedVersion:group.version,status:'cancelled'});
      time=Date.parse(closed.closure.historyExpiresAt)-1000;
      await actors[0].api.auth.getCurrentUser();await user.subscription.unsubscribe();await privateScope.subscription.unsubscribe();
      user=await watch(actors[0],{kind:'user'});privateScope=await watch(actors[0],{kind:'group',groupId:group.id});
      time=Date.parse(closed.closure.historyExpiresAt);
      await until(()=>user.events.find((event)=>event.type==='access.revoked'&&event.payload.reason==='history_expired'));
      await rejected(actors[0].api.events.subscribe({kind:'group',groupId:group.id},()=>{}),'HISTORY_EXPIRED');
      assert.equal((await database.query('SELECT 1 FROM ride_match.chat_messages')).rowCount,0);
      assert.equal((await database.query("SELECT 1 FROM ride_match.domain_outbox WHERE kind='chat.message.created'")).rowCount,0);
      await user.subscription.unsubscribe();await privateScope.subscription.unsubscribe();
    });
    await t.test('stale installation revision cancels queued work and cannot delete a reassigned token on late receipt',async()=>{
      await reset();const id=randomUUID();const a=actors[0],b=actors[1];
      await a.api.devices.register(id,{pushToken:'ExpoPushToken[synthetic-old-revision]',platform:'ios',permission:'granted'});
      const original=(await database.query('SELECT revision FROM ride_match.push_devices WHERE installation_id=$1',[id])).rows[0].revision;
      await b.api.devices.register(id,{pushToken:'ExpoPushToken[synthetic-new-revision]',platform:'ios',permission:'granted'});
      const delivery=randomUUID();const ticket=randomUUID();const payload={id:randomUUID(),schemaVersion:1,kind:'matches.available',rideRequestId:'synthetic-missing',target:null,issuedAt:new Date(time).toISOString(),expiresAt:new Date(time+600000).toISOString()};
      await database.query("INSERT INTO ride_match.push_deliveries (id,event_id,installation_id,revision,user_id,payload,state,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8)",[delivery,randomUUID(),id,original,a.id,JSON.stringify(payload),new Date(time),payload.expiresAt]);
      await until(async()=>(await database.query('SELECT state FROM ride_match.push_deliveries WHERE id=$1',[delivery])).rows[0]?.state==='cancelled');
      assert.equal(posts.length,0);
      receipts.set(ticket,'unregistered');await database.query("UPDATE ride_match.push_deliveries SET state='accepted',ticket_id=$2,checked_at=$3 WHERE id=$1",[delivery,ticket,new Date(time-60001)]);
      await until(async()=>(await database.query('SELECT state FROM ride_match.push_deliveries WHERE id=$1',[delivery])).rows[0]?.state==='failed');
      assert.equal((await database.query('SELECT user_id FROM ride_match.push_devices WHERE installation_id=$1',[id])).rows[0].user_id,b.id);
    });
    await t.test('invalid credentials and caller-named rooms are refused with safe request IDs',async()=>{
      const bad=rawSocket({token:'synthetic-invalid-bearer'});const error=await new Promise((resolve)=>bad.once('connect_error',resolve));assert.equal(error.data.code,'UNAUTHENTICATED');assert.ok(error.data.requestId);bad.disconnect();
      const socket=rawSocket();await new Promise((resolve)=>socket.once('connect',resolve));
      const ack=await new Promise((resolve)=>socket.emit('rm:subscribe',{kind:'user',userId:actors[0].id,room:'arbitrary'},resolve));assert.equal(ack.error.code,'VALIDATION_FAILED');socket.disconnect();
    });
  }finally{
    for(const item of extra)item.dispose();for(const actor of actors){actor.adapter.dispose();actor.session.dispose();}
    if(first)await first.close();if(second)await second.close();if(mobile)await mobile.dispose();if(database)await database.end();
    try{if(created)await admin.query(`DROP DATABASE ${name}`);}finally{await admin.end();}
  }
});
