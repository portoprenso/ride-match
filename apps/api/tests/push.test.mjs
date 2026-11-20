import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encryptToken,decryptToken,tokenDigest } from '../dist/devices/secrets.js';
import { createPushProvider } from '../dist/push/provider.js';
const secret='synthetic-encryption-key-only';
const payload={id:'synthetic-notification',schemaVersion:1,kind:'chat.message_created',groupId:'synthetic-group',messageId:'synthetic-message',issuedAt:'2026-11-20T10:00:00Z',expiresAt:'2026-11-20T10:01:00Z'};
test('push token encryption is authenticated and token index is keyed/domain separated',()=>{
  const token='ExpoPushToken[synthetic]';const a=encryptToken(secret,token);const b=encryptToken(secret,token);
  assert.notEqual(a,b);assert.ok(!a.includes(token));assert.equal(decryptToken(secret,a),token);
  assert.throws(()=>decryptToken('other-key',a));assert.notEqual(tokenDigest(secret,token),tokenDigest('other-key',token));
});
test('disabled push never calls a network provider or claims delivery',async()=>{
  const provider=createPushProvider({API_PUSH_PROVIDER:'disabled'},()=>{throw new Error('Must not send');});
  assert.equal(provider.enabled,false);assert.equal((await provider.send('ExpoPushToken[synthetic]',payload)).status,'failed');
});
test('Expo boundary uses fixed generic copy and ID-only data; acceptance/receipt/unknown are distinct',async()=>{
  const calls=[];
  const provider=createPushProvider({API_PUSH_PROVIDER:'expo',EXPO_PUSH_ACCESS_TOKEN:'synthetic-provider-key'},async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.endsWith('send')?{data:{status:'ok',id:'synthetic-ticket'}}:{data:{'synthetic-ticket':{status:'error',details:{error:'DeviceNotRegistered'}}}}};
  });
  assert.deepEqual(await provider.send('ExpoPushToken[synthetic]',payload),{status:'accepted',ticketId:'synthetic-ticket'});
  assert.equal(calls[0].body.body,'New message in your group chat.');assert.deepEqual(calls[0].body.data,payload);
  assert.equal(await provider.receipt('synthetic-ticket'),'unregistered');
  const unavailable=createPushProvider({API_PUSH_PROVIDER:'expo',EXPO_PUSH_ACCESS_TOKEN:'synthetic-provider-key'},()=>Promise.reject(new Error('Synthetic network failure')));
  assert.equal((await unavailable.send('ExpoPushToken[synthetic]',payload)).status,'unknown');
});
