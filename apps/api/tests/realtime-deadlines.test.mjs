import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { RealtimeService } from '../dist/realtime/realtime.service.js';

const start = Date.parse('2026-11-21T10:00:00Z');

/** Drives the actual projector/transport with a clock advanced during an awaited DB read. */
function fixture(kind, advanceTo, { live = false, rows = 1 } = {}) {
  let time = start;
  const clock = { now: () => new Date(time) };
  const actor = randomUUID();
  const groupId = randomUUID();
  const deadline = start + 1000;
  const group = { id: groupId, status: live ? 'forming' : 'completed', version: 1,
    expires_at: new Date(deadline - 3600000), history_expires_at: live ? null : new Date(deadline) };
  const intents = Array.from({ length: rows }, (_, index) => ({ id: randomUUID(), ordinal: String(index + 1),
    kind: kind === 'user' ? 'ride.changed' : 'chat.message.created', resource_id: randomUUID(),
    version: 1, occurred_at: new Date(start), details: {} }));
  let projected = 0;
  const store = {
    readable: async () => ({ group, member: { id: 'synthetic-membership', user_id: actor } }),
    group: async () => group,
    ride: async (id) => {
      time = advanceTo(++projected, deadline);
      return { id, user_id: actor, status: 'active', version: 1 };
    },
    client: { query: async (sql) => {
      if (sql.includes('domain_outbox')) return { rows: intents };
      assert.ok(sql.includes('chat_messages'));
      time = advanceTo(++projected, deadline);
      return { rows: [{ id: randomUUID(), group_id: groupId, sequence: projected,
        sender: { id: actor, displayName: 'Synthetic rider', avatarUrl: null }, text: 'Synthetic message',
        created_at: new Date(start), client_message_id: randomUUID() }] };
    } },
  };
  const events = [];
  const socket = { connected: true, emit: (name, value) => events.push({ name, value }),
    disconnect: () => { socket.connected = false; } };
  const sub = { id: randomUUID(), request: kind === 'user' ? { kind } : { kind, groupId },
    actor, membership: 'synthetic-membership', cursor: 0n };
  const client = { socket, subs: new Map([[sub.id, sub]]) };
  const domain = { run: async () => {}, deliver: async (work) => work(store, clock.now()) };
  const auth = { authenticateSession: async () => ({ userId: actor, sessionId: randomUUID(),
    expiresAt: new Date(kind === 'user' ? deadline : deadline + 900000) }) };
  const service = new RealtimeService(auth, domain, {}, { tick: async () => {} }, clock);
  // The timer and actual sockets are deliberately absent; only the queue boundary is under test.
  service.clients.add(client);
  return { service, events, socket, client, sub };
}

for (const offset of [-1, 0]) {
  test(`session deadline is checked after projection (${offset} ms from expiry)`, async () => {
    const { service, events, socket } = fixture('user', (_, end) => end + offset);
    await service.tick();
    if (offset < 0) {
      assert.deepEqual(events.map((entry) => entry.name), ['rm:event']);
      assert.equal(socket.connected, true);
    } else {
      assert.deepEqual(events.map((entry) => entry.name), ['rm:session-error']);
      assert.equal(events[0].value.code, 'SESSION_EXPIRED');
      assert.equal(socket.connected, false);
    }
  });
  for (const live of [false, true]) {
    test(`${live ? 'unswept' : 'closed'} group history deadline after message read (${offset} ms)`, async () => {
      const { service, events, socket, client, sub } = fixture('group', (_, end) => end + offset, { live });
      await service.tick();
      assert.deepEqual(events.map((entry) => entry.name), [offset < 0 ? 'rm:event' : 'rm:ended']);
      assert.equal(client.subs.has(sub.id), offset < 0);
      assert.equal(socket.connected, true);
    });
  }
}

test('session expiry between rows stops the batch before a second private event', async () => {
  const { service, events, socket } = fixture('user', (index, end) => end + index - 2, { rows: 3 });
  await service.tick();
  assert.deepEqual(events.map((entry) => entry.name), ['rm:event', 'rm:session-error']);
  assert.equal(socket.connected, false);
});
