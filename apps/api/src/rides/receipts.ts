import { createHmac } from 'node:crypto';
import type { RideStore } from './store.js';
import { domainError } from './store.js';

type Receipt = { fingerprint: string; result: unknown; access_membership_id: string | null; replay_until: Date };

/** Stable validated-input encoding. Sensitive inputs only enter a keyed digest, never the journal fingerprint as text. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}

/**
 * Actor/key identity serializes within RideDomain. Group-bearing replays require
 * the original membership epoch still readable; leaving/rejoining or retention
 * cannot resurrect a private snapshot. Leave replays contain owner-only data.
 * At 24 h snapshots are cleared and keys retired, never silently re-executed.
 */
export async function mutation<T>(options: {
  store: RideStore; now: Date; actor: string; operationId: string; operation: string; target: string;
  input: unknown; secret: string; schema: { parse(value: unknown): T };
  perform: () => Promise<{ result: T; accessMembershipId?: string }>;
}): Promise<T> {
  const { store, now, actor, operationId } = options;
  const fingerprint = createHmac('sha256', options.secret).update(canonical({ operation: options.operation, target: options.target, input: options.input })).digest('hex');
  const previous = (await store.client.query<Receipt>('SELECT * FROM ride_match.operation_receipts WHERE actor_id=$1 AND operation_id=$2', [actor, operationId])).rows[0];
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw domainError('IDEMPOTENCY_CONFLICT', 409, 'Operation key was already used.');
    if (previous.access_membership_id) {
      const member = (await store.client.query<{ group_id: string }>('SELECT group_id FROM ride_match.group_memberships WHERE id=$1', [previous.access_membership_id])).rows[0]!;
      await store.readable(member.group_id, actor, now, previous.access_membership_id);
    }
    if (previous.replay_until <= now || previous.result === null) throw domainError('VALIDATION_FAILED', 422, 'Operation receipt expired; reconcile current state.');
    return options.schema.parse(previous.result);
  }
  const performed = await options.perform();
  const result = options.schema.parse(performed.result);
  await store.client.query(`INSERT INTO ride_match.operation_receipts (actor_id,operation_id,fingerprint,result,access_membership_id,replay_until)
    VALUES ($1,$2,$3,$4,$5,$6)`, [actor, operationId, fingerprint, JSON.stringify(result), performed.accessMembershipId ?? null, new Date(now.getTime() + 86400000)]);
  return result;
}
