import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  AuthSessionSchema, CurrentUserSchema, OtpChallengeSchema, OtpCodeSchema, SessionCredentialsSchema, SessionTokenSchema,
} from '@ride-match/contracts';
import type { ApiErrorCode, AuthSessionDto, CurrentUserDto, OtpChallengeDto, SessionCredentialsDto, UserDto, VerifyOtpInput } from '@ride-match/contracts';
import type pg from 'pg';
import { API_CONFIG } from '../config/environment.js';
import type { ApiConfig } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { transaction } from '../database/transaction.js';
import { ApiException } from '../http/api-exception.js';
import { CLOCK, OTP_PROVIDER } from './runtime.js';
import type { Clock, OtpProvider } from './runtime.js';

// Local backend policy, deliberately independent of the mock AUTH_POLICY implementation.
const ACCESS_MS = 900_000;
const REFRESH_MS = 30 * 86400_000;
const OTP_MS = 300_000;
const RESEND_MS = 30_000;
const fail = (code: ApiErrorCode, status: number, message: string) => new ApiException({ code, message }, status);
type Identity = { user_id: string | null; current_challenge_id: string | null; resend_at: Date | null };
type Challenge = { id: string; verifier: string; expires_at: Date; resend_at: Date; attempts: number; consumed: boolean; delivered: boolean };
type Credential = { id: string; user_id: string; revoked: boolean; refresh_expires_at: Date; expires_at: Date; consumed: boolean };

/**
 * PostgreSQL-backed authentication. Identity rows serialize OTP replacement and
 * verification; session rows serialize refresh/replay/logout. All credentials
 * are keyed, domain-separated digests; public projections are constructed explicitly.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
  ) {}

  private digest(scope: string, value: string): string {
    return createHmac('sha256', this.config.API_AUTH_SECRET).update(`${scope}\0${value}`).digest('hex');
  }

  /** Persistent fixed windows; proxy headers are not used as identity. No raw IP/phone is stored. */
  async rateLimit(scope: string, identity: string, maximum = 60, windowMs = 60_000): Promise<void> {
    const now = this.clock.now().getTime();
    const start = new Date(Math.floor(now / windowMs) * windowMs);
    const result = await this.database.pool.query<{ hits: number }>(`
      INSERT INTO ride_match.rate_limits (key, window_start, hits) VALUES ($1, $2, 1)
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limits.window_start = EXCLUDED.window_start THEN LEAST(rate_limits.hits + 1, 1000000) ELSE 1 END,
        window_start = EXCLUDED.window_start RETURNING hits`, [this.digest(`limit:${scope}`, identity), start]);
    if (result.rows[0]!.hits > maximum) {
      throw new ApiException({ code: 'RATE_LIMITED', message: 'Too many requests.',
        retryAfterSeconds: Math.max(1, Math.ceil((start.getTime() + windowMs - now) / 1000)) }, 429);
    }
  }

  private async commit<T>(work: (client: pg.PoolClient) => Promise<T | ApiException>): Promise<T> {
    const result = await transaction(this.database.pool, work);
    if (result instanceof ApiException) throw result;
    return result;
  }

  /** Replaces one pending challenge under a phone lock, then confirms delivery outside the transaction. */
  async requestOtp(phoneNumber: string): Promise<OtpChallengeDto> {
    const code = this.otp.createCode(phoneNumber);
    if (!OtpCodeSchema.safeParse(code).success) throw fail('SERVICE_UNAVAILABLE', 503, 'OTP delivery unavailable.');
    const phoneKey = this.digest('phone', phoneNumber);
    await this.rateLimit('phone-otp', phoneNumber, 5, 3600_000);
    const challenge = await this.commit<OtpChallengeDto>(async (client) => {
      await client.query('INSERT INTO ride_match.auth_identities (phone_key) VALUES ($1) ON CONFLICT DO NOTHING', [phoneKey]);
      const identity = (await client.query<Identity>('SELECT * FROM ride_match.auth_identities WHERE phone_key=$1 FOR UPDATE', [phoneKey])).rows[0]!;
      const now = this.clock.now().getTime();
      if (identity.resend_at && identity.resend_at.getTime() > now) {
        return new ApiException({ code: 'OTP_RESEND_THROTTLED', message: 'Wait before requesting another code.',
          retryAfterSeconds: Math.ceil((identity.resend_at.getTime() - now) / 1000) }, 429);
      }
      if (identity.current_challenge_id) await client.query('UPDATE ride_match.otp_challenges SET consumed=true WHERE id=$1', [identity.current_challenge_id]);
      const id = randomUUID();
      const expiresAt = new Date(now + OTP_MS).toISOString();
      const resendAvailableAt = new Date(now + RESEND_MS).toISOString();
      await client.query(`INSERT INTO ride_match.otp_challenges (id, phone_key, verifier, expires_at, resend_at)
        VALUES ($1,$2,$3,$4,$5)`, [id, phoneKey, this.digest(`otp:${id}`, code), expiresAt, resendAvailableAt]);
      await client.query('UPDATE ride_match.auth_identities SET current_challenge_id=$2, resend_at=$3 WHERE phone_key=$1', [phoneKey, id, resendAvailableAt]);
      return OtpChallengeSchema.parse({ id, expiresAt, resendAvailableAt });
    });
    try {
      await this.otp.deliver(phoneNumber, code);
    } catch {
      // A failed/unknown delivery is never usable; no code/provider payload is logged.
      await this.database.pool.query('UPDATE ride_match.otp_challenges SET consumed=true WHERE id=$1', [challenge.id]);
      throw fail('SERVICE_UNAVAILABLE', 503, 'OTP delivery unavailable.');
    }
    await this.database.pool.query('UPDATE ride_match.otp_challenges SET delivered=true WHERE id=$1', [challenge.id]);
    return challenge;
  }

  /** Attempts and consumption commit even when verification is refused; concurrent success is single-use. */
  async verifyOtp(input: VerifyOtpInput): Promise<AuthSessionDto> {
    if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.challengeId)) throw fail('OTP_EXPIRED', 410, 'Request a new code.');
    return this.commit<AuthSessionDto>(async (client) => {
      const found = (await client.query<{ phone_key: string }>('SELECT phone_key FROM ride_match.otp_challenges WHERE id=$1', [input.challengeId])).rows[0];
      if (!found) return fail('OTP_EXPIRED', 410, 'Request a new code.');
      const identity = (await client.query<Identity>('SELECT * FROM ride_match.auth_identities WHERE phone_key=$1 FOR UPDATE', [found.phone_key])).rows[0]!;
      const challenge = (await client.query<Challenge>('SELECT * FROM ride_match.otp_challenges WHERE id=$1 FOR UPDATE', [input.challengeId])).rows[0]!;
      const now = this.clock.now().getTime();
      if (challenge.consumed || !challenge.delivered || identity.current_challenge_id !== input.challengeId || challenge.expires_at.getTime() <= now) {
        return fail('OTP_EXPIRED', 410, 'Request a new code.');
      }
      if (challenge.attempts >= 5) return fail('OTP_ATTEMPTS_EXCEEDED', 429, 'Request a new code.');
      if (!timingSafeEqual(Buffer.from(challenge.verifier, 'hex'), Buffer.from(this.digest(`otp:${input.challengeId}`, input.code), 'hex'))) {
        await client.query('UPDATE ride_match.otp_challenges SET attempts=attempts+1 WHERE id=$1', [input.challengeId]);
        return challenge.attempts + 1 >= 5 ? fail('OTP_ATTEMPTS_EXCEEDED', 429, 'Request a new code.') : fail('OTP_INVALID', 422, 'Code not accepted.');
      }
      await client.query('UPDATE ride_match.otp_challenges SET consumed=true WHERE id=$1', [input.challengeId]);
      let userId = identity.user_id;
      if (!userId) {
        userId = randomUUID();
        await client.query('INSERT INTO ride_match.users (id,display_name) VALUES ($1,$2)', [userId, 'Development rider']);
        await client.query('UPDATE ride_match.auth_identities SET user_id=$2 WHERE phone_key=$1', [found.phone_key, userId]);
      }
      const sessionId = randomUUID();
      await client.query('INSERT INTO ride_match.sessions (id,user_id,refresh_expires_at) VALUES ($1,$2,$3)', [sessionId, userId, new Date(now + REFRESH_MS)]);
      const user = await this.user(client, userId);
      return AuthSessionSchema.parse({ user, ...await this.issue(client, sessionId, now) });
    });
  }

  private async user(client: pg.PoolClient, id: string): Promise<UserDto> {
    const row = (await client.query<{ id: string; display_name: string; avatar_url: string | null }>(
      'SELECT id,display_name,avatar_url FROM ride_match.users WHERE id=$1', [id])).rows[0]!;
    return { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url };
  }

  private async issue(client: pg.PoolClient, sessionId: string, now: number): Promise<SessionCredentialsDto> {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    const accessTokenExpiresAt = new Date(now + ACCESS_MS).toISOString();
    const refreshTokenExpiresAt = new Date(now + REFRESH_MS).toISOString();
    await client.query(`INSERT INTO ride_match.credentials (verifier,session_id,kind,expires_at) VALUES
      ($1,$2,'access',$3),($4,$2,'refresh',$5)`, [this.digest('access', accessToken), sessionId, accessTokenExpiresAt, this.digest('refresh', refreshToken), refreshTokenExpiresAt]);
    await client.query('UPDATE ride_match.sessions SET refresh_expires_at=$2 WHERE id=$1', [sessionId, refreshTokenExpiresAt]);
    return SessionCredentialsSchema.parse({ accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt });
  }

  /** A known rotated refresh revokes its whole family, including the racing winner, before failing. */
  async refresh(refreshToken: string): Promise<SessionCredentialsDto> {
    return this.commit<SessionCredentialsDto>(async (client) => {
      const row = await this.lockRefresh(client, refreshToken);
      const now = this.clock.now().getTime();
      if (!row || row.revoked || row.expires_at.getTime() <= now || row.refresh_expires_at.getTime() <= now) {
        return fail('REFRESH_TOKEN_INVALID', 401, 'Sign in again.');
      }
      if (row.consumed) {
        await client.query('UPDATE ride_match.sessions SET revoked=true WHERE id=$1', [row.id]);
        return fail('REFRESH_TOKEN_INVALID', 401, 'Sign in again.');
      }
      await client.query('UPDATE ride_match.credentials SET consumed=true WHERE verifier=$1', [this.digest('refresh', refreshToken)]);
      return this.issue(client, row.id, now);
    });
  }

  private async lockRefresh(client: pg.PoolClient, token: string): Promise<Credential | undefined> {
    const verifier = this.digest('refresh', token);
    const found = (await client.query<{ session_id: string }>(
      "SELECT session_id FROM ride_match.credentials WHERE verifier=$1 AND kind='refresh'", [verifier])).rows[0];
    if (!found) return undefined;
    // A fresh statement after the session lock sees consumption committed by a racing refresh.
    const session = (await client.query<Credential>('SELECT * FROM ride_match.sessions WHERE id=$1 FOR UPDATE', [found.session_id])).rows[0]!;
    const credential = (await client.query<{ expires_at: Date; consumed: boolean }>(
      'SELECT expires_at,consumed FROM ride_match.credentials WHERE verifier=$1', [verifier])).rows[0]!;
    return { ...session, ...credential };
  }

  /** Revokes a known family even with its old refresh token; unknown/repeated logout is 204. */
  async logout(refreshToken: string): Promise<void> {
    await transaction(this.database.pool, async (client) => {
      const row = await this.lockRefresh(client, refreshToken);
      if (row) await client.query('UPDATE ride_match.sessions SET revoked=true WHERE id=$1', [row.id]);
    });
  }

  /** Missing optional auth is anonymous; an explicitly invalid/expired bearer never falls back. */
  async authenticate(authorization: string | undefined, optional = false): Promise<string | null> {
    if (authorization === undefined && optional) return null;
    const match = authorization?.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/i);
    if (!match || !SessionTokenSchema.safeParse(match[1]).success) throw fail('UNAUTHENTICATED', 401, 'Authentication required.');
    const row = (await this.database.pool.query<Credential>(`SELECT s.*,c.expires_at,c.consumed FROM ride_match.credentials c
      JOIN ride_match.sessions s ON s.id=c.session_id WHERE c.verifier=$1 AND c.kind='access'`, [this.digest('access', match[1]!)] )).rows[0];
    const now = this.clock.now().getTime();
    if (!row || row.revoked || row.refresh_expires_at.getTime() <= now) throw fail('UNAUTHENTICATED', 401, 'Authentication required.');
    if (row.expires_at.getTime() <= now) throw fail('SESSION_EXPIRED', 401, 'Session expired.');
    return row.user_id;
  }

  /** No ride/group tables exist in BE-002; absent references are real nulls, not invented successes. */
  async currentUser(authorization: string | undefined): Promise<CurrentUserDto> {
    const id = await this.authenticate(authorization);
    return transaction(this.database.pool, async (client) => CurrentUserSchema.parse({
      user: await this.user(client, id!), rideRequestId: null, groupId: null,
    }));
  }
}
