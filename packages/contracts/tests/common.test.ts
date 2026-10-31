import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CursorSchema,
  IdSchema,
  OperationIdSchema,
  ResourceVersionSchema,
  ResponseMetaSchema,
  TimestampSchema,
  apiResponseSchema,
  singleLineTextSchema,
} from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

describe('IdSchema', () => {
  it.each(['ride_01JB8Z3K4M', '3f1c2b9e-7d4a-4c1e-9b2f-0a1b2c3d4e5f', 'a', 'x'.repeat(64)])(
    'accepts %s',
    (value) => {
      expect(accepts(IdSchema, value)).toBe(true);
    },
  );

  it.each([
    ['empty', ''],
    ['too long', 'x'.repeat(65)],
    ['a space', 'ride 1'],
    ['a path separator', 'ride/1'],
    ['a query character', 'ride?1'],
    ['a number', 42],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(accepts(IdSchema, value)).toBe(false);
  });
});

describe('TimestampSchema', () => {
  it.each(['2026-10-31T12:00:00Z', '2026-10-31T12:00:00.123Z', '2028-02-29T00:00:00Z'])(
    'accepts %s',
    (value) => {
      expect(accepts(TimestampSchema, value)).toBe(true);
    },
  );

  it.each([
    ['an offset', '2026-10-31T18:00:00+06:00'],
    ['a local time', '2026-10-31T12:00:00'],
    ['a date only', '2026-10-31'],
    ['an impossible date', '2026-02-30T00:00:00Z'],
    ['a non-leap February 29', '2026-02-29T00:00:00Z'],
    ['hour 24', '2026-10-31T24:00:00Z'],
    ['epoch milliseconds', 1793448000000],
    ['free text', 'tomorrow'],
  ])('rejects %s', (_label, value) => {
    expect(accepts(TimestampSchema, value)).toBe(false);
  });
});

describe('ResourceVersionSchema', () => {
  it('accepts positive integers', () => {
    expect(accepts(ResourceVersionSchema, 1)).toBe(true);
    expect(accepts(ResourceVersionSchema, 4_096)).toBe(true);
  });

  it.each([
    ['zero', 0],
    ['a negative', -1],
    ['a fraction', 1.5],
    ['an unsafe integer', 2 ** 53],
    ['a numeric string', '3'],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ResourceVersionSchema, value)).toBe(false);
  });
});

describe('OperationIdSchema', () => {
  it('accepts a UUID', () => {
    expect(accepts(OperationIdSchema, '3f1c2b9e-7d4a-4c1e-9b2f-0a1b2c3d4e5f')).toBe(true);
  });

  it.each([
    ['a short key', 'retry-1'],
    ['a UUID without hyphens', '3f1c2b9e7d4a4c1e9b2f0a1b2c3d4e5f'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(accepts(OperationIdSchema, value)).toBe(false);
  });
});

describe('CursorSchema', () => {
  it('accepts unreserved URL characters', () => {
    expect(accepts(CursorSchema, 'eyJzZXEiOjQyfQ~page.2_a-b')).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['too long', 'c'.repeat(513)],
    ['a character that needs encoding', 'abc+def/=='],
  ])('rejects %s', (_label, value) => {
    expect(accepts(CursorSchema, value)).toBe(false);
  });
});

describe('singleLineTextSchema', () => {
  const ShortTextSchema = singleLineTextSchema(5);

  it.each(['a', 'a b', 'abcde', 'Алия', '🚕'])('accepts %s', (value) => {
    expect(accepts(ShortTextSchema, value)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['too long', 'abcdef'],
    ['only spaces', '   '],
    ['a leading space', ' a'],
    ['a trailing space', 'a '],
    ['a leading no-break space', ' a'],
    ['a line break', 'a\nb'],
    ['a tab', 'a\tb'],
    ['a control character', 'a\u0007b'],
    ['a number', 5],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ShortTextSchema, value)).toBe(false);
  });
});

describe('apiResponseSchema', () => {
  const ItemResponseSchema = apiResponseSchema(z.strictObject({ id: IdSchema }));

  it('accepts data with server time', () => {
    expect(
      ItemResponseSchema.parse({
        data: { id: 'ride_1' },
        meta: { serverTime: '2026-10-31T12:00:00Z' },
      }),
    ).toEqual({ data: { id: 'ride_1' }, meta: { serverTime: '2026-10-31T12:00:00Z' } });
  });

  it('rejects invalid data, missing or invalid meta, and extra fields', () => {
    const meta = { serverTime: '2026-10-31T12:00:00Z' };

    expect(accepts(ItemResponseSchema, { data: { id: '' }, meta })).toBe(false);
    expect(accepts(ItemResponseSchema, { data: { id: 'ride_1' } })).toBe(false);
    expect(accepts(ItemResponseSchema, { data: { id: 'ride_1' }, meta: {} })).toBe(false);
    expect(accepts(ItemResponseSchema, { data: { id: 'ride_1' }, meta, error: null })).toBe(false);
    expect(accepts(ResponseMetaSchema, { ...meta, clientTime: meta.serverTime })).toBe(false);
  });
});
