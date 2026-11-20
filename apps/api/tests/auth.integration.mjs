import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { URL } from 'node:url';
import {
  ApiErrorSchema, AuthSessionSchema, CurrentUserSchema, OtpChallengeSchema, PlaceSearchResultsSchema, SessionCredentialsSchema,
} from '@ride-match/contracts';
import { createApplication } from '../dist/application.js';
import { readEnvironment } from '../dist/config/environment.js';
import { createPool } from '../dist/database/pool.js';
import { runMigrations } from '../dist/database/migrations.js';
import { loadMobileAdapter } from './mobile-adapter.mjs';
import { createOtpProvider } from '../dist/auth/runtime.js';

const { fetch } = globalThis;

test('BE-002 PostgreSQL auth, concurrency, retention of credentials and public places', async (t) => {
  const config = readEnvironment(process.env);
  const url = new URL(config.DATABASE_URL);
  assert.ok(config.API_APP_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  const admin = createPool(config.DATABASE_URL);
  const name = `be002_${randomUUID().replaceAll('-', '')}`;
  let database;
  let app;
  let created = false;
  let time = Date.parse('2026-11-20T10:00:00Z');
  let deliveryFails = false;
  const provider = createOtpProvider(config);
  const dependencies = {
    clock: { now: () => new Date(time) },
    otpProvider: { ...provider, deliver: () => deliveryFails ? Promise.reject(new Error('synthetic-private-provider-failure')) : Promise.resolve() },
  };
  let base;
  const call = async (path, { body, token, method, expected = 200, code } = {}) => {
    const response = await fetch(`${base}/v1/${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, expected, `${path} status`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (expected === 204) { assert.equal(await response.text(), ''); return undefined; }
    const result = await response.json();
    if (code) {
      const error = ApiErrorSchema.parse(result);
      assert.equal(error.code, code);
      assert.equal(error.requestId, response.headers.get('x-request-id'));
      if (error.retryAfterSeconds) assert.equal(response.headers.get('retry-after'), String(error.retryAfterSeconds));
    }
    return result;
  };
  let sequence = 1;
  const challenge = async () => {
    const phoneNumber = `+447700900${String(sequence++).padStart(3, '0')}`;
    return (await call('auth/otp/challenges', { body: { phoneNumber } })).data;
  };
  const signIn = async () => {
    const pending = await challenge();
    return (await call('auth/otp/verify', { body: { challengeId: pending.id, code: '123456' } })).data;
  };
  const search = 'places/search?area.center.latitude=42.88&area.center.longitude=74.60&area.radiusMeters=10000&limit=20';
  try {
    await admin.query(`CREATE DATABASE ${name}`); created = true;
    url.pathname = `/${name}`;
    const isolated = { ...config, DATABASE_URL: url.href, API_LOG_LEVEL: 'error' };
    database = createPool(url.href, 'migration');
    assert.equal(await runMigrations(database), 3);
    assert.equal(await runMigrations(database), 0);
    app = await createApplication(isolated, dependencies);
    await app.listen(0, '127.0.0.1'); base = await app.getUrl();

    await t.test('public search, strict dotted encoding, projection, coverage and ordering', async () => {
      const result = (await call(search)).data;
      PlaceSearchResultsSchema.parse(result);
      assert.equal(result.length, 3);
      assert.equal(result[0].id, 'dev_central_square');
      assert.equal((await call(`${search}&query=East`)).data[0].id, 'dev_east_library');
      assert.equal((await call(`${search}&query=missing`)).data.length, 0);
      await call(search.replace('42.88', '40.00'), { expected: 422, code: 'UNSUPPORTED_AREA' });
      for (const suffix of ['&limit=1', '&unknown=1', '&area.center.latitude=42.88', '&limit%5Ba%5D=1']) {
        await call(search + suffix, { expected: 422, code: 'VALIDATION_FAILED' });
      }
      await call(search.replace('42.88', '42.881'), { expected: 422, code: 'VALIDATION_FAILED' });
      await call(search, { token: 'synthetic-invalid-bearer', expected: 401, code: 'UNAUTHENTICATED' });
      await call('me', { expected: 401, code: 'UNAUTHENTICATED' });
    });

    let session;
    await t.test('sign-in, private me, safe storage and real absence of ride/group refs', async () => {
      const pending = await challenge();
      OtpChallengeSchema.parse(pending);
      const response = await call('auth/otp/verify', { body: { challengeId: pending.id, code: '123456' } });
      session = AuthSessionSchema.parse(response.data);
      const me = CurrentUserSchema.parse((await call('me', { token: session.accessToken })).data);
      assert.equal(me.user.id, session.user.id);
      assert.equal(me.rideRequestId, null); assert.equal(me.groupId, null);
      assert.ok(!JSON.stringify(me).includes('phone'));
      await call(search, { token: session.accessToken });
      const stored = JSON.stringify((await database.query(`SELECT row_to_json(t) AS row FROM
        (SELECT verifier FROM ride_match.credentials UNION ALL SELECT verifier FROM ride_match.otp_challenges) t`)).rows);
      assert.ok(!stored.includes(session.accessToken) && !stored.includes(session.refreshToken) && !stored.includes('123456'));
      await call('auth/otp/verify', { body: { challengeId: pending.id, code: '123456' }, expected: 410, code: 'OTP_EXPIRED' });
    });

    await t.test('access expiry, refresh rotation, old access lifetime and replay revocation', async () => {
      time += 900_000;
      await call('me', { token: session.accessToken, expected: 401, code: 'SESSION_EXPIRED' });
      await call(search, { token: session.accessToken, expected: 401, code: 'SESSION_EXPIRED' });
      const next = SessionCredentialsSchema.parse((await call('auth/refresh', { body: { refreshToken: session.refreshToken } })).data);
      assert.ok(next.accessToken !== session.accessToken && next.refreshToken !== session.refreshToken);
      await call('me', { token: next.accessToken });
      await call('auth/refresh', { body: { refreshToken: session.refreshToken }, expected: 401, code: 'REFRESH_TOKEN_INVALID' });
      await call('me', { token: next.accessToken, expected: 401, code: 'UNAUTHENTICATED' });
      await call('auth/refresh', { body: { refreshToken: next.refreshToken }, expected: 401, code: 'REFRESH_TOKEN_INVALID' });
    });

    await t.test('attempt counter commits failures; malformed code does not consume attempts', async () => {
      const pending = await challenge();
      await call('auth/otp/verify', { body: { challengeId: pending.id, code: 'bad' }, expected: 422, code: 'VALIDATION_FAILED' });
      for (let index = 0; index < 5; index++) {
        await call('auth/otp/verify', { body: { challengeId: pending.id, code: '000000' }, expected: index === 4 ? 429 : 422, code: index === 4 ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_INVALID' });
      }
      await call('auth/otp/verify', { body: { challengeId: pending.id, code: '123456' }, expected: 429, code: 'OTP_ATTEMPTS_EXCEEDED' });
      assert.equal((await database.query('SELECT attempts FROM ride_match.otp_challenges WHERE id=$1', [pending.id])).rows[0].attempts, 5);
      await call('auth/otp/verify', { body: { challengeId: 'unknown_challenge', code: '123456' }, expected: 410, code: 'OTP_EXPIRED' });
    });

    await t.test('resend replacement, deadline and development provider restrictions', async () => {
      const phoneNumber = '+447700900800';
      const pending = (await call('auth/otp/challenges', { body: { phoneNumber } })).data;
      await call('auth/otp/challenges', { body: { phoneNumber }, expected: 429, code: 'OTP_RESEND_THROTTLED' });
      time += 30_000;
      const replacement = (await call('auth/otp/challenges', { body: { phoneNumber } })).data;
      await call('auth/otp/verify', { body: { challengeId: pending.id, code: '123456' }, expected: 410, code: 'OTP_EXPIRED' });
      time += 300_000;
      await call('auth/otp/verify', { body: { challengeId: replacement.id, code: '123456' }, expected: 410, code: 'OTP_EXPIRED' });
      await call('auth/otp/challenges', { body: { phoneNumber: '+12025550123' }, expected: 422, code: 'VALIDATION_FAILED' });
    });

    await t.test('concurrent verify creates only one session', async () => {
      const pending = await challenge();
      const results = await Promise.all([1, 2].map(() => fetch(`${base}/v1/auth/otp/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId: pending.id, code: '123456' }),
      })));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 410]);
      for (const result of results) await result.arrayBuffer();
    });

    await t.test('concurrent refresh has one winner and replay revokes its family', async () => {
      const signed = await signIn();
      const results = await Promise.all([1, 2].map(() => fetch(`${base}/v1/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: signed.refreshToken }),
      })));
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
      for (const result of results) {
        const data = await result.json();
        if (result.status === 200) await call('me', { token: data.data.accessToken, expected: 401, code: 'UNAUTHENTICATED' });
      }
    });

    await t.test('logout is durable/idempotent and accepts a rotated family credential', async () => {
      const signed = await signIn();
      const next = (await call('auth/refresh', { body: { refreshToken: signed.refreshToken } })).data;
      await call('me', { token: signed.accessToken });
      for (let index = 0; index < 2; index++) await call('auth/logout', { body: { refreshToken: signed.refreshToken }, expected: 204 });
      await call('me', { token: next.accessToken, expected: 401, code: 'UNAUTHENTICATED' });
      await call('auth/logout', { body: { refreshToken: 'synthetic-unknown-token' }, expected: 204 });
    });

    await t.test('provider failures cannot produce usable challenges', async () => {
      deliveryFails = true;
      await call('auth/otp/challenges', { body: { phoneNumber: '+447700900801' }, expected: 503, code: 'SERVICE_UNAVAILABLE' });
      deliveryFails = false;
      assert.equal((await database.query('SELECT count(*)::int AS count FROM ride_match.otp_challenges WHERE NOT delivered AND NOT consumed')).rows[0].count, 0);
    });

    await t.test('credentials, identity and rate limits survive application restart', async () => {
      const signed = await signIn();
      await app.close();
      app = await createApplication(isolated, dependencies);
      await app.listen(0, '127.0.0.1'); base = await app.getUrl();
      assert.equal((await call('me', { token: signed.accessToken })).data.user.id, signed.user.id);
      const next = (await call('auth/refresh', { body: { refreshToken: signed.refreshToken } })).data;
      await call('me', { token: next.accessToken });
      time += 31 * 86400_000;
      await call('auth/refresh', { body: { refreshToken: next.refreshToken }, expected: 401, code: 'REFRESH_TOKEN_INVALID' });
    });

    await t.test('real mobile adapter/session: sign-in, places, shared refresh, restore and logout', async () => {
      const mobile = await loadMobileAdapter();
      let controller;
      let persisted = null;
      let refreshRequests = 0;
      const store = { read: async () => persisted, write: async (value) => { persisted = value; }, clear: async () => { persisted = null; } };
      const adapter = mobile.createHttpDataSource({ baseUrl: `${base}/v1`, accessToken: () => controller?.getAccessToken() ?? null,
        fetch: async (url, options) => { if (String(url).endsWith('/auth/refresh')) refreshRequests++; return fetch(url, options); } });
      try {
        controller = mobile.createSessionController({ auth: adapter.dataSource.auth, store, resumeStoredSession: true });
        await controller.restore();
        const pending = await adapter.dataSource.auth.requestOtp({ phoneNumber: '+447700900803' });
        await controller.signIn({ challengeId: pending.id, code: '123456' });
        const source = mobile.withSessionRenewal(adapter.dataSource, () => controller);
        const original = await source.auth.getCurrentUser();
        assert.equal((await source.places.search({ area: { center: { latitude: 42.88, longitude: 74.60 }, radiusMeters: 10000 }, limit: 2 })).length, 2);
        time += 900_000;
        const reads = await Promise.all([source.auth.getCurrentUser(), source.auth.getCurrentUser()]);
        assert.ok(reads.every((result) => result.user.id === original.user.id));
        assert.equal(refreshRequests, 1, 'mobile session shares one refresh under concurrent expiry');
        time += 900_000;
        assert.equal((await source.places.search({ area: { center: { latitude: 42.88, longitude: 74.60 }, radiusMeters: 10000 }, limit: 2 })).length, 2);
        assert.equal(refreshRequests, 2, 'optional-auth place search refreshes an expired bearer');
        assert.ok(adapter.serverNow() !== null);
        controller.dispose();
        controller = mobile.createSessionController({ auth: adapter.dataSource.auth, store, resumeStoredSession: true });
        await controller.restore();
        assert.equal(controller.getState().status, 'signed-in');
        assert.equal(refreshRequests, 3);
        assert.equal((await source.auth.getCurrentUser()).user.id, original.user.id);
        assert.equal(await source.rides.getOwnRequest(), null);
        const outcome = await controller.signOut();
        assert.equal(outcome.revoked, true); assert.equal(persisted, null);
        await assert.rejects(adapter.dataSource.auth.getCurrentUser(), (error) => error.code === 'UNAUTHENTICATED');
      } finally { controller?.dispose(); adapter.dispose(); await mobile.dispose(); }
    });

    await t.test('persistent phone and per-peer limits cannot be bypassed by forwarded headers', async () => {
      const phoneNumber = '+447700900802';
      for (let index = 0; index < 5; index++) {
        await call('auth/otp/challenges', { body: { phoneNumber } }); time += 30_000;
      }
      await call('auth/otp/challenges', { body: { phoneNumber }, expected: 429, code: 'RATE_LIMITED' });
      time = (Math.floor(time / 60_000) + 1) * 60_000;
      for (let index = 0; index < 60; index++) {
        await call('me', { expected: 401, code: 'UNAUTHENTICATED' });
      }
      const response = await fetch(`${base}/v1/me`, { headers: { 'X-Forwarded-For': '192.0.2.55' } });
      assert.equal(response.status, 429); await response.arrayBuffer();
      await app.close(); app = await createApplication(isolated, dependencies);
      await app.listen(0, '127.0.0.1'); base = await app.getUrl();
      await call('me', { expected: 429, code: 'RATE_LIMITED' });
      time += 60_000;
      await call('me', { expected: 401, code: 'UNAUTHENTICATED' });
    });
  } finally {
    if (app) await app.close();
    if (database) await database.end();
    try { if (created) await admin.query(`DROP DATABASE ${name}`); }
    finally { await admin.end(); }
  }
});
