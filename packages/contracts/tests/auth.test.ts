import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  AUTH_POLICY,
  AuthSessionSchema,
  CreateOtpChallengeInputSchema,
  LogoutInputSchema,
  OtpChallengeSchema,
  RefreshSessionInputSchema,
  SessionCredentialsSchema,
  UserSchema,
  VerifyOtpInputSchema,
} from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;
const addSeconds = (time: string, seconds: number) => new Date(Date.parse(time) + seconds * 1000).toISOString();

// Synthetic values only: a fictional 555-01xx number and made-up tokens.
const phoneNumber = '+12025550142';
const accessToken = 'mock-access.4f9c2e7a1b8d6e3f';
const refreshToken = 'mock-refresh.9a7b3c1d5e2f8a4b';
const issuedAt = '2026-10-31T12:00:00.000Z';
const challenge = { id: 'otp_1', expiresAt: '2026-10-31T12:05:00Z', resendAvailableAt: '2026-10-31T12:00:30Z' };
const credentials = {
  accessToken,
  accessTokenExpiresAt: '2026-10-31T12:15:00Z',
  refreshToken,
  refreshTokenExpiresAt: '2026-11-30T12:00:00Z',
};
const user = { id: 'user_1', displayName: 'Test Rider', avatarUrl: null };

describe('CreateOtpChallengeInputSchema', () => {
  it.each([phoneNumber, '+9965550142', '+123456789012345'])('accepts the E.164 number %s', (value) => {
    expect(accepts(CreateOtpChallengeInputSchema, { phoneNumber: value })).toBe(true);
  });

  it.each([
    ['no plus sign', '12025550142'],
    ['spaces', '+1 202 555 0142'],
    ['punctuation', '+1 (202) 555-0142'],
    ['a country code starting with 0', '+0202555014'],
    ['fewer than 7 digits', '+123456'],
    ['more than 15 digits', '+1234567890123456'],
    ['letters', '+1202555CALL'],
  ])('rejects a number with %s', (_label, value) => {
    expect(accepts(CreateOtpChallengeInputSchema, { phoneNumber: value })).toBe(false);
  });

  it('rejects a missing number and extra fields', () => {
    expect(accepts(CreateOtpChallengeInputSchema, {})).toBe(false);
    expect(accepts(CreateOtpChallengeInputSchema, { phoneNumber, displayName: 'Test Rider' })).toBe(false);
  });
});

describe('OtpChallengeSchema', () => {
  it('accepts a challenge, also when resend becomes available exactly at expiry', () => {
    expect(OtpChallengeSchema.parse(challenge)).toEqual(challenge);
    expect(accepts(OtpChallengeSchema, { ...challenge, resendAvailableAt: challenge.expiresAt })).toBe(true);
  });

  it('accepts a challenge issued under AUTH_POLICY', () => {
    expect(
      accepts(OtpChallengeSchema, {
        id: 'otp_2',
        expiresAt: addSeconds(issuedAt, AUTH_POLICY.challengeLifetimeSeconds),
        resendAvailableAt: addSeconds(issuedAt, AUTH_POLICY.resendIntervalSeconds),
      }),
    ).toBe(true);
  });

  it.each([
    ['resend available after expiry', { ...challenge, resendAvailableAt: '2026-10-31T12:05:00.001Z' }],
    ['a missing expiry', { id: 'otp_1', resendAvailableAt: challenge.resendAvailableAt }],
    ['a missing resend time', { id: 'otp_1', expiresAt: challenge.expiresAt }],
    ['an expiry with an offset', { ...challenge, expiresAt: '2026-10-31T18:05:00+06:00' }],
    ['an invalid ID', { ...challenge, id: 'otp 1' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(OtpChallengeSchema, value)).toBe(false);
  });

  it.each([
    ['the code', { ...challenge, code: '123456' }],
    ['the phone number', { ...challenge, phoneNumber }],
  ])('rejects a private field: %s', (_label, value) => {
    expect(accepts(OtpChallengeSchema, value)).toBe(false);
  });
});

describe('VerifyOtpInputSchema', () => {
  it.each(['123456', '000000'])('accepts the code %s', (code) => {
    expect(accepts(VerifyOtpInputSchema, { challengeId: 'otp_1', code })).toBe(true);
  });

  it.each([
    ['5 digits', '12345'],
    ['7 digits', '1234567'],
    ['a number instead of a string', 123456],
    ['letters', '12a456'],
    ['spaces', '123 456'],
    ['non-ASCII digits', '١٢٣٤٥٦'],
    ['an empty code', ''],
  ])('rejects a code with %s', (_label, code) => {
    expect(accepts(VerifyOtpInputSchema, { challengeId: 'otp_1', code })).toBe(false);
  });

  it('rejects a missing or invalid challenge ID and extra fields', () => {
    expect(accepts(VerifyOtpInputSchema, { code: '123456' })).toBe(false);
    expect(accepts(VerifyOtpInputSchema, { challengeId: 'otp/1', code: '123456' })).toBe(false);
    expect(accepts(VerifyOtpInputSchema, { challengeId: 'otp_1', code: '123456', phoneNumber })).toBe(false);
  });
});

describe('SessionCredentialsSchema', () => {
  it('accepts credentials, also when both tokens expire together', () => {
    expect(SessionCredentialsSchema.parse(credentials)).toEqual(credentials);
    expect(
      accepts(SessionCredentialsSchema, { ...credentials, accessTokenExpiresAt: credentials.refreshTokenExpiresAt }),
    ).toBe(true);
  });

  it('accepts credentials issued under AUTH_POLICY', () => {
    expect(
      accepts(SessionCredentialsSchema, {
        ...credentials,
        accessTokenExpiresAt: addSeconds(issuedAt, AUTH_POLICY.accessTokenLifetimeSeconds),
        refreshTokenExpiresAt: addSeconds(issuedAt, AUTH_POLICY.refreshTokenLifetimeSeconds),
      }),
    ).toBe(true);
  });

  it.each([
    ['an access token outliving the refresh token', { ...credentials, accessTokenExpiresAt: '2026-11-30T12:00:00.001Z' }],
    ['a token under 16 characters', { ...credentials, accessToken: 'short-token-123' }],
    ['a token over 4,096 characters', { ...credentials, refreshToken: 'a'.repeat(4_097) }],
    ['a token with a space', { ...credentials, accessToken: 'Bearer mock-access.4f9c2e7a' }],
    ['padding inside a token', { ...credentials, refreshToken: 'mock=refresh.9a7b3c1d' }],
    ['a missing refresh token', { accessToken, accessTokenExpiresAt: credentials.accessTokenExpiresAt }],
    ['a missing expiry', { ...credentials, refreshTokenExpiresAt: undefined }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(SessionCredentialsSchema, value)).toBe(false);
  });

  it('accepts JWT-style and padded tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEifQ.c2lnbmF0dXJlLXNhbXBsZQ';
    expect(accepts(SessionCredentialsSchema, { ...credentials, accessToken: jwt })).toBe(true);
    expect(accepts(SessionCredentialsSchema, { ...credentials, refreshToken: 'bW9jay1yZWZyZXNoLXRva2Vu==' })).toBe(true);
  });
});

describe('AuthSessionSchema', () => {
  const session = { user, ...credentials };

  it('accepts the user with credentials', () => {
    expect(AuthSessionSchema.parse(session)).toEqual(session);
  });

  it.each([
    ['a missing user', credentials],
    ['an invalid user', { ...session, user: { ...user, displayName: '' } }],
    ['an access token outliving the refresh token', { ...session, accessTokenExpiresAt: '2026-12-01T00:00:00Z' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(AuthSessionSchema, value)).toBe(false);
  });

  it.each([
    ['the phone number', { ...session, phoneNumber }],
    ['the phone number inside the user', { ...session, user: { ...user, phoneNumber } }],
    ['the verified code', { ...session, code: '123456' }],
  ])('rejects a private field: %s', (_label, value) => {
    expect(accepts(AuthSessionSchema, value)).toBe(false);
  });

  it('keeps credentials out of the public user', () => {
    expect(accepts(UserSchema, { ...user, accessToken, refreshToken })).toBe(false);
  });
});

describe('RefreshSessionInputSchema and LogoutInputSchema', () => {
  it.each([
    ['refresh', RefreshSessionInputSchema],
    ['logout', LogoutInputSchema],
  ])('%s accepts only a refresh token', (_label, schema) => {
    expect(accepts(schema, { refreshToken })).toBe(true);
    expect(accepts(schema, {})).toBe(false);
    expect(accepts(schema, { refreshToken: 'short' })).toBe(false);
    expect(accepts(schema, { refreshToken, accessToken })).toBe(false);
  });
});
