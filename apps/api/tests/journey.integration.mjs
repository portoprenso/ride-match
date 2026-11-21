import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createApplication } from '../dist/application.js';
import { readEnvironment } from '../dist/config/environment.js';
import { createPool } from '../dist/database/pool.js';
import { runMigrations } from '../dist/database/migrations.js';
import { loadMobileAdapter } from './mobile-adapter.mjs';
const fetch=(url,options)=>globalThis.fetch(url,{...options,headers:{...options?.headers,Connection:'close'}});
const viewport={southWest:{latitude:42.8,longitude:74.5},northEast:{latitude:42.95,longitude:74.7}};
const rejected=(promise,code)=>assert.rejects(promise,(error)=>error.code===code);
async function until(read){const end=Date.now()+8000;while(Date.now()<end){const value=await read();if(value)return value;await delay(30);}assert.fail('Journey state not observed before deadline');}

// One coherent user journey crosses all implemented slices; it is not a native/device smoke.
test('BE-006 five-user journey: discovery → race → chat/restart → report/block → complete/expiry/logout',async()=>{
  const config=readEnvironment(process.env);const url=new URL(config.DATABASE_URL);
  assert.ok(config.API_APP_ENV!=='production'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname));
  const admin=createPool(config.DATABASE_URL);const name=`be006_${randomUUID().replaceAll('-','')}`;
  let first,second,database,mobile,anonymous,created=false,time=Date.parse('2026-11-20T10:00:00Z');const clock={now:()=>new Date(time)};
  const actors=[],subscriptions=[];
  try{
    await admin.query(`CREATE DATABASE ${name}`);created=true;url.pathname=`/${name}`;database=createPool(url.href,'migration');assert.equal(await runMigrations(database),5);
    const isolated={...config,DATABASE_URL:url.href,API_LOG_LEVEL:'error',API_PUSH_PROVIDER:'disabled'};
    first=await createApplication(isolated,{clock});await first.listen(0,'127.0.0.1');const base=await first.getUrl();
    second=await createApplication(isolated,{clock});await second.listen(0,'127.0.0.1');mobile=await loadMobileAdapter();
    anonymous=mobile.createHttpDataSource({baseUrl:`${base}/v1`,accessToken:()=>null,fetch});
    const nearbyEvents=[];subscriptions.push(await anonymous.dataSource.events.subscribe({kind:'nearby',viewport},(event)=>nearbyEvents.push(event)));
    assert.deepEqual((await anonymous.dataSource.rides.getNearby({viewport,limit:20})).items,[]);
    const places=await anonymous.dataSource.places.search({area:{center:{latitude:42.88,longitude:74.6},radiusMeters:10000},limit:5});assert.ok(places.length);
    for(let n=0;n<5;n++){
      let session;const actor={dropMessage:false};
      actor.adapter=mobile.createHttpDataSource({baseUrl:`${n%2?await second.getUrl():base}/v1`,accessToken:()=>session?.getAccessToken()??null,now:()=>time,
        fetch:async(url,options)=>{const response=await fetch(url,options);if(actor.dropMessage&&response.ok&&options.method==='POST'&&String(url).endsWith('/messages')){actor.dropMessage=false;await response.arrayBuffer();throw new Error('Synthetic committed response loss');}return response;}});
      session=mobile.createSessionController({auth:actor.adapter.dataSource.auth,resumeStoredSession:true,store:{read:async()=>null,write:async()=>undefined,clear:async()=>undefined}});
      actor.session=session;actor.api=mobile.withSessionRenewal(actor.adapter.dataSource,()=>session);actor.adapter.setSessionRenewal(async()=>{await actor.api.auth.getCurrentUser();});session.subscribe(()=>actor.adapter.identityChanged());
      const challenge=await actor.api.auth.requestOtp({phoneNumber:`+4477009005${String(n).padStart(2,'0')}`});await session.signIn({challengeId:challenge.id,code:'123456'});actor.id=session.getState().user.id;
      actor.request=await actor.api.rides.create({operationId:randomUUID(),origin:{source:'manual',coordinates:{latitude:42.8753,longitude:74.6067}},destinationPlaceId:'dev_central_square',departureOffsetMinutes:0});actors.push(actor);
    }
    assert.equal((await anonymous.dataSource.rides.getNearby({viewport,limit:20})).items.length,5);
    assert.ok((await actors[0].api.rides.getMatches(actors[0].request.id)).matches.length);
    const installationId=randomUUID();await actors[1].api.devices.register(installationId,{pushToken:'ExpoPushToken[synthetic-be006-journey]',platform:'ios',permission:'granted'});
    const join=(actor)=>actor.api.groups.join({operationId:randomUUID(),rideRequestId:actor.request.id,target:{kind:'ride',id:actors[0].request.id}});
    const firstJoins=await Promise.all([join(actors[1]),join(actors[2])]);assert.equal(firstJoins[0].group.id,firstJoins[1].group.id);
    const last=await Promise.allSettled([join(actors[3]),join(actors[4])]);assert.equal(last.filter((result)=>result.status==='fulfilled').length,1);
    const losing=actors[last[0].status==='rejected'?3:4];assert.equal((await losing.api.rides.getOwnRequest()).status,'active');
    let group=await actors[0].api.groups.getGroup(firstJoins[0].group.id);assert.equal(group.members.length,4);assert.ok(group.meetingPoint);
    await rejected(losing.api.groups.getGroup(group.id),'MEMBERSHIP_REQUIRED');assert.ok(!('members' in await losing.api.groups.getPreview(group.id)));
    const events=[];subscriptions.push(await actors[2].api.events.subscribe({kind:'group',groupId:group.id},(event)=>events.push(event)));
    group=await actors[0].api.groups.updateStatus(group.id,{operationId:randomUUID(),expectedVersion:group.version,status:'ready'});
    await until(()=>events.find((event)=>event.type==='group.changed'&&event.payload.reason==='ready'));
    const intent={clientMessageId:randomUUID(),text:'Synthetic shared ride journey message'};actors[1].dropMessage=true;
    await assert.rejects(actors[1].api.chat.send(group.id,intent),(error)=>error.kind==='network');
    const message=await actors[1].api.chat.send(group.id,intent);assert.equal(message.sequence,1);assert.equal((await database.query('SELECT count(*)::int n FROM ride_match.chat_messages')).rows[0].n,1);
    await until(()=>events.find((event)=>event.type==='chat.message.created'&&event.payload.message.id===message.id));assert.ok(!JSON.stringify(nearbyEvents).includes(intent.text));
    const port=Number(new URL(base).port);await first.close();
    await actors[1].api.chat.send(group.id,{clientMessageId:randomUUID(),text:'Synthetic message while peer server restarts'});
    first=await createApplication(isolated,{clock});await first.listen(port,'127.0.0.1');
    assert.equal((await actors[0].api.chat.getHistory(group.id,{afterSequence:0,limit:50})).messages.length,2);
    const revocations=[];subscriptions.push(await actors[0].api.events.subscribe({kind:'user'},(event)=>revocations.push(event)));
    const receipt=await actors[0].api.safety.report({operationId:randomUUID(),targetUserId:actors[1].id,reason:'other',details:'Synthetic integration report',context:{groupId:group.id,messageId:message.id}});assert.deepEqual(Object.keys(receipt).sort(),['id','receivedAt']);
    const blocked=await actors[0].api.safety.block(actors[1].id,{operationId:randomUUID()});assert.equal(blocked.leftGroup.groupId,group.id);
    await until(()=>revocations.find((event)=>event.type==='access.revoked'&&event.payload.groupId===group.id));await rejected(actors[0].api.groups.getGroup(group.id),'MEMBERSHIP_REQUIRED');
    group=await actors[1].api.groups.getGroup(group.id);assert.equal(group.members.length,3);assert.equal(group.status,'forming');
    const coordinator=actors.find((actor)=>actor.id===group.coordinatorId);
    group=await coordinator.api.groups.updateStatus(group.id,{operationId:randomUUID(),expectedVersion:group.version,status:'ready'});
    group=await coordinator.api.groups.updateStatus(group.id,{operationId:randomUUID(),expectedVersion:group.version,status:'completed'});
    assert.equal((await actors[1].api.rides.getOwnRequest()).status,'completed');assert.equal((await actors[1].api.chat.getHistory(group.id,{limit:50})).messages.length,2);
    await until(async()=> (await database.query("SELECT 1 FROM ride_match.push_deliveries WHERE state='disabled'")).rowCount);
    assert.equal((await actors[1].session.signOut()).revoked,true);assert.equal((await database.query('SELECT 1 FROM ride_match.push_devices WHERE installation_id=$1',[installationId])).rowCount,0);
    time=Date.parse(group.closure.historyExpiresAt);await rejected(actors[2].api.groups.getGroup(group.id),'HISTORY_EXPIRED');
    assert.equal((await database.query('SELECT 1 FROM ride_match.chat_messages')).rowCount,0);
    assert.equal((await fetch(`${base}/v1/health/ready`)).status,200);
  }finally{
    for(const sub of subscriptions)await sub.unsubscribe();anonymous?.dispose();for(const actor of actors){actor.adapter.dispose();actor.session.dispose();}
    if(first)await first.close();if(second)await second.close();if(mobile)await mobile.dispose();if(database)await database.end();
    try{if(created)await admin.query(`DROP DATABASE ${name}`);}finally{await admin.end();}
  }
});
