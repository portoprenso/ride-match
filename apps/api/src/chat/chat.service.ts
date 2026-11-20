import { createHmac, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ChatMessageSchema, ChatMessagePageSchema } from '@ride-match/contracts';
import type { ChatHistoryQueryInput, SendChatMessageInput, ChatMessageDto } from '@ride-match/contracts';
import { API_CONFIG } from '../config/environment.js';
import type { ApiConfig } from '../config/environment.js';
import { RideDomain } from '../rides/domain.js';
import { domainError, live } from '../rides/store.js';
import type { RideStore } from '../rides/store.js';
import { pageCursor, readCursor } from '../http/paging.js';

type MessageRow = { id: string; group_id: string; sequence: number; sender: ChatMessageDto['sender']; text: string; created_at: Date; client_message_id: string };
const project = (row: MessageRow) => ChatMessageSchema.parse({ id: row.id, groupId: row.group_id, sequence: row.sequence,
  sender: row.sender, text: row.text, createdAt: row.created_at.toISOString(), clientMessageId: row.client_message_id });
const messages = `SELECT m.*,i.client_message_id FROM ride_match.chat_messages m JOIN ride_match.chat_intents i ON i.message_id=m.id`;

/** Persisted member-only text. No message body enters generic receipts, outbox or logs. */
@Injectable()
export class ChatService {
  constructor(@Inject(RideDomain) private readonly domain: RideDomain, @Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async history(actor: string, id: string, input: ChatHistoryQueryInput) {
    return this.domain.run(async (store, now) => {
      await store.readable(id, actor, now);
      const before = input.beforeCursor === undefined ? null : readCursor(this.config.API_AUTH_SECRET, 'chat', id, input.beforeCursor, z.int().min(1));
      const latest = (await store.client.query<{ latest_sequence: number }>('SELECT latest_sequence FROM ride_match.chat_counters WHERE group_id=$1', [id])).rows[0]?.latest_sequence ?? 0;
      const catchup = input.afterSequence !== undefined;
      const rows = (await store.client.query<MessageRow>(`${messages} WHERE m.group_id=$1 AND m.sequence ${catchup ? '>' : '<'} $2
        ORDER BY m.sequence ${catchup ? 'ASC' : 'DESC'} LIMIT $3`, [id, catchup ? input.afterSequence : before ?? latest + 1, input.limit])).rows;
      if (!catchup) rows.reverse();
      return ChatMessagePageSchema.parse({ messages: rows.map(project), latestSequence: latest,
        olderCursor: rows[0] && rows[0].sequence > 1 ? pageCursor(this.config.API_AUTH_SECRET, 'chat', id, rows[0].sequence) : null });
    });
  }

  /**
   * Sender/group intent identity survives restart and body purge. Authorization precedes
   * lookup/conflict disclosure; retry requires the original membership epoch. Counter,
   * message, intent and reference-only event commit together, so rollback consumes no number.
   */
  async send(actor: string, id: string, input: SendChatMessageInput) {
    return this.domain.run(async (store, now) => {
      const { group, member } = await store.readable(id, actor, now);
      const fingerprint = createHmac('sha256', this.config.API_AUTH_SECRET).update(`chat:v1:${input.text}`).digest('hex');
      const previous = (await store.client.query<{ message_id: string; membership_id: string; fingerprint: string }>(
        'SELECT * FROM ride_match.chat_intents WHERE group_id=$1 AND sender_id=$2 AND client_message_id=$3', [id, actor, input.clientMessageId])).rows[0];
      if (previous) {
        await store.readable(id, actor, now, previous.membership_id);
        if (previous.fingerprint !== fingerprint) throw domainError('IDEMPOTENCY_CONFLICT', 409, 'Message key was already used.');
        return this.message(store, previous.message_id);
      }
      if (!live(group)) throw domainError('GROUP_CLOSED', 409, 'Group is closed.');
      await store.client.query('INSERT INTO ride_match.chat_counters VALUES ($1,0) ON CONFLICT DO NOTHING', [id]);
      const sequence = (await store.client.query<{ latest_sequence: number }>(
        'UPDATE ride_match.chat_counters SET latest_sequence=latest_sequence+1 WHERE group_id=$1 RETURNING latest_sequence', [id])).rows[0]!.latest_sequence;
      const messageId = randomUUID();
      await store.client.query('INSERT INTO ride_match.chat_intents VALUES ($1,$2,$3,$4,$5,$6)', [id, actor, input.clientMessageId, messageId, member.id, fingerprint]);
      await store.client.query('INSERT INTO ride_match.chat_messages VALUES ($1,$2,$3,$4,$5,$6)', [messageId, id, sequence, JSON.stringify(await store.user(actor)), input.text, now]);
      await store.intent('chat.message.created', messageId, sequence, now);
      return this.message(store, messageId);
    });
  }
  private async message(store: RideStore, id: string) {
    const row = (await store.client.query<MessageRow>(`${messages} WHERE m.id=$1`, [id])).rows[0];
    if (!row) throw domainError('HISTORY_EXPIRED', 410, 'Group history expired.');
    return project(row);
  }
}
