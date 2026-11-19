const { fetch } = globalThis;
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { Body, Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiErrorSchema, apiResponseSchema } from '@ride-match/contracts';
import { z } from 'zod';
import { AppModule } from '../dist/app.module.js';
import { configureHttp } from '../dist/application.js';
import { readEnvironment } from '../dist/config/environment.js';
import { ZodValidationPipe } from '../dist/http/zod-validation.pipe.js';

const environment = {
  API_APP_ENV: 'test', API_PORT: '3000',
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic',
  API_ALLOWED_ORIGINS: 'http://localhost:3001', API_LOG_LEVEL: 'error',
};

test('configuration rejects missing/unsafe values without disclosing them', () => {
  assert.equal(readEnvironment(environment).API_PORT, 3000);
  assert.deepEqual(readEnvironment({ ...environment, API_ALLOWED_ORIGINS: '' }).API_ALLOWED_ORIGINS, []);
  for (const patch of [
    { API_PORT: '' }, { API_PORT: '65536' }, { API_APP_ENV: 'preview' },
    { DATABASE_URL: 'https://synthetic-secret.invalid' },
    { API_ALLOWED_ORIGINS: '*' }, { API_ALLOWED_ORIGINS: 'https://example.invalid/path' },
    { API_LOG_LEVEL: 'everything' }, { API_PORT: undefined },
  ]) {
    assert.throws(() => readEnvironment({ ...environment, ...patch }), (error) => {
      assert.match(error.message, /^Invalid API environment: [A-Z_, ]+$/);
      assert.ok(!error.message.includes('synthetic-secret'));
      return true;
    });
  }
});

test('Zod boundary rejects unknown keys and never echoes values or record paths', () => {
  const pipe = new ZodValidationPipe(z.strictObject({ count: z.int().min(1) }));
  assert.deepEqual(pipe.transform({ count: 2 }), { count: 2 });
  assert.throws(() => pipe.transform({ count: 'synthetic-secret', privateKey: 'synthetic-secret' }), (error) => {
    assert.equal(error.getStatus(), 422);
    assert.ok(!JSON.stringify(error.failure).includes('synthetic-secret'));
    return true;
  });
  const records = new ZodValidationPipe(z.record(z.string(), z.int()));
  assert.throws(() => records.transform({ syntheticPrivateKey: 'bad' }), (error) => {
    assert.ok(!JSON.stringify(error.failure).includes('syntheticPrivateKey'));
    return true;
  });
});

test('HTTP probes, parsing, errors, correlation and CORS share the real boundary', async (t) => {
  // Reserve a port without listening, ensuring no existing service can answer DB probes.
  const unavailableDatabase = createServer();
  unavailableDatabase.listen(0, '127.0.0.1');
  await once(unavailableDatabase, 'listening');
  const port = unavailableDatabase.address().port;
  await new Promise((resolve) => unavailableDatabase.close(resolve));
  const config = readEnvironment({ ...environment,
    DATABASE_URL: `postgresql://synthetic:synthetic@127.0.0.1:${port}/synthetic`,
  });
  class BoundaryProbe {
    validate(body) { return body; }
    crash() { throw new Error('synthetic-private-driver-message'); }
    noContent() { return undefined; }
  }
  Controller('boundary-probe')(BoundaryProbe);
  for (const [name, decorator] of [['validate', Post('validate')], ['crash', Get('crash')], ['noContent', Post('no-content')]]) {
    decorator(BoundaryProbe.prototype, name, Object.getOwnPropertyDescriptor(BoundaryProbe.prototype, name));
  }
  Body(new ZodValidationPipe(z.strictObject({ count: z.int().positive() })))(BoundaryProbe.prototype, 'validate', 0);
  HttpCode(200)(BoundaryProbe.prototype, 'validate', Object.getOwnPropertyDescriptor(BoundaryProbe.prototype, 'validate'));
  HttpCode(204)(BoundaryProbe.prototype, 'noContent', Object.getOwnPropertyDescriptor(BoundaryProbe.prototype, 'noContent'));
  class ProbeModule {}
  Module({ imports: [AppModule.register(config)], controllers: [BoundaryProbe] })(ProbeModule);
  const logs = [];
  const capture = (value) => logs.push(JSON.stringify(value));
  const app = await NestFactory.create(ProbeModule, {
    bodyParser: false, abortOnError: false,
    logger: { log: capture, error: capture, warn: capture, debug: capture, verbose: capture, fatal: capture },
  });
  configureHttp(app, config);
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();
  const request = (path, options) => fetch(`${base}/v1/${path}`, options);
  const checkError = async (response, status, code) => {
    assert.equal(response.status, status);
    const body = ApiErrorSchema.parse(await response.json());
    assert.equal(body.code, code);
    assert.equal(body.requestId, response.headers.get('x-request-id'));
    assert.match(body.requestId, /^[a-f0-9-]{36}$/);
    return body;
  };
  await t.test('liveness is independent of DB; every request gets a fresh server ID', async () => {
    const first = await request('health/live', { headers: { 'X-Request-Id': 'synthetic-private-id' } });
    assert.equal(first.status, 200);
    apiResponseSchema(z.strictObject({ status: z.literal('ok') })).parse(await first.json());
    assert.notEqual(first.headers.get('x-request-id'), 'synthetic-private-id');
    assert.equal(first.headers.get('x-powered-by'), null);
    const second = await request('health/live');
    assert.notEqual(first.headers.get('x-request-id'), second.headers.get('x-request-id'));
    await second.arrayBuffer();
  });
  await t.test('readiness reports unavailable DB as safe raw 503', async () => {
    await checkError(await request('health/ready'), 503, 'SERVICE_UNAVAILABLE');
  });
  await t.test('malformed JSON and invalid DTOs produce safe 422', async () => {
    for (const body of ['{"synthetic-private-input":', '{"count":"synthetic-private-input"}', '{"count":1,"extra":"synthetic-private-input"}']) {
      const error = await checkError(await request('boundary-probe/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }), 422, 'VALIDATION_FAILED');
      assert.ok(!JSON.stringify(error).includes('synthetic-private-input'));
    }
  });
  await t.test('valid responses have server time; 204 stays bodyless', async () => {
    const valid = await request('boundary-probe/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"count":2}',
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).data.count, 2);
    const empty = await request('boundary-probe/no-content', { method: 'POST' });
    assert.equal(empty.status, 204);
    assert.equal(await empty.text(), '');
  });
  await t.test('unknown failures are 503 and diagnostics omit private exception text', async () => {
    const error = await checkError(await request('boundary-probe/crash'), 503, 'SERVICE_UNAVAILABLE');
    assert.ok(!JSON.stringify(error).includes('synthetic-private-driver-message'));
    assert.ok(logs.some((entry) => entry.includes(error.requestId)));
    assert.ok(!logs.join('\n').includes('synthetic-private'));
  });
  await t.test('unsupported business routes remain transport 404; oversized bodies are 413', async () => {
    const missing = await request('rides');
    assert.equal(missing.status, 404);
    const body = await missing.json();
    assert.equal(body.statusCode, 404);
    assert.ok(!('code' in body));
    assert.equal(body.requestId, missing.headers.get('x-request-id'));
    const large = await request('boundary-probe/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(17000) }),
    });
    assert.equal(large.status, 413);
    await large.arrayBuffer();
  });
  await t.test('CORS permits configured origin and exposes request ID', async () => {
    const allowed = await request('health/live', { headers: { Origin: 'http://localhost:3001' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3001');
    assert.equal(allowed.headers.get('access-control-expose-headers'), 'X-Request-Id');
    await allowed.arrayBuffer();
    const denied = await request('health/live', { headers: { Origin: 'http://other.invalid' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    await denied.arrayBuffer();
  });
});
