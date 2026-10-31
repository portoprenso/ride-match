import { z } from 'zod';

import { IdSchema, TimestampSchema } from './common.js';
import { UserSchema } from './users.js';

/**
 * Authentication defaults chosen for the mock MVP (CONTRACT-001-C).
 *
 * These are reviewed mock-product values, not a production policy. The schemas enforce the
 * code length. The mock auth operations (AUTH-001-A) apply the timing and attempt values and
 * test them at their boundaries; clients never hardcode them and read the timestamps that
 * each challenge and session carries instead.
 */
export const AUTH_POLICY = {
  /** Digits in a one-time code. */
  codeLength: 6,
  /** How long a challenge's code can be verified, from when the challenge is issued. */
  challengeLifetimeSeconds: 300,
  /** Wait after issuing a challenge before a new one can be requested for the same phone number. */
  resendIntervalSeconds: 30,
  /** Wrong codes allowed per challenge; the last of them already fails with `OTP_ATTEMPTS_EXCEEDED`. */
  maxVerifyAttempts: 5,
  /** Lifetime of an access token. */
  accessTokenLifetimeSeconds: 900,
  /** Lifetime of a refresh token; each refresh issues a new one with a new lifetime. */
  refreshTokenLifetimeSeconds: 2_592_000,
} as const;

/**
 * Phone number in E.164 form: `+`, a country code that does not start with 0, and 7–15 digits
 * in total, with no spaces or punctuation. The app normalizes what the user typed before
 * sending it.
 *
 * Private: it exists only at the authentication boundary. It never appears in user profiles,
 * events, logs or analytics, and no response echoes it.
 */
export const PhoneNumberSchema = z.e164();
export type PhoneNumber = z.infer<typeof PhoneNumberSchema>;

/** One-time code: exactly `AUTH_POLICY.codeLength` ASCII digits, as a string so leading zeros survive. */
export const OtpCodeSchema = z
  .string()
  .length(AUTH_POLICY.codeLength)
  .regex(/^\d+$/, 'Expected digits only');
export type OtpCode = z.infer<typeof OtpCodeSchema>;

/**
 * Opaque access or refresh token. Clients store and send it unchanged and never parse it.
 *
 * 16–4,096 characters of the bearer-token alphabet (RFC 6750: letters, digits, `-`, `.`, `_`,
 * `~`, `+`, `/`, then optional `=` padding), so it fits an `Authorization: Bearer` header.
 * Secret: never logged, shown or put in analytics, URLs or events.
 */
export const SessionTokenSchema = z
  .string()
  .min(16)
  .max(4096)
  .regex(/^[A-Za-z0-9._~+/-]+=*$/, 'Expected bearer-token characters');
export type SessionToken = z.infer<typeof SessionTokenSchema>;

/**
 * Request for a one-time code (`POST /auth/otp/challenges`), also used to resend one.
 *
 * A new request for the same number replaces that number's current challenge, whose code
 * then stops working. Before the current challenge's `resendAvailableAt`, the request fails
 * with `OTP_RESEND_THROTTLED` and `retryAfterSeconds`. The mock sends no SMS.
 */
export const CreateOtpChallengeInputSchema = z.strictObject({
  phoneNumber: PhoneNumberSchema,
});
export type CreateOtpChallengeInput = z.infer<typeof CreateOtpChallengeInputSchema>;

/**
 * A pending code verification, as returned by `POST /auth/otp/challenges`.
 *
 * - `id` identifies the challenge in `VerifyOtpInput`.
 * - `expiresAt` is when its code stops working.
 * - `resendAvailableAt` is the earliest time a new code can be requested; it is never later
 *   than `expiresAt`, so a user is never stuck with an expired code and no way to get another.
 *
 * The app shows countdowns from these server times rather than from hardcoded durations. The
 * challenge never contains the code or the phone number.
 */
export const OtpChallengeSchema = z
  .strictObject({
    id: IdSchema,
    expiresAt: TimestampSchema,
    resendAvailableAt: TimestampSchema,
  })
  .refine((challenge) => Date.parse(challenge.resendAvailableAt) <= Date.parse(challenge.expiresAt), {
    message: 'Expected resendAvailableAt no later than expiresAt',
    path: ['resendAvailableAt'],
  });
export type OtpChallengeDto = z.infer<typeof OtpChallengeSchema>;

/**
 * A code submitted for a challenge (`POST /auth/otp/verify`).
 *
 * Outcomes besides success:
 * - A wrong code fails with `OTP_INVALID`. The `AUTH_POLICY.maxVerifyAttempts`-th wrong code,
 *   and every attempt after it, even with the right code, fails with `OTP_ATTEMPTS_EXCEEDED`.
 * - An expired, already used, replaced or unknown challenge fails with `OTP_EXPIRED`.
 * - A malformed code fails this schema (`VALIDATION_FAILED`) and is not counted as an attempt.
 *
 * In each failure case the user requests a new challenge. A used challenge can never create
 * a second session.
 */
export const VerifyOtpInputSchema = z.strictObject({
  challengeId: IdSchema,
  code: OtpCodeSchema,
});
export type VerifyOtpInput = z.infer<typeof VerifyOtpInputSchema>;

const credentialFields = {
  accessToken: SessionTokenSchema,
  accessTokenExpiresAt: TimestampSchema,
  refreshToken: SessionTokenSchema,
  refreshTokenExpiresAt: TimestampSchema,
};

const accessExpiresFirst = {
  check: (credentials: { accessTokenExpiresAt: string; refreshTokenExpiresAt: string }) =>
    Date.parse(credentials.accessTokenExpiresAt) <= Date.parse(credentials.refreshTokenExpiresAt),
  params: {
    message: 'Expected accessTokenExpiresAt no later than refreshTokenExpiresAt',
    path: ['accessTokenExpiresAt'],
  },
};

/**
 * Session credentials, as returned by `POST /auth/refresh`.
 *
 * The access token authorizes requests until `accessTokenExpiresAt` and stays in memory only.
 * The refresh token obtains new credentials until `refreshTokenExpiresAt` and lives in secure
 * storage. Refresh rotates both: the returned refresh token replaces the one sent, which stops
 * working, and reusing it fails with `REFRESH_TOKEN_INVALID`. The access token never outlives
 * the refresh token.
 */
export const SessionCredentialsSchema = z
  .strictObject(credentialFields)
  .refine(accessExpiresFirst.check, accessExpiresFirst.params);
export type SessionCredentialsDto = z.infer<typeof SessionCredentialsSchema>;

/**
 * A new session after a verified code: the signed-in user's public summary plus the session
 * credentials (see `SessionCredentialsSchema`).
 *
 * Private to the authentication boundary. The app reads `GET /me` for the user's current
 * ride request and group. No phone number is returned.
 */
export const AuthSessionSchema = z
  .strictObject({ user: UserSchema, ...credentialFields })
  .refine(accessExpiresFirst.check, accessExpiresFirst.params);
export type AuthSessionDto = z.infer<typeof AuthSessionSchema>;

/**
 * Request for rotated credentials (`POST /auth/refresh`). An unknown, expired, revoked or
 * already rotated token fails with `REFRESH_TOKEN_INVALID`, and the app then clears the
 * session. Clients share one refresh attempt across all operations waiting on it.
 */
export const RefreshSessionInputSchema = z.strictObject({
  refreshToken: SessionTokenSchema,
});
export type RefreshSessionInput = z.infer<typeof RefreshSessionInputSchema>;

/**
 * Request to end a session (`POST /auth/logout`, answered with `204`). Revoking an already
 * revoked token also succeeds. The app clears local credentials and private data even when
 * this request fails, without reporting the server revocation as done.
 */
export const LogoutInputSchema = z.strictObject({
  refreshToken: SessionTokenSchema,
});
export type LogoutInput = z.infer<typeof LogoutInputSchema>;
