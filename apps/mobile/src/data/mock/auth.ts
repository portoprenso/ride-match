import {
  AUTH_POLICY,
  CreateOtpChallengeInputSchema,
  LogoutInputSchema,
  RefreshSessionInputSchema,
  VerifyOtpInputSchema,
  type AuthSessionDto,
  type CurrentUserDto,
  type FieldErrorDto,
  type OtpChallengeDto,
  type SessionCredentialsDto,
} from '@ride-match/contracts';

import {
  toAuthSessionDto,
  toCurrentUserDto,
  toOtpChallengeDto,
  toSessionCredentialsDto,
  type IssuedCredentials,
} from './serializers';
import type { DemoSignIn } from '../DemoSignIn';
import type { WorkContext } from './simulator';
import type { MockWorld, OtpChallengeRecord, UserRecord } from './world';

/*
 * Simulated sign-in and sessions (docs/api/authentication.md), applying `AUTH_POLICY`'s timing
 * and attempt limits on the simulated clock. No SMS is sent: every challenge accepts the one
 * documented demo code, and only demo phone numbers can sign in, so no real number is ever
 * collected. Phone numbers, codes and tokens stay in the world's auth records and never appear
 * in a response, an error or an event.
 */

/** The code every mock challenge accepts. It is never part of a challenge response. */
export const DEMO_OTP_CODE = '123456';

/**
 * Demo phone numbers: Ofcom's range for fiction, +44 7700 900000 to +44 7700 900999, so none can
 * reach a real person. Each number signs in as its own synthetic rider.
 */
const DEMO_PHONE_NUMBER = /^\+447700900\d{3}$/;

export function isDemoPhoneNumber(phoneNumber: string): boolean {
  return DEMO_PHONE_NUMBER.test(phoneNumber);
}

/** What the sign-in screens show for the mock source: a demo number to start from and the demo code. */
export const MOCK_DEMO_SIGN_IN: DemoSignIn = Object.freeze({
  phoneNumber: '+447700900123',
  numbersHint: 'Demo numbers only: +44 7700 900000 to +44 7700 900999.',
  code: DEMO_OTP_CODE,
});

type Context = WorkContext<MockWorld>;

const SECOND_MS = 1000;
const FIELD_PATH = /^[A-Za-z][A-Za-z0-9]*(\.(?:[A-Za-z][A-Za-z0-9]*|\d+))*$/;

const FIELD_MESSAGES: Record<string, string> = {
  phoneNumber: 'Enter a phone number in international format, such as +44 7700 900123.',
  code: `Enter the ${AUTH_POLICY.codeLength}-digit code.`,
};

type Issue = { path: readonly PropertyKey[] };

/**
 * One field error per rejected field, `REQUIRED` when it is missing. Messages never repeat what
 * was sent. Issues outside a named field (such as an unknown key) add none.
 */
function toFieldErrors(input: unknown, issues: readonly Issue[]): FieldErrorDto[] | undefined {
  const errors = new Map<string, FieldErrorDto>();
  for (const issue of issues) {
    const field = issue.path.map(String).join('.');
    if (!FIELD_PATH.test(field) || errors.has(field)) continue;
    const missing = valueAt(input, issue.path) === undefined;
    errors.set(field, {
      field,
      code: missing ? 'REQUIRED' : 'INVALID_FORMAT',
      message: FIELD_MESSAGES[field] ?? 'This value is not valid.',
    });
  }
  return errors.size > 0 ? [...errors.values()].slice(0, 50) : undefined;
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let value = input;
  for (const key of path) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<PropertyKey, unknown>)[key];
  }
  return value;
}

function invalidInput(context: Context, input: unknown, issues: readonly Issue[]) {
  return context.sourceError('VALIDATION_FAILED', 'The request is not valid.', { fieldErrors: toFieldErrors(input, issues) });
}

/** An opaque bearer token from the scenario's seeded randomness: 32 hex digits after a readable prefix. */
function mintToken(context: Context, kind: 'access' | 'refresh'): string {
  let hex = '';
  for (let part = 0; part < 4; part += 1) {
    hex += Math.floor(context.random.next() * 0x1_0000_0000)
      .toString(16)
      .padStart(8, '0');
  }
  return `demo-${kind}.${context.ids.next(kind)}.${hex}`;
}

/** New access and refresh tokens for a session; the access token never outlives the refresh token. */
function issueCredentials(context: Context, sessionId: string): IssuedCredentials {
  const { auth } = context.state;
  const refreshTokenExpiresAt = context.now + AUTH_POLICY.refreshTokenLifetimeSeconds * SECOND_MS;
  const credentials: IssuedCredentials = {
    accessToken: mintToken(context, 'access'),
    accessTokenExpiresAt: Math.min(context.now + AUTH_POLICY.accessTokenLifetimeSeconds * SECOND_MS, refreshTokenExpiresAt),
    refreshToken: mintToken(context, 'refresh'),
    refreshTokenExpiresAt,
  };
  auth.accessTokens.set(credentials.accessToken, { sessionId, expiresAt: credentials.accessTokenExpiresAt });
  auth.refreshTokens.set(credentials.refreshToken, { sessionId, expiresAt: refreshTokenExpiresAt, status: 'current' });
  return credentials;
}

/** The synthetic rider a demo number signs in as, created on its first sign-in. */
function accountUser(context: Context, phoneNumber: string): UserRecord {
  const { auth, users } = context.state;
  const existing = auth.accounts.get(phoneNumber);
  if (existing !== undefined) {
    const user = users.get(existing);
    if (user !== undefined) return user;
  }
  const user: UserRecord = { id: context.ids.next('user'), displayName: `Demo rider ${phoneNumber.slice(-3)}`, avatarUrl: null };
  users.set(user.id, user);
  auth.accounts.set(phoneNumber, user.id);
  return user;
}

/**
 * `auth.requestOtp`: issues a challenge for a demo number, replacing the number's previous one,
 * whose code stops working. Fails with `VALIDATION_FAILED` (a `phoneNumber` field error) for a
 * malformed or non-demo number, and with `OTP_RESEND_THROTTLED` and `retryAfterSeconds` before
 * the previous challenge's `resendAvailableAt`, even if that challenge was used.
 */
export function requestOtp(context: Context, input: unknown): OtpChallengeDto {
  const parsed = CreateOtpChallengeInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(context, input, parsed.error.issues);
  const { phoneNumber } = parsed.data;
  if (!isDemoPhoneNumber(phoneNumber)) {
    throw context.sourceError('VALIDATION_FAILED', 'Only demo phone numbers can sign in.', {
      fieldErrors: [
        {
          field: 'phoneNumber',
          code: 'INVALID_VALUE',
          message: 'Use a demo number from +44 7700 900000 to +44 7700 900999. No SMS is sent.',
        },
      ],
    });
  }

  const { auth } = context.state;
  const previousId = auth.latestChallenges.get(phoneNumber);
  const previous = previousId === undefined ? undefined : auth.challenges.get(previousId);
  if (previous !== undefined && context.now < previous.resendAvailableAt) {
    throw context.sourceError('OTP_RESEND_THROTTLED', 'Wait a moment before requesting another code.', {
      retryAfterSeconds: Math.max(1, Math.ceil((previous.resendAvailableAt - context.now) / SECOND_MS)),
    });
  }

  if (previous?.status === 'open') previous.status = 'replaced';
  const challenge: OtpChallengeRecord = {
    id: context.ids.next('otp'),
    phoneNumber,
    expiresAt: context.now + AUTH_POLICY.challengeLifetimeSeconds * SECOND_MS,
    resendAvailableAt: context.now + AUTH_POLICY.resendIntervalSeconds * SECOND_MS,
    wrongCodes: 0,
    status: 'open',
  };
  auth.challenges.set(challenge.id, challenge);
  auth.latestChallenges.set(phoneNumber, challenge.id);
  return toOtpChallengeDto(challenge);
}

/**
 * `auth.verifyOtp`: exchanges the demo code for a new session as the number's synthetic rider.
 *
 * - `OTP_EXPIRED` for an unknown, expired, used or replaced challenge.
 * - `OTP_ATTEMPTS_EXCEEDED` once `AUTH_POLICY.maxVerifyAttempts` wrong codes were sent, for the
 *   last of them and every attempt after it, even with the right code.
 * - `OTP_INVALID` for any other wrong code.
 * - `VALIDATION_FAILED` for a malformed code or ID, which does not count as an attempt.
 *
 * A wrong code is counted before the error is thrown: unlike other work, this failure is meant
 * to leave a change behind.
 */
export function verifyOtp(context: Context, input: unknown): AuthSessionDto {
  const parsed = VerifyOtpInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(context, input, parsed.error.issues);
  const { auth } = context.state;
  const challenge = auth.challenges.get(parsed.data.challengeId);
  if (challenge === undefined || challenge.status !== 'open' || context.now >= challenge.expiresAt) {
    throw context.sourceError('OTP_EXPIRED', 'This code is no longer valid. Request a new one.');
  }
  const tooManyWrongCodes = () =>
    context.sourceError('OTP_ATTEMPTS_EXCEEDED', 'Too many wrong codes. Request a new one.');
  if (challenge.wrongCodes >= AUTH_POLICY.maxVerifyAttempts) throw tooManyWrongCodes();
  if (parsed.data.code !== DEMO_OTP_CODE) {
    challenge.wrongCodes += 1;
    if (challenge.wrongCodes >= AUTH_POLICY.maxVerifyAttempts) throw tooManyWrongCodes();
    throw context.sourceError('OTP_INVALID', 'That code is not right.');
  }

  challenge.status = 'used';
  const user = accountUser(context, challenge.phoneNumber);
  const session = { id: context.ids.next('session'), userId: user.id, revoked: false };
  auth.sessions.set(session.id, session);
  return toAuthSessionDto(user, issueCredentials(context, session.id));
}

/**
 * `auth.refreshSession`: rotates the session's credentials. The refresh token sent becomes
 * `rotated` and never works again; the new one lives `AUTH_POLICY.refreshTokenLifetimeSeconds`
 * from now. Access tokens already issued keep working until they expire, as stateless tokens
 * would. Fails with `REFRESH_TOKEN_INVALID` for an unknown, expired, rotated or revoked token,
 * and with `VALIDATION_FAILED` for a malformed one.
 */
export function refreshSession(context: Context, input: unknown): SessionCredentialsDto {
  const parsed = RefreshSessionInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(context, input, parsed.error.issues);
  const { auth } = context.state;
  const token = auth.refreshTokens.get(parsed.data.refreshToken);
  const session = token === undefined ? undefined : auth.sessions.get(token.sessionId);
  if (token === undefined || session === undefined || session.revoked || token.status !== 'current' || context.now >= token.expiresAt) {
    throw context.sourceError('REFRESH_TOKEN_INVALID', 'The session has ended. Sign in again.');
  }
  token.status = 'rotated';
  return toSessionCredentialsDto(issueCredentials(context, session.id));
}

/**
 * `auth.logout`: revokes the session the refresh token belongs to, so none of its tokens work
 * again. It succeeds the same way for a token already revoked, rotated or unknown, so repeating
 * it is safe and reveals nothing. Fails only with `VALIDATION_FAILED` for a malformed token.
 */
export function logout(context: Context, input: unknown): void {
  const parsed = LogoutInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(context, input, parsed.error.issues);
  const { auth } = context.state;
  const token = auth.refreshTokens.get(parsed.data.refreshToken);
  const session = token === undefined ? undefined : auth.sessions.get(token.sessionId);
  if (session !== undefined) session.revoked = true;
}

/**
 * `auth.getCurrentUser` for the caller holding `accessToken`: `UNAUTHENTICATED` without a token,
 * or with one that is unknown or whose session was revoked; `SESSION_EXPIRED` once the token
 * expired, which the app answers with a refresh.
 */
export function readCurrentUser(context: Context, accessToken: string | null): CurrentUserDto {
  const { auth, users } = context.state;
  const record = accessToken === null ? undefined : auth.accessTokens.get(accessToken);
  const session = record === undefined ? undefined : auth.sessions.get(record.sessionId);
  const user = session === undefined ? undefined : users.get(session.userId);
  if (record === undefined || session === undefined || session.revoked || user === undefined) {
    throw context.sourceError('UNAUTHENTICATED', 'Sign in to continue.');
  }
  if (context.now >= record.expiresAt) throw context.sourceError('SESSION_EXPIRED', 'The session needs to be renewed.');
  return toCurrentUserDto(context.state, user);
}
