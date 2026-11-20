import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { ChatHistoryQueryInputSchema, BlockListQueryInputSchema } from '@ride-match/contracts';
import { pageCursor, readCursor, flatPageQuery } from '../dist/http/paging.js';
const secret = 'synthetic-paging-test-key-only';
const fails = (run) => assert.throws(run, (error) => error.body?.code === 'VALIDATION_FAILED' || error.getResponse?.().code === 'VALIDATION_FAILED');

test('signed page positions bind namespace, scope, payload and position type', () => {
  const cursor = pageCursor(secret, 'chat', 'synthetic-group', 12);
  assert.equal(readCursor(secret, 'chat', 'synthetic-group', cursor, z.int().positive()), 12);
  for (const args of [
    [secret, 'chat', 'other', cursor], [secret, 'blocks', 'synthetic-group', cursor],
    ['other-secret', 'chat', 'synthetic-group', cursor], [secret, 'chat', 'synthetic-group', `${cursor}x`],
    [secret, 'chat', 'synthetic-group', 'malformed'],
    [secret, 'chat', 'synthetic-group', pageCursor(secret, 'chat', 'synthetic-group', '12')],
  ]) fails(() => readCursor(...args, z.int().positive()));
});

test('paged queries reject duplicates, unknowns, both positions and noncanonical numbers', () => {
  const parse = (value) => flatPageQuery(value, ['beforeCursor', 'afterSequence', 'limit'], ['afterSequence', 'limit'], ChatHistoryQueryInputSchema);
  assert.deepEqual(parse({ limit: '5', afterSequence: '0' }), { limit: 5, afterSequence: 0 });
  for (const value of [{ limit: ['1','2'] }, { limit: '1', secret: 'synthetic' }, { limit: '1', afterSequence: '1', beforeCursor: 'abc' },
    { limit: '1e1' }, { limit: '1.5' }, { limit: '51' }, { limit: '1', afterSequence: '-1' }, {}]) fails(() => parse(value));
  fails(() => flatPageQuery({ limit: '1', afterSequence: '0' }, ['cursor', 'limit'], ['limit'], BlockListQueryInputSchema));
});
