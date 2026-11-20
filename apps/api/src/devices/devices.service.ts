import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { RegisterPushDeviceInput } from '@ride-match/contracts';
import { API_CONFIG } from '../config/environment.js';
import type { ApiConfig } from '../config/environment.js';
import { DatabaseService } from '../database/database.service.js';
import { transaction } from '../database/transaction.js';
import { AuthService } from '../auth/auth.service.js';
import { CLOCK } from '../auth/runtime.js';
import type { Clock } from '../auth/runtime.js';
import { encryptToken, tokenDigest } from './secrets.js';

/** Unique installation/token ownership and registering-session cleanup; serialized token takeover. */
@Injectable()
export class DevicesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(AuthService) private readonly auth: AuthService,
    @Inject(API_CONFIG) private readonly config: ApiConfig, @Inject(CLOCK) private readonly clock: Clock) {}
  register(authorization: string | undefined, id: string, input: RegisterPushDeviceInput) {
    return transaction(this.database.pool, async (client) => {
      const actor = (await this.auth.authenticateSession(authorization, false, client))!;
      await client.query('SELECT pg_advisory_xact_lock(724005)');
      const digest = tokenDigest(this.config.API_AUTH_SECRET, input.pushToken);
      await client.query('DELETE FROM ride_match.push_devices WHERE token_digest=$1 AND installation_id<>$2', [digest,id]);
      const now = this.clock.now();
      const stored=(await client.query<{registered_at:Date}>(`INSERT INTO ride_match.push_devices AS d VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (installation_id) DO UPDATE SET user_id=EXCLUDED.user_id,session_id=EXCLUDED.session_id,token_digest=EXCLUDED.token_digest,
        token_cipher=EXCLUDED.token_cipher,revision=CASE WHEN d.user_id=EXCLUDED.user_id AND d.session_id=EXCLUDED.session_id AND d.token_digest=EXCLUDED.token_digest AND d.platform=EXCLUDED.platform AND d.permission=EXCLUDED.permission THEN d.revision ELSE EXCLUDED.revision END,platform=EXCLUDED.platform,permission=EXCLUDED.permission,registered_at=EXCLUDED.registered_at RETURNING registered_at`,
      [id,actor.userId,actor.sessionId,digest,encryptToken(this.config.API_AUTH_SECRET,input.pushToken),randomUUID(),input.platform,input.permission,now])).rows[0]!;
      return { installationId: id, registeredAt: stored.registered_at.toISOString() };
    });
  }
  remove(authorization: string | undefined, id: string): Promise<void> {
    return transaction(this.database.pool, async (client) => {
      const actor = (await this.auth.authenticateSession(authorization, false, client))!;
      await client.query('DELETE FROM ride_match.push_devices WHERE installation_id=$1 AND session_id=$2 AND user_id=$3', [id,actor.sessionId,actor.userId]);
    });
  }
}
