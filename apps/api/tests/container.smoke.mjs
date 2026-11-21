import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
const { fetch,AbortSignal } = globalThis;
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { io } from 'socket.io-client';

/** Runs Docker with explicit argument arrays; buffers sensitive outputs and reports only a fixed failure. */
function docker(args,input){return new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});const chunks=[];
  child.stdout.on('data',(data)=>chunks.push(data));child.stderr.resume();child.on('error',reject);
  child.on('close',(code)=>code===0?resolve(Buffer.concat(chunks)):reject(new Error('Owned container command failed')));
  child.stdin.end(input);
});}
async function until(read,predicate=(value)=>!!value){const end=Date.now()+45000;while(Date.now()<end){try{const value=await read();if(predicate(value))return value;}catch{/* Bounded state polling, not a mutation retry. */}await delay(200);}assert.fail('Container state not observed before deadline');}

// Explicit opt-in suite: never part of test:integration. Own random names/volume/network only.
test('BE-006 deployable image, schema readiness, DB recovery, dump/restore and shutdown',async()=>{
  const prefix=`be006-${randomUUID().replaceAll('-','')}`;const network=`${prefix}-net`,volume=`${prefix}-data`,db=`${prefix}-pg`,api=`${prefix}-api`;
  const directory=await mkdtemp(join(tmpdir(),'ride-match-be006-'));const environment=join(directory,'runtime.env');
  const containers=new Set();let networkCreated=false,volumeCreated=false,socket,primaryError;
  try{
    await writeFile(environment,`API_APP_ENV=production\nAPI_HOST=0.0.0.0\nAPI_PORT=3000\nDATABASE_URL=postgresql://synthetic_api:synthetic_password@${db}:5432/synthetic_runtime\nAPI_ALLOWED_ORIGINS=\nAPI_LOG_LEVEL=error\nAPI_AUTH_SECRET=synthetic-be006-runtime-hmac-key-for-local-test\nAPI_SMS_PROVIDER=disabled\nAPI_PUSH_PROVIDER=disabled\n`,{mode:0o600});
    await docker(['network','create','--label','ride-match.check=be006',network]);networkCreated=true;
    await docker(['volume','create','--label','ride-match.check=be006',volume]);volumeCreated=true;
    await docker(['run','-d','--name',db,'--label','ride-match.check=be006','--network',network,
      '-e','POSTGRES_USER=synthetic_api','-e','POSTGRES_PASSWORD=synthetic_password','-e','POSTGRES_DB=synthetic_runtime','-v',`${volume}:/var/lib/postgresql`,'postgres:18.1-bookworm']);containers.add(db);
    await until(()=>docker(['exec',db,'pg_isready','-U','synthetic_api','-d','synthetic_runtime']));
    await docker(['run','-d','--name',api,'--label','ride-match.check=be006','--network',network,'--env-file',environment,
      '--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--cap-drop','ALL','--security-opt','no-new-privileges:true','--init','-p','127.0.0.1::3000','ride-match-api:local']);containers.add(api);
    const port=JSON.parse((await docker(['inspect','--format','{{json .NetworkSettings.Ports}}',api])).toString())['3000/tcp'][0].HostPort;
    const base=`http://127.0.0.1:${port}`;
    const probe=(kind)=>fetch(`${base}/v1/health/${kind}`,{signal:AbortSignal.timeout(4500)});
    await until(()=>probe('live'),(response)=>response.status===200);
    assert.equal((await probe('ready')).status,503,'unmigrated DB is not ready');
    const migration=()=>docker(['run','--rm','--name',`${prefix}-migrate`,'--label','ride-match.check=be006','--network',network,'--env-file',environment,'--read-only','ride-match-api:local','node','dist/database/migrate.js']);
    assert.match((await migration()).toString(),/Migrations applied: 5/);assert.match((await migration()).toString(),/Migrations applied: 0/);
    await until(()=>probe('ready'),(response)=>response.status===200);
    await until(async()=>JSON.parse((await docker(['inspect','--format','{{json .State.Health}}',api])).toString()).Status==='healthy');
    const audit=JSON.parse((await docker(['exec',api,'node','--input-type=module','-e',"import{existsSync}from'node:fs';let dev=false;try{await import('typescript');dev=true}catch{};const c=await import('@ride-match/contracts');console.log(JSON.stringify({uid:process.getuid(),env:existsSync(process.cwd()+'/.env.local')||existsSync(process.cwd()+'/.env.runtime.local'),source:existsSync(process.cwd()+'/src'),dev,contracts:!!c.DomainEventSchema}))"])).toString());
    assert.ok(audit.uid>0);assert.equal(audit.env,false);assert.equal(audit.source,false);assert.equal(audit.dev,false);assert.equal(audit.contracts,true);
    const otp=await fetch(`${base}/v1/auth/otp/challenges`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:'+447700900600'})});
    assert.equal(otp.status,503);assert.equal((await otp.json()).code,'SERVICE_UNAVAILABLE','production image never fakes SMS success');
    socket=io(base,{path:'/v1/socket.io',transports:['websocket'],reconnection:false});
    await until(()=>socket.connected);
    const ack=await new Promise((resolve)=>socket.emit('rm:subscribe',{kind:'nearby',viewport:{southWest:{latitude:42.8,longitude:74.5},northEast:{latitude:42.95,longitude:74.7}}},resolve));assert.equal(ack.ok,true);
    const dump=await docker(['exec',db,'pg_dump','-U','synthetic_api','-d','synthetic_runtime','--format=custom','--no-owner','--no-acl']);
    await writeFile(join(directory,'synthetic.dump'),dump,{mode:0o600});
    await docker(['exec',db,'createdb','-U','synthetic_api','synthetic_restore']);
    await docker(['exec','-i',db,'pg_restore','-U','synthetic_api','-d','synthetic_restore','--exit-on-error','--no-owner','--no-acl'],dump);
    assert.equal((await docker(['exec',db,'psql','-U','synthetic_api','-d','synthetic_restore','-Atc','SELECT count(*) FROM schema_migrations'])).toString().trim(),'5');
    assert.equal((await docker(['exec',db,'psql','-U','synthetic_api','-d','synthetic_restore','-Atc','SELECT count(*) FROM ride_match.places'])).toString().trim(),'3');
    await docker(['exec',db,'dropdb','-U','synthetic_api','synthetic_restore']);
    await docker(['stop','--time','10',db]);assert.equal((await probe('live')).status,200);assert.equal((await probe('ready')).status,503);
    await docker(['start',db]);await until(()=>probe('ready'),(response)=>response.status===200);
    socket.connect();await until(()=>socket.connected);
    let shutdownDisconnect=false;socket.once('disconnect',()=>{shutdownDisconnect=true;});
    await docker(['stop','--time','15',api]);const state=JSON.parse((await docker(['inspect','--format','{{json .State}}',api])).toString());
    assert.ok([0,143].includes(state.ExitCode));assert.equal(state.OOMKilled,false);await until(()=>!socket.connected && shutdownDisconnect);
  }catch(error){primaryError=error;}finally{
    socket?.disconnect();
    const errors=[];
    for(const name of containers)try{await docker(['rm','-f',name]);}catch(error){errors.push(error);}
    // A timed-out one-off migration belongs only to this test's random prefix.
    try{const exists=(await docker(['ps','-aq','--filter',`name=^/${prefix}-migrate$`])).toString().trim();if(exists)await docker(['rm','-f',`${prefix}-migrate`]);}catch(error){errors.push(error);}
    if(volumeCreated)try{await docker(['volume','rm',volume]);}catch(error){errors.push(error);}
    if(networkCreated)try{await docker(['network','rm',network]);}catch(error){errors.push(error);}
    await rm(directory,{recursive:true,force:true});if(errors.length)primaryError=new AggregateError([...(primaryError?[primaryError]:[]),...errors],'Owned container cleanup failed');
  }
  if(primaryError)throw primaryError;
});
