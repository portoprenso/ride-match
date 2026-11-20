import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BlockUserResultSchema, BlockListPageSchema, ReportReceiptSchema, TimestampSchema, IdSchema } from '@ride-match/contracts';
import type { BlockUserInput, BlockListQueryInput, ReportUserInput } from '@ride-match/contracts';
import { API_CONFIG } from '../config/environment.js';
import type { ApiConfig } from '../config/environment.js';
import { RideDomain } from '../rides/domain.js';
import { domainError } from '../rides/store.js';
import type { RideStore } from '../rides/store.js';
import { mutation } from '../rides/receipts.js';
import { leaveLiveGroup } from '../rides/leave.js';
import { pageCursor, readCursor } from '../http/paging.js';

const blockPosition = z.strictObject({ at: TimestampSchema, id: IdSchema });

/** Actor-owned safety records. No block reason, report text or private group snapshot is emitted. */
@Injectable()
export class SafetyService {
  constructor(@Inject(RideDomain) private readonly domain: RideDomain, @Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async block(actor: string, target: string, input: BlockUserInput) {
    return this.domain.run((store, now) => mutation({ store, now, actor, operationId: input.operationId, operation: 'safety.block', target, input,
      secret: this.config.API_AUTH_SECRET, schema: BlockUserResultSchema, perform: async () => {
        await this.target(store, actor, target);
        const previous = (await store.client.query<{ blocked_at: Date }>('SELECT blocked_at FROM ride_match.user_blocks WHERE actor_id=$1 AND target_id=$2', [actor, target])).rows[0];
        if (previous) return { result: { blockedUser: { user: await store.user(target), blockedAt: previous.blocked_at.toISOString() }, leftGroup: null } };
        await store.client.query('INSERT INTO ride_match.user_blocks VALUES ($1,$2,$3)', [actor, target, now]);
        const shared = (await store.client.query<{ group_id: string }>(`SELECT a.group_id FROM ride_match.group_memberships a
          JOIN ride_match.group_memberships b ON b.group_id=a.group_id AND b.live AND b.user_id=$2 WHERE a.live AND a.user_id=$1`, [actor, target])).rows[0];
        const leftGroup = shared ? await leaveLiveGroup(store, actor, shared.group_id, now) : null;
        await store.intent('blocks.changed', actor, 1, now);
        return { result: { blockedUser: { user: await store.user(target), blockedAt: now.toISOString() }, leftGroup } };
      } }));
  }
  /** Naturally idempotent; removing a filter never restores a former membership epoch. */
  async unblock(actor: string, target: string): Promise<void> {
    return this.domain.run(async (store, now) => {
      const removed = await store.client.query('DELETE FROM ride_match.user_blocks WHERE actor_id=$1 AND target_id::text=$2', [actor, target]);
      if (removed.rowCount) await store.intent('blocks.changed', actor, 1, now);
    });
  }
  async list(actor: string, input: BlockListQueryInput) {
    return this.domain.run(async (store) => {
      const position = input.cursor ? readCursor(this.config.API_AUTH_SECRET, 'blocks', actor, input.cursor, blockPosition) : null;
      const rows = (await store.client.query<{ target_id: string; blocked_at: Date }>(`SELECT target_id,blocked_at FROM ride_match.user_blocks
        WHERE actor_id=$1 AND ($2::timestamptz IS NULL OR (blocked_at,target_id) < ($2::timestamptz,$3::uuid))
        ORDER BY blocked_at DESC,target_id DESC LIMIT $4`, [actor, position?.at ?? null, position?.id ?? null, input.limit + 1])).rows;
      const page = rows.slice(0, input.limit);
      const blockedUsers = [];
      for (const row of page) blockedUsers.push({ user: await store.user(row.target_id), blockedAt: row.blocked_at.toISOString() });
      const last = page.at(-1);
      return BlockListPageSchema.parse({ blockedUsers, nextCursor: rows.length > input.limit && last ?
        pageCursor(this.config.API_AUTH_SECRET, 'blocks', actor, { at: last.blocked_at.toISOString(), id: last.target_id }) : null });
    });
  }

  /**
   * Validates context only on first acceptance. Retry returns a content-free receipt even
   * after leave/purge; details/reason/context never enter receipts or reference-only outbox.
   * Local report bodies expire after seven days, independent of the 24 h receipt snapshot.
   */
  async report(actor: string, input: ReportUserInput) {
    return this.domain.run((store, now) => mutation({ store, now, actor, operationId: input.operationId, operation: 'safety.report', target: input.targetUserId, input,
      secret: this.config.API_AUTH_SECRET, schema: ReportReceiptSchema, perform: async () => {
        await this.target(store, actor, input.targetUserId);
        if (input.context) {
          await store.readable(input.context.groupId, actor, now);
          const belonged = await store.client.query('SELECT 1 FROM ride_match.group_memberships WHERE group_id=$1 AND user_id=$2', [input.context.groupId, input.targetUserId]);
          if (!belonged.rowCount) throw domainError('VALIDATION_FAILED', 422, 'Invalid report context.');
          if (input.context.messageId) {
            const message = await store.client.query(`SELECT 1 FROM ride_match.chat_messages m JOIN ride_match.chat_intents i ON i.message_id=m.id
              WHERE m.id=$1 AND m.group_id=$2 AND i.sender_id=$3`, [input.context.messageId, input.context.groupId, input.targetUserId]);
            if (!message.rowCount) throw domainError('VALIDATION_FAILED', 422, 'Invalid report context.');
          }
        }
        const id = randomUUID();
        await store.client.query('INSERT INTO ride_match.user_reports VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [id, actor, input.targetUserId, input.reason, input.details ?? null, input.context?.groupId ?? null, input.context?.messageId ?? null, now, new Date(now.getTime() + 7 * 86400000)]);
        await store.intent('report.received', id, 1, now);
        return { result: { id, receivedAt: now.toISOString() } };
      } }));
  }
  private async target(store: RideStore, actor: string, target: string): Promise<void> {
    if (actor === target) throw domainError('VALIDATION_FAILED', 422, 'Choose another rider.');
    if (!(await store.client.query('SELECT 1 FROM ride_match.users WHERE id::text=$1', [target])).rowCount) throw domainError('NOT_FOUND', 404, 'Rider unavailable.');
  }
}
