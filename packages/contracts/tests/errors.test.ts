import { describe, expect, it } from 'vitest';

import { ApiErrorSchema, FieldErrorSchema } from '../src/index.js';

const validationError = {
  code: 'VALIDATION_FAILED',
  message: 'Some fields need attention.',
  requestId: 'req_01JB8Z3K4M',
  fieldErrors: [
    { field: 'origin.latitude', code: 'OUT_OF_RANGE', message: 'Latitude is out of range.' },
  ],
};

describe('ApiErrorSchema', () => {
  it('accepts a minimal error', () => {
    expect(
      ApiErrorSchema.safeParse({
        code: 'GROUP_FULL',
        message: 'This group is full.',
        requestId: 'req_1',
      }).success,
    ).toBe(true);
  });

  it('accepts field errors and a retry delay', () => {
    expect(ApiErrorSchema.safeParse(validationError).success).toBe(true);
    expect(
      ApiErrorSchema.safeParse({
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Try again later.',
        requestId: 'req_2',
        retryAfterSeconds: 30,
      }).success,
    ).toBe(true);
  });

  it.each(['OTP_INVALID', 'OTP_EXPIRED', 'OTP_ATTEMPTS_EXCEEDED', 'OTP_RESEND_THROTTLED', 'UNSUPPORTED_AREA'])(
    'accepts the domain code %s',
    (code) => {
      expect(
        ApiErrorSchema.safeParse({ code, message: 'Request a new code.', requestId: 'req_3' }).success,
      ).toBe(true);
    },
  );

  it.each([
    ['an unknown code', { ...validationError, code: 'TEAPOT' }],
    ['a lowercase code', { ...validationError, code: 'validation_failed' }],
    ['the removed departure code', { ...validationError, code: 'INVALID_DEPARTURE' }],
    ['an empty message', { ...validationError, message: '' }],
    ['a missing request ID', { code: 'NOT_FOUND', message: 'Not found.' }],
    ['an invalid request ID', { ...validationError, requestId: 'req 1' }],
    ['an empty field-error list', { ...validationError, fieldErrors: [] }],
    ['a zero retry delay', { ...validationError, retryAfterSeconds: 0 }],
    ['a fractional retry delay', { ...validationError, retryAfterSeconds: 1.5 }],
    ['an HTTP status field', { ...validationError, status: 422 }],
    ['a stack trace', { ...validationError, stack: 'Error: at handler' }],
  ])('rejects %s', (_label, value) => {
    expect(ApiErrorSchema.safeParse(value).success).toBe(false);
  });
});

describe('FieldErrorSchema', () => {
  it.each(['phone', 'origin.latitude', 'members.0.userId'])('accepts the path %s', (field) => {
    expect(
      FieldErrorSchema.safeParse({ field, code: 'INVALID_FORMAT', message: 'Check this value.' })
        .success,
    ).toBe(true);
  });

  it.each(['', '.phone', 'origin..latitude', 'origin[0]', '0.userId', 'origin latitude'])(
    'rejects the path "%s"',
    (field) => {
      expect(
        FieldErrorSchema.safeParse({ field, code: 'INVALID_FORMAT', message: 'Check this value.' })
          .success,
      ).toBe(false);
    },
  );

  it('rejects an echoed submitted value', () => {
    expect(
      FieldErrorSchema.safeParse({
        field: 'code',
        code: 'INVALID_FORMAT',
        message: 'Enter the code from the message.',
        value: '000000',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown field-error code', () => {
    expect(
      FieldErrorSchema.safeParse({ field: 'phone', code: 'BAD', message: 'Check this value.' })
        .success,
    ).toBe(false);
  });
});
