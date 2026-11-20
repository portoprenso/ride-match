import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import { test } from 'node:test';
import { createApplication } from '../dist/application.js';
import { readEnvironment } from '../dist/config/environment.js';
import { createPool } from '../dist/database/pool.js';
import { runMigrations } from '../dist/database/migrations.js';
import { loadMobileAdapter } from './mobile-adapter.mjs';
// Keep the Node test client's idle sockets from racing a server restart on the same port.
// This is a fixture transport choice, not a mutation retry in the mobile adapter.
const fetch = (url, options) => globalThis.fetch(url, { ...options, headers: { ...options?.headers, Connection: 'close' } });
const rejected = (promise, code) => assert.rejects(promise, (error) => error.code === code);
const viewport = { southWest: { latitude: 42.80, longitude: 74.50 }, northEast: { latitude: 42.95, longitude: 74.70 } };
const createInput = () => ({ operationId: randomUUID(), origin: { source: 'manual', coordinates: { latitude: 42.8753, longitude: 74.6067 } }, destinationPlaceId: 'dev_central_square', departureOffsetMinutes: 0 });
const sendInput = (text = 'Synthetic test message') => ({ clientMessageId: randomUUID(), text });

test('BE-004 two-instance chat/safety persistence, privacy, races and purge', async (t) => {
  const config = readEnvironment(process.env);
  const url = new URL(config.DATABASE_URL);
  assert.ok(config.API_APP_ENV !== 'production' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname));
  const admin = createPool(config.DATABASE_URL);
  const name = `be004_${randomUUID().replaceAll('-', '')}`;
  let created = false, database, first, second, mobile, base, isolated;
  let time = Date.parse('2026-11-20T10:00:00Z');
  const clock = { now: () => new Date(time) };
  const actors = [];
  async function reset() {
    time += 60000;
    await database.query(`TRUNCATE ride_match.current_requests,ride_match.ride_origins,ride_match.operation_receipts,
      ride_match.domain_outbox,ride_match.match_sets,ride_match.group_meeting_points,ride_match.group_memberships,
      ride_match.ride_requests,ride_match.ride_groups,ride_match.user_blocks,ride_match.rate_limits CASCADE`);
  }
  async function form(count = 2) {
    const target = await actors[0].api.rides.create(createInput());
    let group;
    for (let index = 1; index < count; index++) {
      const own = await actors[index].api.rides.create(createInput());
      group = (await actors[index].api.groups.join({ operationId: randomUUID(), rideRequestId: own.id, target: { kind: 'ride', id: target.id } })).group;
    }
    return group;
  }
  const history = (actor, id, query = { limit: 50 }) => actor.api.chat.getHistory(id, query);
  const send = (actor, id, input = sendInput()) => actor.api.chat.send(id, input);
  const count = async (table) => (await database.query(`SELECT count(*)::int AS n FROM ride_match.${table}`)).rows[0].n;
  async function restart() {
    const port = Number(new URL(base).port);
    await first.close(); first = await createApplication(isolated, { clock }); await first.listen(port, '127.0.0.1');
  }
  async function raw(path, actor, options = {}) {
    return fetch(`${base}/v1/${path}`, { ...options, headers: { Authorization: `Bearer ${actor.session.getAccessToken()}`, 'Content-Type': 'application/json', ...options.headers } });
  }
  try {
    await admin.query(`CREATE DATABASE ${name}`); created = true; url.pathname = `/${name}`;
    isolated = { ...config, DATABASE_URL: url.href, API_LOG_LEVEL: 'error' };
    database = createPool(url.href, 'migration');
    assert.equal(await runMigrations(database), 4); assert.equal(await runMigrations(database), 0);
    first = await createApplication(isolated, { clock }); await first.listen(0, '127.0.0.1'); base = await first.getUrl();
    second = await createApplication(isolated, { clock }); await second.listen(0, '127.0.0.1');
    mobile = await loadMobileAdapter();
    for (let index = 0; index < 5; index++) {
      let session;
      const actor = { dropSend: false };
      actor.adapter = mobile.createHttpDataSource({ baseUrl: `${index % 2 ? await second.getUrl() : base}/v1`, accessToken: () => session?.getAccessToken() ?? null,
        now: () => time, fetch: async (input, options) => {
          const result = await fetch(input, options);
          if (result.ok && actor.dropSend && options.method === 'POST' && String(input).endsWith('/messages')) {
            actor.dropSend = false; await result.arrayBuffer(); throw new Error('Synthetic committed response loss');
          }
          return result;
        } });
      let saved = null;
      session = mobile.createSessionController({ auth: actor.adapter.dataSource.auth, resumeStoredSession: true,
        store: { read: async () => saved, write: async (value) => { saved = value; }, clear: async () => { saved = null; } } });
      actor.session = session; actor.api = mobile.withSessionRenewal(actor.adapter.dataSource, () => session);
      const challenge = await actor.api.auth.requestOtp({ phoneNumber: `+4477009008${String(index).padStart(2,'0')}` });
      await session.signIn({ challengeId: challenge.id, code: '123456' }); actor.id = session.getState().user.id; actors.push(actor);
    }

    await t.test('ordered concurrent sends, stable duplicate/lost response and restart', async () => {
      await reset(); const group = await form();
      assert.deepEqual(await history(actors[0], group.id), { messages: [], olderCursor: null, latestSequence: 0 });
      const intent = sendInput(); actors[0].dropSend = true;
      await assert.rejects(send(actors[0], group.id, intent), (e) => e.kind === 'network');
      await restart();
      const recovered = await send(actors[0], group.id, intent); assert.equal(recovered.sequence, 1);
      const duplicates = await Promise.all([send(actors[0], group.id, intent), send(actors[0], group.id, intent)]);
      assert.deepEqual(duplicates, [recovered, recovered]);
      await rejected(send(actors[0], group.id, { ...intent, text: 'Different synthetic text' }), 'IDEMPOTENCY_CONFLICT');
      const messages = await Promise.all([send(actors[0], group.id), send(actors[1], group.id), send(actors[0], group.id)]);
      assert.deepEqual(messages.map((m) => m.sequence).sort(), [2,3,4]);
      assert.equal(await count('chat_messages'), 4); assert.equal(await count('chat_intents'), 4);
      const page = await history(actors[1], group.id); assert.deepEqual(page.messages.map((m) => m.sequence), [1,2,3,4]);
      assert.equal(await count('operation_receipts'), 3, 'chat does not duplicate text in generic receipts (two creates + join)');
      const outbox = (await database.query("SELECT * FROM ride_match.domain_outbox WHERE kind='chat.message.created'")).rows;
      assert.equal(outbox.length, 4); assert.ok(!JSON.stringify(outbox).includes(intent.text));
      assert.deepEqual(Object.keys(recovered).sort(), ['clientMessageId','createdAt','groupId','id','sender','sequence','text']);
    });

    await t.test('latest/older/catch-up pages and scoped tamper-resistant cursors', async () => {
      await reset(); const group = await form();
      for (let n = 0; n < 6; n++) await send(actors[n % 2], group.id);
      const latest = await history(actors[0], group.id, { limit: 2 }); assert.deepEqual(latest.messages.map((m) => m.sequence), [5,6]);
      const older = await history(actors[1], group.id, { beforeCursor: latest.olderCursor, limit: 3 }); assert.deepEqual(older.messages.map((m) => m.sequence), [2,3,4]);
      const oldest = await history(actors[0], group.id, { beforeCursor: older.olderCursor, limit: 3 }); assert.equal(oldest.messages[0].sequence, 1); assert.equal(oldest.olderCursor, null);
      const catchup = await history(actors[0], group.id, { afterSequence: 0, limit: 2 }); assert.deepEqual(catchup.messages.map((m) => m.sequence), [1,2]); assert.equal(catchup.latestSequence, 6);
      assert.equal((await history(actors[0], group.id, { afterSequence: 99, limit: 2 })).messages.length, 0);
      await rejected(history(actors[0], group.id, { beforeCursor: `${latest.olderCursor}x`, limit: 2 }), 'VALIDATION_FAILED');
      const target = await actors[2].api.rides.create(createInput()); const own = await actors[3].api.rides.create(createInput());
      const other = (await actors[3].api.groups.join({ operationId: randomUUID(), rideRequestId: own.id, target: { kind: 'ride', id: target.id } })).group;
      await rejected(history(actors[2], other.id, { beforeCursor: latest.olderCursor, limit: 2 }), 'VALIDATION_FAILED');
    });

    await t.test('transport validation and no existence disclosure to outsiders', async () => {
      await reset(); const group = await form();
      for (const id of [group.id,'unknown-group']) {
        await rejected(history(actors[4], id), 'MEMBERSHIP_REQUIRED');
        await rejected(send(actors[4], id), 'MEMBERSHIP_REQUIRED');
      }
      for (const suffix of ['limit=1&limit=2','limit=1&extra=x','limit=1&beforeCursor=abc&afterSequence=0','limit=51','limit=1&afterSequence=-1']) {
        const response = await raw(`groups/${group.id}/messages?${suffix}`, actors[0]); assert.equal(response.status, 422); assert.equal((await response.json()).code, 'VALIDATION_FAILED');
      }
      const intent = sendInput();
      for (const headers of [{}, { 'Idempotency-Key': randomUUID() }]) {
        const response = await raw(`groups/${group.id}/messages`, actors[0], { method: 'POST', body: JSON.stringify(intent), headers }); assert.equal(response.status, 422);
      }
      const response = await raw(`groups/${group.id}/messages`, actors[0], { method: 'POST', body: JSON.stringify({ ...intent, sender: { id: actors[1].id } }), headers: { 'Idempotency-Key': intent.clientMessageId } }); assert.equal(response.status, 422);
      assert.equal(await count('chat_messages'), 0);
    });

    await t.test('failed outbox rolls back message, intent and counter; same retry has no gap', async () => {
      await reset(); const group = await form(); await send(actors[0], group.id);
      await database.query("ALTER TABLE ride_match.domain_outbox ADD CONSTRAINT synthetic_chat_failure CHECK (kind <> 'chat.message.created') NOT VALID");
      const intent = sendInput();
      try { await rejected(send(actors[1], group.id, intent), 'SERVICE_UNAVAILABLE'); }
      finally { await database.query('ALTER TABLE ride_match.domain_outbox DROP CONSTRAINT synthetic_chat_failure'); }
      assert.equal(await count('chat_messages'), 1); assert.equal(await count('chat_intents'), 1);
      assert.equal((await database.query('SELECT latest_sequence FROM ride_match.chat_counters')).rows[0].latest_sequence, 1);
      assert.equal((await send(actors[1], group.id, intent)).sequence, 2);
    });

    await t.test('leave/rejoin cannot replay an old epoch; closed retries stop at retention and purge', async () => {
      await reset(); let group = await form(3);
      const intent = sendInput(); const message = await send(actors[1], group.id, intent);
      await actors[1].api.groups.leave(group.id, { operationId: randomUUID() });
      await rejected(send(actors[1], group.id, intent), 'MEMBERSHIP_REQUIRED');
      await rejected(history(actors[1], group.id), 'MEMBERSHIP_REQUIRED');
      const own = await actors[1].api.rides.create(createInput());
      group = (await actors[1].api.groups.join({ operationId: randomUUID(), rideRequestId: own.id, target: { kind: 'group', id: group.id } })).group;
      await rejected(send(actors[1], group.id, intent), 'MEMBERSHIP_REQUIRED');
      assert.equal((await history(actors[1], group.id)).messages[0].id, message.id, 'new member may read existing history, not replay a former intent');
      const retained = sendInput(); const stored = await send(actors[0], group.id, retained);
      const closed = await actors[0].api.groups.updateStatus(group.id, { operationId: randomUUID(), expectedVersion: group.version, status: 'cancelled' });
      assert.deepEqual(await send(actors[0], group.id, retained), stored);
      await rejected(send(actors[0], group.id), 'GROUP_CLOSED');
      time = Date.parse(closed.closure.historyExpiresAt); await restart();
      await rejected(send(actors[0], group.id, retained), 'HISTORY_EXPIRED');
      await rejected(send(actors[0], group.id, { ...retained, text: 'Changed synthetic text' }), 'HISTORY_EXPIRED');
      await rejected(history(actors[4], group.id), 'MEMBERSHIP_REQUIRED');
      assert.equal(await count('chat_messages'), 0); assert.equal(await count('chat_intents'), 2);
      assert.equal((await database.query("SELECT count(*)::int n FROM ride_match.domain_outbox WHERE kind='chat.message.created'")).rows[0].n, 0);
      assert.equal((await database.query("SELECT count(*)::int n FROM ride_match.operation_receipts WHERE access_membership_id IS NOT NULL AND result IS NOT NULL")).rows[0].n, 0);
    });

    await t.test('atomic block-and-leave races sends and join; no blocked shared live group', async () => {
      await reset(); let group = await form(3);
      await assert.rejects(database.query('INSERT INTO ride_match.user_blocks VALUES ($1,$2,$3)', [actors[0].id,actors[1].id,new Date(time)]), (error) => error.code === '23514');
      await database.query("ALTER TABLE ride_match.domain_outbox ADD CONSTRAINT synthetic_block_failure CHECK (kind <> 'blocks.changed') NOT VALID");
      const failedBlock = { operationId: randomUUID() };
      try { await rejected(actors[0].api.safety.block(actors[1].id, failedBlock), 'SERVICE_UNAVAILABLE'); }
      finally { await database.query('ALTER TABLE ride_match.domain_outbox DROP CONSTRAINT synthetic_block_failure'); }
      assert.equal(await count('user_blocks'), 0); assert.equal((await actors[0].api.groups.getGroup(group.id)).members.length, 3);
      assert.equal((await actors[0].api.rides.getOwnRequest()).status, 'grouped');
      assert.equal((await database.query('SELECT 1 FROM ride_match.operation_receipts WHERE operation_id=$1', [failedBlock.operationId])).rowCount, 0);
      const intent = sendInput(); const operation = { operationId: randomUUID() };
      const outcomes = await Promise.allSettled([send(actors[0], group.id, intent), actors[0].api.safety.block(actors[1].id, operation)]);
      const block = outcomes[1].value; assert.equal(outcomes[1].status, 'fulfilled'); assert.equal(block.leftGroup.groupId, group.id);
      assert.deepEqual(await actors[0].api.safety.block(actors[1].id, operation), block);
      await rejected(history(actors[0], group.id), 'MEMBERSHIP_REQUIRED'); await rejected(send(actors[0], group.id, intent), 'MEMBERSHIP_REQUIRED');
      group = await actors[1].api.groups.getGroup(group.id); assert.equal(group.coordinatorId, actors[1].id); assert.equal(group.members.length, 2);
      const fresh = await actors[0].api.rides.create(createInput());
      await rejected(actors[0].api.groups.join({ operationId: randomUUID(), rideRequestId: fresh.id, target: { kind: 'group', id: group.id } }), 'BLOCKED_RELATIONSHIP');
      await actors[0].api.safety.unblock(actors[1].id); await actors[0].api.safety.unblock(actors[1].id);
      await rejected(history(actors[0], group.id), 'MEMBERSHIP_REQUIRED');
      const race = await Promise.allSettled([
        actors[0].api.groups.join({ operationId: randomUUID(), rideRequestId: fresh.id, target: { kind: 'group', id: group.id } }),
        actors[1].api.safety.block(actors[0].id, { operationId: randomUUID() }),
      ]);
      assert.equal(race[1].status, 'fulfilled');
      if (race[0].status === 'rejected') assert.equal(race[0].reason.code, 'TARGET_UNAVAILABLE');
      const violations = await database.query(`SELECT 1 FROM ride_match.user_blocks b JOIN ride_match.group_memberships a ON a.user_id=b.actor_id AND a.live
        JOIN ride_match.group_memberships t ON t.user_id=b.target_id AND t.group_id=a.group_id AND t.live`); assert.equal(violations.rowCount, 0);
      if (race[0].status === 'fulfilled') await rejected(history(actors[1], group.id), 'MEMBERSHIP_REQUIRED');
      else assert.equal((await history(actors[1], group.id)).messages.length, outcomes[0].status === 'fulfilled' ? 1 : 0);
    });

    await t.test('bidirectional discovery/matches/direct-read filtering, opaque block pages and idempotent unblock', async () => {
      await reset(); const a = await actors[0].api.rides.create(createInput()); const b = await actors[1].api.rides.create(createInput());
      await actors[0].api.safety.block(actors[1].id, { operationId: randomUUID() });
      for (const actor of [actors[0],actors[1]]) {
        const page = await actor.api.rides.getNearby({ viewport, limit: 20 }); assert.equal(page.items.length, 0);
        assert.equal((await actor.api.rides.getMatches(actor === actors[0] ? a.id : b.id)).matches.length, 0);
        await rejected(actor.api.rides.getRide(actor === actors[0] ? b.id : a.id), 'TARGET_UNAVAILABLE');
      }
      const anonymous = mobile.createHttpDataSource({ baseUrl: `${base}/v1`, accessToken: () => null });
      try { assert.equal((await anonymous.dataSource.rides.getNearby({ viewport, limit: 20 })).items.length, 2); } finally { anonymous.dispose(); }
      await rejected(actors[1].api.groups.join({ operationId: randomUUID(), rideRequestId: b.id, target: { kind: 'ride', id: a.id } }), 'TARGET_UNAVAILABLE');
      const blockedJoin = { operationId: randomUUID(), rideRequestId: a.id, target: { kind: 'ride', id: b.id } };
      const blockedResponse = await raw('groups/join', actors[0], { method: 'POST', body: JSON.stringify(blockedJoin), headers: { 'Idempotency-Key': blockedJoin.operationId } });
      assert.equal(blockedResponse.status, 409); assert.equal((await blockedResponse.json()).code, 'BLOCKED_RELATIONSHIP');
      await actors[0].api.safety.block(actors[2].id, { operationId: randomUUID() }); await actors[0].api.safety.block(actors[3].id, { operationId: randomUUID() });
      const page = await actors[0].api.safety.listBlocks({ limit: 2 }); assert.equal(page.blockedUsers.length, 2); assert.ok(page.nextCursor);
      const next = await actors[0].api.safety.listBlocks({ limit: 2, cursor: page.nextCursor }); assert.equal(next.blockedUsers.length, 1); assert.equal(next.nextCursor, null);
      assert.equal(new Set([...page.blockedUsers,...next.blockedUsers].map((x) => x.user.id)).size, 3);
      await rejected(actors[1].api.safety.listBlocks({ limit: 2, cursor: page.nextCursor }), 'VALIDATION_FAILED');
      await actors[0].api.safety.unblock('unknown-user'); await actors[0].api.safety.unblock(actors[1].id);
      assert.equal((await actors[1].api.rides.getNearby({ viewport, limit: 20 })).items.length, 1);
      await rejected(actors[0].api.safety.block(actors[0].id, { operationId: randomUUID() }), 'VALIDATION_FAILED');
      await rejected(actors[0].api.safety.block('unknown-user', { operationId: randomUUID() }), 'NOT_FOUND');
    });

    await t.test('group filtering inspects every participant; closed-group blocks keep bounded history', async () => {
      await reset(); const group = await form(3);
      const own = await actors[3].api.rides.create(createInput());
      await actors[3].api.safety.block(actors[2].id, { operationId: randomUUID() });
      await rejected(actors[3].api.groups.getPreview(group.id), 'TARGET_UNAVAILABLE');
      assert.ok(!(await actors[3].api.rides.getNearby({ viewport, limit: 20 })).items.some((item) => item.id === group.id));
      assert.ok(!(await actors[3].api.rides.getMatches(own.id)).matches.some((item) => item.target.id === group.id));
      await rejected(actors[3].api.groups.join({ operationId: randomUUID(), rideRequestId: own.id, target: { kind: 'group', id: group.id } }), 'BLOCKED_RELATIONSHIP');
      const intent = sendInput(); const message = await send(actors[0], group.id, intent);
      const closed = await actors[0].api.groups.updateStatus(group.id, { operationId: randomUUID(), expectedVersion: group.version, status: 'cancelled' });
      const blocked = await actors[0].api.safety.block(actors[1].id, { operationId: randomUUID() });
      assert.equal(blocked.leftGroup, null);
      assert.deepEqual(await send(actors[0], group.id, intent), message);
      assert.equal((await history(actors[1], group.id)).messages.length, 1);
      time = Date.parse(closed.closure.historyExpiresAt);
      await rejected(history(actors[1], group.id), 'HISTORY_EXPIRED');
    });

    await t.test('reports validate context, replay content-free receipts after leave and purge bodies', async () => {
      await reset(); const group = await form(3); const message = await send(actors[1], group.id);
      const input = { operationId: randomUUID(), targetUserId: actors[1].id, reason: 'harassment', details: 'Synthetic report details', context: { groupId: group.id, messageId: message.id } };
      const receipt = await actors[0].api.safety.report(input); assert.deepEqual(Object.keys(receipt).sort(), ['id','receivedAt']);
      assert.equal(await count('user_reports'), 1);
      await rejected(actors[0].api.safety.report({ ...input, operationId: randomUUID(), targetUserId: actors[0].id }), 'VALIDATION_FAILED');
      await rejected(actors[0].api.safety.report({ ...input, operationId: randomUUID(), targetUserId: 'unknown-user', context: undefined }), 'NOT_FOUND');
      const invalid = (extra) => ({ ...input, operationId: randomUUID(), ...extra });
      await rejected(actors[4].api.safety.report(invalid({})), 'MEMBERSHIP_REQUIRED');
      await rejected(actors[0].api.safety.report(invalid({ targetUserId: actors[2].id })), 'VALIDATION_FAILED');
      await rejected(actors[0].api.safety.report(invalid({ targetUserId: actors[4].id, context: { groupId: group.id, messageId: null } })), 'VALIDATION_FAILED');
      await actors[0].api.groups.leave(group.id, { operationId: randomUUID() });
      time += 2 * 3600000;
      assert.deepEqual(await actors[0].api.safety.report(input), receipt);
      assert.equal(await count('chat_messages'), 0, 'report references do not prevent message purge');
      await rejected(actors[0].api.safety.report({ ...input, details: 'Changed synthetic details' }), 'IDEMPOTENCY_CONFLICT');
      await rejected(actors[0].api.safety.report(invalid({})), 'MEMBERSHIP_REQUIRED');
      assert.ok(!JSON.stringify((await database.query('SELECT * FROM ride_match.operation_receipts')).rows).includes(input.details));
      time += 7 * 86400000; await restart();
      await rejected(actors[0].api.safety.report(input), 'VALIDATION_FAILED');
      assert.equal(await count('user_reports'), 0); assert.equal(await count('chat_messages'), 0);
      assert.equal((await database.query("SELECT count(*)::int n FROM ride_match.domain_outbox WHERE kind IN ('report.received','chat.message.created')")).rows[0].n, 0);
    });
  } finally {
    for (const actor of actors) { actor.session.dispose(); actor.adapter.dispose(); }
    if (first) await first.close(); if (second) await second.close(); if (mobile) await mobile.dispose();
    if (database && !database.ended) await database.end();
    try { if (created) await admin.query(`DROP DATABASE ${name}`); } finally { await admin.end(); }
  }
});
