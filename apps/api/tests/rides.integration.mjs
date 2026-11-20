import { resetDomain } from './reset-domain.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { URL } from 'node:url';
import { ApiErrorSchema, GroupPreviewSchema, RideGroupSchema, OwnRideRequestSchema, NearbySnapshotSchema } from '@ride-match/contracts';
import { createApplication } from '../dist/application.js';
import { readEnvironment } from '../dist/config/environment.js';
import { createPool } from '../dist/database/pool.js';
import { runMigrations } from '../dist/database/migrations.js';
import { loadMobileAdapter } from './mobile-adapter.mjs';

// Fixture-only idle-connection isolation across explicit server restarts; no mutation retries.
const fetch = (url,options) => globalThis.fetch(url,{...options,headers:{...options?.headers,Connection:'close'}});
const viewport = { southWest: { latitude: 42.80, longitude: 74.50 }, northEast: { latitude: 42.95, longitude: 74.70 } };
const destination = 'dev_central_square';
const rejected = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test('BE-003 two-instance PostgreSQL + real mobile adapter journeys', async (t) => {
  const config = readEnvironment(process.env);
  const url = new URL(config.DATABASE_URL);
  assert.ok(config.API_APP_ENV !== 'production' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  const admin = createPool(config.DATABASE_URL);
  const name = `be003_${randomUUID().replaceAll('-', '')}`;
  let database;
  let created = false;
  let first;
  let second;
  let mobile;
  let time = Date.parse('2026-11-20T10:00:00Z');
  const clock = { now: () => new Date(time) };
  const actors = [];
  let base;
  let isolated;
  async function reset() {
    time += 60000;
    await resetDomain(database,`TRUNCATE ride_match.current_requests,ride_match.ride_origins,ride_match.operation_receipts,
      ride_match.domain_outbox,ride_match.match_sets,ride_match.group_meeting_points,ride_match.group_memberships,
      ride_match.ride_requests,ride_match.ride_groups CASCADE`);
  }
  function createInput(overrides = {}) {
    return { operationId: randomUUID(), origin: { source: 'manual', coordinates: { latitude: 42.8753, longitude: 74.6067 } },
      destinationPlaceId: destination, departureOffsetMinutes: 0, ...overrides };
  }
  const create = (actor, overrides) => actor.api.rides.create(createInput(overrides));
  const join = (actor, own, target, operationId = randomUUID()) => actor.api.groups.join({ operationId, rideRequestId: own.id, target });
  const status = (actor, group, next, operationId = randomUUID()) => actor.api.groups.updateStatus(group.id, { operationId, expectedVersion: group.version, status: next });
  async function form() {
    const target = await create(actors[0]);
    const own = await create(actors[1]);
    const input = { operationId: randomUUID(), rideRequestId: own.id, target: { kind: 'ride', id: target.id } };
    return { target, own, input, result: await actors[1].api.groups.join(input) };
  }
  async function restartFirst() {
    const port = Number(new URL(base).port);
    await first.close();
    first = await createApplication(isolated, { clock });
    await first.listen(port, '127.0.0.1');
  }
  async function raw(path, { method = 'GET', body, actor, headers = {}, expected, code } = {}) {
    const response = await fetch(`${base}/v1/${path}`, { method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(actor ? { Authorization: `Bearer ${actor.session.getAccessToken()}` } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (expected !== undefined) assert.equal(response.status, expected);
    const result = await response.json();
    if (code) assert.equal(ApiErrorSchema.parse(result).code, code);
    return result;
  }
  try {
    await admin.query(`CREATE DATABASE ${name}`); created = true;
    url.pathname = `/${name}`;
    isolated = { ...config, DATABASE_URL: url.href, API_LOG_LEVEL: 'error' };
    database = createPool(url.href, 'migration');
    assert.equal(await runMigrations(database), 5);
    assert.equal(await runMigrations(database), 0);
    first = await createApplication(isolated, { clock }); await first.listen(0, '127.0.0.1'); base = await first.getUrl();
    second = await createApplication(isolated, { clock }); await second.listen(0, '127.0.0.1');
    mobile = await loadMobileAdapter();
    for (let index = 0; index < 7; index++) {
      let session;
      const actor = { dropCreate: false, deviceOffset: 3600000 };
      const adapter = mobile.createHttpDataSource({ baseUrl: `${index % 2 ? await second.getUrl() : base}/v1`, accessToken: () => session?.getAccessToken() ?? null,
        now: () => time + actor.deviceOffset, fetch: async (input, options) => {
          const result = await fetch(input, options);
          if (result.ok && actor.dropCreate && options.method === 'POST' && String(input).endsWith('/rides')) {
            actor.dropCreate = false; await result.arrayBuffer(); throw new Error('synthetic lost response after commit');
          }
          return result;
        } });
      let saved = null;
      session = mobile.createSessionController({ auth: adapter.dataSource.auth, resumeStoredSession: true,
        store: { read: async () => saved, write: async (value) => { saved = value; }, clear: async () => { saved = null; } } });
      actor.session = session; actor.adapter = adapter; actor.api = mobile.withSessionRenewal(adapter.dataSource, () => session);
      const challenge = await actor.api.auth.requestOtp({ phoneNumber: `+4477009009${String(index).padStart(2, '0')}` });
      await session.signIn({ challengeId: challenge.id, code: '123456' });
      actor.id = session.getState().user.id;
      actors.push(actor);
    }

    await t.test('empty discovery, safe projections, current refs, matches and truncation', async () => {
      await reset();
      const empty = await actors[0].api.rides.getNearby({ viewport, limit: 10 });
      assert.deepEqual(empty, { items: [], previews: [], truncated: false });
      const a = await create(actors[0]); const b = await create(actors[1]); const c = await create(actors[2], { destinationPlaceId: 'dev_east_library' });
      const own = OwnRideRequestSchema.parse(await actors[0].api.rides.getOwnRequest());
      assert.equal(own.id, a.id); assert.equal((await actors[0].api.auth.getCurrentUser()).rideRequestId, a.id);
      const publicRead = (await raw(`rides/${a.id}`)).data;
      assert.ok(!('origin' in publicRead) && !('status' in publicRead) && !('groupId' in publicRead));
      assert.deepEqual(publicRead.publicOrigin, b.publicOrigin);
      const result = NearbySnapshotSchema.parse((await raw('rides/nearby?viewport.southWest.latitude=42.80&viewport.southWest.longitude=74.50&viewport.northEast.latitude=42.95&viewport.northEast.longitude=74.70&limit=1')).data);
      assert.equal(result.items.length, 1); assert.equal(result.truncated, true);
      assert.ok(!(await actors[0].api.rides.getNearby({ viewport, limit: 10 })).items.some((item) => item.id === a.id));
      const matches = await actors[0].api.rides.getMatches(a.id);
      assert.equal(matches.matches.length, 1); assert.equal(matches.matches[0].target.id, b.id); assert.equal(matches.matches[0].additionalMinutes, null);
      assert.ok(!matches.matches.some((match) => match.target.id === c.id));
      assert.equal((await actors[0].api.rides.getMatches(a.id)).version, matches.version);
      await create(actors[3]);
      assert.ok((await actors[0].api.rides.getMatches(a.id)).version > matches.version);
      await rejected(actors[1].api.rides.getMatches(a.id), 'FORBIDDEN');
      await rejected(create(actors[0]), 'ACTIVE_REQUEST_EXISTS');
    });

    await t.test('one live request under two concurrent intents, failed mutations leave no receipt/outbox', async () => {
      await reset();
      const results = await Promise.allSettled([create(actors[0]), create(actors[0])]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'ACTIVE_REQUEST_EXISTS');
      assert.equal((await database.query('SELECT count(*)::int AS count FROM ride_match.operation_receipts')).rows[0].count, 1);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM ride_match.domain_outbox')).rows[0].count, 2);
      const before = (await database.query('SELECT count(*)::int AS count FROM ride_match.ride_requests')).rows[0].count;
      await rejected(create(actors[1], { destinationPlaceId: 'unknown_place' }), 'VALIDATION_FAILED');
      assert.equal((await database.query('SELECT count(*)::int AS count FROM ride_match.ride_requests')).rows[0].count, before);
      const retryable = createInput();
      // Fail after request/origin/current/match rows and the first event intent were written.
      await database.query("ALTER TABLE ride_match.domain_outbox ADD CONSTRAINT synthetic_fault CHECK (kind <> 'nearby.upserted.ride') NOT VALID");
      try {
        await rejected(actors[1].api.rides.create(retryable), 'SERVICE_UNAVAILABLE');
        assert.equal(await actors[1].api.rides.getOwnRequest(), null);
        assert.equal((await database.query('SELECT count(*)::int AS count FROM ride_match.ride_requests')).rows[0].count, before);
        assert.equal((await database.query('SELECT count(*)::int AS count FROM ride_match.operation_receipts')).rows[0].count, 1);
        assert.equal((await database.query('SELECT count(*)::int AS count FROM ride_match.domain_outbox')).rows[0].count, 2);
      } finally { await database.query('ALTER TABLE ride_match.domain_outbox DROP CONSTRAINT synthetic_fault'); }
      assert.equal((await actors[1].api.rides.create(retryable)).status, 'active');

    });

    await t.test('lost response and API restart preserve one create and canonical intent timestamp', async () => {
      await reset();
      const input = createInput({ origin: { source: 'device', coordinates: { latitude: 42.8753, longitude: 74.6067 }, accuracyMeters: 20,
        capturedAt: new Date(time + 3600000).toISOString() } });
      actors[0].dropCreate = true;
      await assert.rejects(actors[0].api.rides.create(input), (error) => error.kind === 'network');
      const existing = await actors[0].api.rides.getOwnRequest();
      assert.ok(existing !== null);
      assert.equal(actors[0].adapter.serverNow(), time);
      await restartFirst();
      // Change the measured offset: retry must still send the original wire capture time.
      actors[0].deviceOffset += 5000;
      await actors[0].api.auth.getCurrentUser();
      const retry = await actors[0].api.rides.create(input);
      assert.equal(retry.id, existing.id);
      assert.equal((await database.query('SELECT count(*)::int AS count FROM ride_match.ride_requests')).rows[0].count, 1);
      await rejected(actors[0].api.rides.create({ ...input, destinationPlaceId: 'dev_east_library' }), 'IDEMPOTENCY_CONFLICT');
      await rejected(actors[0].api.rides.cancel(existing.id, { operationId: input.operationId, expectedVersion: existing.version }), 'IDEMPOTENCY_CONFLICT');
    });

    await t.test('mutation headers, strict query encoding, freshness/coverage and cancellation precedence', async () => {
      await reset();
      // Refresh session before raw transport assertions if a previous journey advanced time.
      await actors[0].api.auth.getCurrentUser();
      const input = createInput();
      await raw('rides', { method: 'POST', body: input, actor: actors[0], expected: 422, code: 'VALIDATION_FAILED' });
      await raw('rides', { method: 'POST', body: input, actor: actors[0], headers: { 'Idempotency-Key': randomUUID() }, expected: 422, code: 'VALIDATION_FAILED' });
      await rejected(create(actors[0], { origin: { source: 'device', coordinates: input.origin.coordinates, accuracyMeters: 20, capturedAt: new Date(time + 3600000 - 60001).toISOString() } }), 'LOCATION_STALE');
      await rejected(create(actors[0], { origin: { source: 'manual', coordinates: { latitude: 0, longitude: 0 } } }), 'UNSUPPORTED_AREA');
      await raw('rides/nearby?viewport.southWest.latitude=42.80&viewport.southWest.longitude=74.50&viewport.northEast.latitude=42.95&viewport.northEast.longitude=74.70&limit=1&limit=2', { expected: 422, code: 'VALIDATION_FAILED' });
      const ride = await create(actors[0]);
      await rejected(actors[0].api.rides.cancel(ride.id, { operationId: randomUUID(), expectedVersion: 100 }), 'VERSION_CONFLICT');
      const cancel = { operationId: randomUUID(), expectedVersion: ride.version };
      const cancelled = await actors[0].api.rides.cancel(ride.id, cancel);
      assert.equal(cancelled.status, 'cancelled');
      assert.deepEqual(await actors[0].api.rides.cancel(ride.id, cancel), cancelled);
      await rejected(actors[0].api.rides.cancel(ride.id, { ...cancel, operationId: randomUUID() }), 'INVALID_TRANSITION');
      await rejected(actors[0].api.rides.getRide(ride.id), 'TARGET_UNAVAILABLE');
      assert.equal((await actors[0].api.rides.getMatches(ride.id)).matches.length, 0);
      assert.equal((await create(actors[0])).status, 'active');
    });

    await t.test('two first joins through independent API instances resolve one canonical group', async () => {
      await reset();
      const target = await create(actors[0]); const own = await create(actors[1]); const other = await create(actors[2]);
      const results = await Promise.all([join(actors[1], own, { kind: 'ride', id: target.id }), join(actors[2], other, { kind: 'ride', id: target.id })]);
      assert.equal(results[0].group.id, results[1].group.id);
      const group = await actors[0].api.groups.getGroup(results[0].group.id);
      RideGroupSchema.parse(group);
      assert.equal(group.members.length, 3); assert.equal(group.coordinatorId, actors[0].id);
      assert.equal(group.members[0].user.id, actors[0].id);
      assert.ok(group.meetingPoint !== null); assert.equal(group.meetingPoint.walkingMinutes, null);
      assert.equal((await actors[0].api.auth.getCurrentUser()).groupId, group.id);
      const preview = GroupPreviewSchema.parse((await raw(`groups/${group.id}/preview`)).data);
      assert.ok(!('members' in preview) && !('meetingPoint' in preview) && !('coordinatorId' in preview));
      await rejected(actors[3].api.groups.getGroup(group.id), 'MEMBERSHIP_REQUIRED');
      await rejected(actors[3].api.groups.getGroup('unknown_group'), 'MEMBERSHIP_REQUIRED');
      await rejected(actors[0].api.rides.getRide(target.id), 'TARGET_UNAVAILABLE');
      await rejected(actors[0].api.rides.cancel(target.id, { operationId: randomUUID(), expectedVersion: 1 }), 'USE_LEAVE_GROUP');
    });

    await t.test('last-seat race: one success, one GROUP_FULL, losing own request remains active', async () => {
      await reset(); const formed = await form();
      const third = await create(actors[2]); await join(actors[2], third, { kind: 'group', id: formed.result.group.id });
      const fourth = await create(actors[3]); const fifth = await create(actors[4]);
      const results = await Promise.allSettled([join(actors[3], fourth, { kind: 'ride', id: formed.target.id }), join(actors[4], fifth, { kind: 'group', id: formed.result.group.id })]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'GROUP_FULL');
      const group = await actors[0].api.groups.getGroup(formed.result.group.id);
      assert.equal(group.members.length, 4); assert.equal(group.status, 'forming');
      const losing = results[0].status === 'rejected' ? actors[3] : actors[4];
      assert.equal((await losing.api.rides.getOwnRequest()).status, 'active');
    });

    await t.test('coordinator readiness, source point changes/withdrawal and terminal transitions', async () => {
      await reset(); const formed = await form(); let group = formed.result.group;
      await rejected(status(actors[1], group, 'ready'), 'FORBIDDEN');
      await rejected(status(actors[0], { ...group, version: 100 }, 'ready'), 'VERSION_CONFLICT');
      await rejected(status(actors[0], group, 'completed'), 'INVALID_TRANSITION');
      group = await status(actors[0], group, 'ready');
      const extra = await create(actors[2]);
      await rejected(join(actors[2], extra, { kind: 'group', id: group.id }), 'GROUP_CLOSED');
      const oldPoint = group.meetingPoint.id;
      await database.query("UPDATE ride_match.places SET label=label || ' revised'");
      group = await actors[0].api.groups.getGroup(group.id);
      assert.equal(group.status, 'forming'); assert.ok(group.meetingPoint.id !== oldPoint);
      const catalogue = (await database.query('SELECT * FROM ride_match.places')).rows;
      await database.query('DELETE FROM ride_match.places');
      group = await actors[0].api.groups.getGroup(group.id);
      assert.equal(group.meetingPoint, null);
      await rejected(status(actors[0], group, 'ready'), 'INVALID_TRANSITION');
      for (const place of catalogue) await database.query('INSERT INTO ride_match.places VALUES ($1,$2,$3,$4,$5)', [place.id, place.label, place.detail, place.latitude, place.longitude]);
      group = await actors[0].api.groups.getGroup(group.id);
      group = await status(actors[0], group, 'ready');
      group = await status(actors[0], group, 'forming');
      group = await status(actors[0], group, 'ready');
      const completed = await status(actors[0], group, 'completed');
      assert.equal(completed.closure.reason, 'completed');
      assert.equal((await actors[1].api.rides.getOwnRequest()).status, 'completed');
      await rejected(status(actors[0], completed, 'ready'), 'GROUP_CLOSED');
      await rejected(actors[0].api.groups.getPreview(group.id), 'TARGET_UNAVAILABLE');
    });

    await t.test('leave is idempotent owner-only; coordinator transfer and membership epoch protect private replay', async () => {
      await reset(); const formed = await form();
      const third = await create(actors[2]); await join(actors[2], third, { kind: 'group', id: formed.result.group.id });
      const leave = { operationId: randomUUID() };
      const left = await actors[1].api.groups.leave(formed.result.group.id, leave);
      assert.equal(left.rideRequest.status, 'cancelled'); assert.ok(!('group' in left));
      assert.deepEqual(await actors[1].api.groups.leave(formed.result.group.id, leave), left);
      await rejected(actors[1].api.groups.getGroup(formed.result.group.id), 'MEMBERSHIP_REQUIRED');
      await rejected(actors[1].api.groups.join(formed.input), 'MEMBERSHIP_REQUIRED');
      const fresh = await create(actors[1]);
      await join(actors[1], fresh, { kind: 'group', id: formed.result.group.id });
      await rejected(actors[1].api.groups.join(formed.input), 'MEMBERSHIP_REQUIRED');
      await actors[0].api.groups.leave(formed.result.group.id, { operationId: randomUUID() });
      const remaining = await actors[2].api.groups.getGroup(formed.result.group.id);
      assert.equal(remaining.coordinatorId, actors[2].id); assert.equal(remaining.status, 'forming');
    });

    await t.test('one remaining member closes group, retains bounded history and loses live request', async () => {
      await reset(); const formed = await form();
      await actors[0].api.groups.leave(formed.result.group.id, { operationId: randomUUID() });
      const group = await actors[1].api.groups.getGroup(formed.result.group.id);
      assert.equal(group.closure.reason, 'members_left'); assert.equal(group.members.length, 1);
      assert.equal(group.coordinatorId, actors[1].id); assert.equal((await actors[1].api.rides.getOwnRequest()).status, 'cancelled');
      assert.equal((await actors[1].api.auth.getCurrentUser()).groupId, null);
      time += 3600000;
      await rejected(actors[1].api.groups.getGroup(group.id), 'HISTORY_EXPIRED');
      await rejected(actors[1].api.groups.join(formed.input), 'HISTORY_EXPIRED');
    });

    await t.test('same-key concurrent join/status replay is stable; changed fingerprint conflicts', async () => {
      await reset(); const target = await create(actors[0]); const own = await create(actors[1]);
      const input = { operationId: randomUUID(), rideRequestId: own.id, target: { kind: 'ride', id: target.id } };
      const results = await Promise.all([actors[1].api.groups.join(input), actors[1].api.groups.join(input)]);
      assert.deepEqual(results[0], results[1]);
      const group = results[0].group;
      const update = { operationId: randomUUID(), expectedVersion: group.version, status: 'ready' };
      const changed = await actors[0].api.groups.updateStatus(group.id, update);
      assert.deepEqual(await actors[0].api.groups.updateStatus(group.id, update), changed);
      await rejected(actors[0].api.groups.updateStatus(group.id, { ...update, status: 'cancelled' }), 'IDEMPOTENCY_CONFLICT');
      const closed = await status(actors[0], changed, 'cancelled');
      assert.equal(closed.closure.reason, 'coordinator_cancelled');
      time += 3600000;
      await rejected(actors[0].api.groups.updateStatus(group.id, update), 'HISTORY_EXPIRED');
    });

    await t.test('restart-safe expiry uses group deadline; grouped requests ignore solo expiry; no resurrection', async () => {
      await reset(); const formed = await form();
      time += 900000;
      assert.equal((await actors[1].api.rides.getOwnRequest()).status, 'grouped');
      assert.equal((await actors[1].api.groups.getGroup(formed.result.group.id)).status, 'forming');
      await restartFirst();
      time += 1800000 + 3600000;
      await rejected(actors[1].api.groups.getGroup(formed.result.group.id), 'HISTORY_EXPIRED');
      const own = await actors[1].api.rides.getOwnRequest();
      assert.equal(own.status, 'cancelled'); assert.equal(own.groupId, formed.result.group.id);
      assert.equal((await actors[0].api.auth.getCurrentUser()).groupId, null);
      assert.equal((await actors[0].api.rides.getNearby({ viewport, limit: 10 })).items.length, 0);
      const row = (await database.query('SELECT closed_at,history_expires_at,expires_at FROM ride_match.ride_groups WHERE id=$1', [formed.result.group.id])).rows[0];
      assert.equal(row.closed_at.toISOString(), row.expires_at.toISOString());
      const a = await create(actors[3]); time += 900000;
      assert.equal((await actors[3].api.rides.getOwnRequest()).status, 'expired');
      await rejected(actors[3].api.rides.cancel(a.id, { operationId: randomUUID(), expectedVersion: 1 }), 'RIDE_EXPIRED');
      assert.equal((await actors[3].api.rides.getOwnRequest()).id, a.id);
    });

    await t.test('database uniqueness/capacity constraints and retired operation tombstones are enforced', async () => {
      await reset(); const formed = await form();
      await assert.rejects(database.query('UPDATE ride_match.group_memberships SET seat=5 WHERE group_id=$1', [formed.result.group.id]), (error) => error.code === '23514');
      await assert.rejects(database.query('UPDATE ride_match.group_memberships SET seat=1 WHERE group_id=$1', [formed.result.group.id]), (error) => error.code === '23505');
      const c = await create(actors[4]);
      await assert.rejects(database.query("INSERT INTO ride_match.ride_requests SELECT 'duplicate_request',user_id,status,group_id,destination,public_latitude,public_longitude,departure_at,created_at,expires_at,version FROM ride_match.ride_requests WHERE id=$1", [c.id]), (error) => error.code === '23505');
      const input = createInput(); const saved = await actors[5].api.rides.create(input);
      time += 86400001;
      await rejected(actors[5].api.rides.create(input), 'VALIDATION_FAILED');
      assert.equal((await actors[5].api.rides.getOwnRequest()).id, saved.id);
      assert.equal((await database.query('SELECT result FROM ride_match.operation_receipts WHERE operation_id=$1', [input.operationId])).rows[0].result, null);
      assert.ok((await database.query('SELECT count(*)::int AS count FROM ride_match.domain_outbox')).rows[0].count > 0);
    });
  } finally {
    for (const actor of actors) { actor.session.dispose(); actor.adapter.dispose(); }
    if (first) await first.close(); if (second) await second.close();
    if (mobile) await mobile.dispose();
    if (database) await database.end();
    try { if (created) await admin.query(`DROP DATABASE ${name}`); }
    finally { await admin.end(); }
  }
});
