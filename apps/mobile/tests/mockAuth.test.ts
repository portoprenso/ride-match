import {
  AUTH_POLICY,
  AuthSessionSchema,
  CurrentUserSchema,
  OtpChallengeSchema,
  SessionCredentialsSchema,
  type ApiErrorCode,
  type AuthSessionDto,
  type OtpChallengeDto,
} from '@ride-match/contracts';

import { DEMO_OTP_CODE } from '../src/data/mock/auth';
import { createMockDataSource, createMockSimulator } from '../src/data/mock/createMockDataSource';
import type { Simulator } from '../src/data/mock/simulator';
import type { MockWorld } from '../src/data/mock/world';
import { MOCK_LATENCY_MS, settle } from './helpers/mockSource';

const START = Date.parse('2026-11-01T09:00:00.000Z');
const SECOND = 1000;
// Ofcom's range for fiction: synthetic numbers that reach no one.
const DEMO_NUMBER = '+447700900123';
const OTHER_DEMO_NUMBER = '+447700900456';
const WRONG_CODE = '000000';

let simulators: Simulator<MockWorld>[] = [];

/** A mock source with no riders, and the access token it sends, which a test sets as the session controller would. */
function source() {
  const simulator = createMockSimulator('empty-neighborhood', { latencyMs: { min: MOCK_LATENCY_MS, max: MOCK_LATENCY_MS } });
  simulators.push(simulator);
  const session = { accessToken: null as string | null };
  const dataSource = createMockDataSource(simulator, { accessToken: () => session.accessToken });
  return { simulator, dataSource, session };
}

type Source = ReturnType<typeof source>;

const sourceError = (code: ApiErrorCode, extra: object = {}) =>
  expect.objectContaining({ kind: 'source', body: expect.objectContaining({ code, ...extra }) });

/** Sets the clock so that a call started now does its work at `time`, after the simulated latency. */
function workAt(time: number) {
  jest.setSystemTime(time - MOCK_LATENCY_MS);
}

const requestOtp = ({ dataSource }: Source, phoneNumber = DEMO_NUMBER) => settle(dataSource.auth.requestOtp({ phoneNumber }));
const verify = ({ dataSource }: Source, challenge: OtpChallengeDto, code = DEMO_OTP_CODE) =>
  settle(dataSource.auth.verifyOtp({ challengeId: challenge.id, code }));

async function signIn(source: Source, phoneNumber = DEMO_NUMBER): Promise<AuthSessionDto> {
  const session = await verify(source, await requestOtp(source, phoneNumber));
  source.session.accessToken = session.accessToken;
  return session;
}

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  for (const simulator of simulators) simulator.dispose();
  simulators = [];
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

describe('sign-in', () => {
  it('signs a demo number in with the demo code, as its own synthetic rider', async () => {
    const mock = source();

    const challenge = await requestOtp(mock);
    expect(OtpChallengeSchema.safeParse(challenge).success).toBe(true);
    expect(Object.keys(challenge).sort()).toEqual(['expiresAt', 'id', 'resendAvailableAt']);
    const issuedAt = START + MOCK_LATENCY_MS;
    expect(Date.parse(challenge.expiresAt)).toBe(issuedAt + AUTH_POLICY.challengeLifetimeSeconds * SECOND);
    expect(Date.parse(challenge.resendAvailableAt)).toBe(issuedAt + AUTH_POLICY.resendIntervalSeconds * SECOND);

    const session = await verify(mock, challenge);
    expect(AuthSessionSchema.safeParse(session).success).toBe(true);
    expect(session.user).toEqual({ id: expect.any(String), displayName: 'Demo rider 123', avatarUrl: null });
    const verifiedAt = issuedAt + MOCK_LATENCY_MS;
    expect(Date.parse(session.accessTokenExpiresAt)).toBe(verifiedAt + AUTH_POLICY.accessTokenLifetimeSeconds * SECOND);
    expect(Date.parse(session.refreshTokenExpiresAt)).toBe(verifiedAt + AUTH_POLICY.refreshTokenLifetimeSeconds * SECOND);
    // The strict schemas above allow no code field; the number appears nowhere.
    expect(JSON.stringify([challenge, session])).not.toContain(DEMO_NUMBER.slice(1));

    mock.session.accessToken = session.accessToken;
    const me = await settle(mock.dataSource.auth.getCurrentUser());
    expect(CurrentUserSchema.safeParse(me).success).toBe(true);
    expect(me).toEqual({ user: session.user, rideRequestId: null, groupId: null });
  });

  it('keeps each number’s rider across sign-ins, and gives another number another rider', async () => {
    const mock = source();
    const first = await signIn(mock);

    jest.advanceTimersByTime(AUTH_POLICY.resendIntervalSeconds * SECOND);
    const again = await signIn(mock);
    const other = await signIn(mock, OTHER_DEMO_NUMBER);

    expect(again.user).toEqual(first.user);
    expect(again.accessToken).not.toBe(first.accessToken);
    expect(other.user.id).not.toBe(first.user.id);
    expect(other.user.displayName).toBe('Demo rider 456');
  });

  it('accepts only well-formed demo numbers, with field errors that repeat nothing', async () => {
    const mock = source();
    const failure = (input: unknown) => settle(mock.dataSource.auth.requestOtp(input as { phoneNumber: string }));

    const realLooking = await failure({ phoneNumber: '+996555123456' }).catch((error: unknown) => error);
    expect(realLooking).toEqual(
      sourceError('VALIDATION_FAILED', { fieldErrors: [expect.objectContaining({ field: 'phoneNumber', code: 'INVALID_VALUE' })] }),
    );
    expect(JSON.stringify(realLooking)).not.toContain('555123456');

    await expect(failure({ phoneNumber: '0555 123' })).rejects.toEqual(
      sourceError('VALIDATION_FAILED', { fieldErrors: [expect.objectContaining({ field: 'phoneNumber', code: 'INVALID_FORMAT' })] }),
    );
    await expect(failure({})).rejects.toEqual(
      sourceError('VALIDATION_FAILED', { fieldErrors: [expect.objectContaining({ field: 'phoneNumber', code: 'REQUIRED' })] }),
    );
  });

  it('throttles a new code until the resend time, then replaces the previous challenge', async () => {
    const mock = source();
    const first = await requestOtp(mock);
    const resendAt = Date.parse(first.resendAvailableAt);

    workAt(resendAt - 1);
    await expect(requestOtp(mock)).rejects.toEqual(sourceError('OTP_RESEND_THROTTLED', { retryAfterSeconds: 1 }));
    // Another number has its own interval.
    await expect(requestOtp(mock, OTHER_DEMO_NUMBER)).resolves.toBeDefined();

    workAt(resendAt);
    const second = await requestOtp(mock);
    expect(second.id).not.toBe(first.id);
    await expect(verify(mock, first)).rejects.toEqual(sourceError('OTP_EXPIRED'));
    await expect(verify(mock, second)).resolves.toBeDefined();
  });

  it('says how long to wait before the next code', async () => {
    const mock = source();
    await requestOtp(mock);

    await expect(requestOtp(mock)).rejects.toEqual(
      sourceError('OTP_RESEND_THROTTLED', { retryAfterSeconds: AUTH_POLICY.resendIntervalSeconds }),
    );
  });

  it('accepts a code until the challenge expires, and not at its deadline', async () => {
    const mock = source();
    const early = await requestOtp(mock);
    workAt(Date.parse(early.expiresAt) - 1);
    await expect(verify(mock, early)).resolves.toBeDefined();

    const late = await requestOtp(mock, OTHER_DEMO_NUMBER);
    workAt(Date.parse(late.expiresAt));
    await expect(verify(mock, late)).rejects.toEqual(sourceError('OTP_EXPIRED'));
  });

  it('counts wrong codes up to the limit, after which even the right code fails', async () => {
    const mock = source();
    const challenge = await requestOtp(mock);

    // A malformed code is not an attempt.
    await expect(verify(mock, challenge, '12ab')).rejects.toEqual(
      sourceError('VALIDATION_FAILED', { fieldErrors: [expect.objectContaining({ field: 'code', code: 'INVALID_FORMAT' })] }),
    );
    for (let attempt = 1; attempt < AUTH_POLICY.maxVerifyAttempts; attempt += 1) {
      await expect(verify(mock, challenge, WRONG_CODE)).rejects.toEqual(sourceError('OTP_INVALID'));
    }
    await expect(verify(mock, challenge, WRONG_CODE)).rejects.toEqual(sourceError('OTP_ATTEMPTS_EXCEEDED'));
    await expect(verify(mock, challenge)).rejects.toEqual(sourceError('OTP_ATTEMPTS_EXCEEDED'));
  });

  it('never lets a used or unknown challenge start a session', async () => {
    const mock = source();
    const challenge = await requestOtp(mock);
    await verify(mock, challenge);

    await expect(verify(mock, challenge)).rejects.toEqual(sourceError('OTP_EXPIRED'));
    await expect(verify(mock, { ...challenge, id: 'otp_99' })).rejects.toEqual(sourceError('OTP_EXPIRED'));
  });

  it('leaves the challenge untouched when the request is lost on the way', async () => {
    const mock = source();
    const challenge = await requestOtp(mock);
    mock.simulator.failNext({ kind: 'network' }, 'auth.verifyOtp');

    await expect(verify(mock, challenge)).rejects.toMatchObject({ kind: 'network' });
    await expect(verify(mock, challenge)).resolves.toBeDefined();
  });
});

describe('sessions', () => {
  it('answers UNAUTHENTICATED without a session or with an unknown token', async () => {
    const mock = source();

    await expect(settle(mock.dataSource.auth.getCurrentUser())).rejects.toEqual(sourceError('UNAUTHENTICATED'));
    mock.session.accessToken = 'demo-access.access_99.0000000000000000';
    await expect(settle(mock.dataSource.auth.getCurrentUser())).rejects.toEqual(sourceError('UNAUTHENTICATED'));
  });

  it('rotates credentials on refresh; a rotated refresh token never works again', async () => {
    const mock = source();
    const session = await signIn(mock);

    jest.advanceTimersByTime(60 * SECOND);
    const rotated = await settle(mock.dataSource.auth.refreshSession({ refreshToken: session.refreshToken }));
    expect(SessionCredentialsSchema.safeParse(rotated).success).toBe(true);
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    expect(rotated.accessToken).not.toBe(session.accessToken);
    expect(Date.parse(rotated.refreshTokenExpiresAt)).toBe(Date.now() + AUTH_POLICY.refreshTokenLifetimeSeconds * SECOND);

    await expect(settle(mock.dataSource.auth.refreshSession({ refreshToken: session.refreshToken }))).rejects.toEqual(
      sourceError('REFRESH_TOKEN_INVALID'),
    );
    // The earlier access token keeps working until it expires; the new one works too.
    await expect(settle(mock.dataSource.auth.getCurrentUser())).resolves.toMatchObject({ user: session.user });
    mock.session.accessToken = rotated.accessToken;
    await expect(settle(mock.dataSource.auth.getCurrentUser())).resolves.toMatchObject({ user: session.user });
    await expect(settle(mock.dataSource.auth.refreshSession({ refreshToken: rotated.refreshToken }))).resolves.toBeDefined();
  });

  it('expires the access token with SESSION_EXPIRED, which a refresh renews', async () => {
    const mock = source();
    const session = await signIn(mock);

    workAt(Date.parse(session.accessTokenExpiresAt) - 1);
    await expect(settle(mock.dataSource.auth.getCurrentUser())).resolves.toBeDefined();
    workAt(Date.parse(session.accessTokenExpiresAt));
    await expect(settle(mock.dataSource.auth.getCurrentUser())).rejects.toEqual(sourceError('SESSION_EXPIRED'));

    const rotated = await settle(mock.dataSource.auth.refreshSession({ refreshToken: session.refreshToken }));
    mock.session.accessToken = rotated.accessToken;
    await expect(settle(mock.dataSource.auth.getCurrentUser())).resolves.toMatchObject({ user: session.user });
  });

  it('refuses a refresh token at its deadline', async () => {
    const mock = source();
    const session = await signIn(mock);

    workAt(Date.parse(session.refreshTokenExpiresAt));
    await expect(settle(mock.dataSource.auth.refreshSession({ refreshToken: session.refreshToken }))).rejects.toEqual(
      sourceError('REFRESH_TOKEN_INVALID'),
    );
  });

  it('logs out every token of the session, and logging out again still succeeds', async () => {
    const mock = source();
    const session = await signIn(mock);
    const logout = (refreshToken: string) => settle(mock.dataSource.auth.logout({ refreshToken }));

    await expect(logout(session.refreshToken)).resolves.toBeUndefined();

    await expect(settle(mock.dataSource.auth.getCurrentUser())).rejects.toEqual(sourceError('UNAUTHENTICATED'));
    await expect(settle(mock.dataSource.auth.refreshSession({ refreshToken: session.refreshToken }))).rejects.toEqual(
      sourceError('REFRESH_TOKEN_INVALID'),
    );
    await expect(logout(session.refreshToken)).resolves.toBeUndefined();
    await expect(logout('demo-refresh.refresh_99.0000000000000000')).resolves.toBeUndefined();
    await expect(logout('x')).rejects.toEqual(sourceError('VALIDATION_FAILED'));
  });

  it('starts signed out after the scenario starts over', async () => {
    const mock = source();
    const session = await signIn(mock);

    mock.simulator.reset();

    await expect(settle(mock.dataSource.auth.getCurrentUser())).rejects.toEqual(sourceError('UNAUTHENTICATED'));
    await expect(settle(mock.dataSource.auth.refreshSession({ refreshToken: session.refreshToken }))).rejects.toEqual(
      sourceError('REFRESH_TOKEN_INVALID'),
    );
  });

  it('issues the same tokens for the same steps, from the scenario seed', async () => {
    const first = await signIn(source());
    jest.setSystemTime(START);
    const second = await signIn(source());

    expect(second).toEqual(first);
  });
});
