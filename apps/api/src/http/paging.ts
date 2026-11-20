import { createHmac, timingSafeEqual } from 'node:crypto';
import { domainError } from '../rides/store.js';

/** Opaque signed positions bind pages to a namespace and owner/group, never granting access. */
export function pageCursor(secret: string, kind: 'chat' | 'blocks', scope: string, position: unknown): string {
  const body = Buffer.from(JSON.stringify({ kind, scope, position })).toString('base64url');
  const signature = createHmac('sha256', secret).update(`page:v1:${body}`).digest('base64url');
  return `${body}.${signature}`;
}

/** Authenticate before decoding; callers still authorize the resource and validate the position. */
export function readCursor<T>(secret: string, kind: 'chat' | 'blocks', scope: string, cursor: string, schema: { parse(value: unknown): T }): T {
  try {
    const parts = cursor.split('.');
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]!)) throw new Error();
    const expected = createHmac('sha256', secret).update(`page:v1:${parts[0]!}`).digest();
    const supplied = Buffer.from(parts[1]!, 'base64url');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error();
    const decoded: unknown = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error();
    const value = decoded as Record<string, unknown>;
    if (Object.keys(value).length !== 3 || value.kind !== kind || value.scope !== scope) throw new Error();
    return schema.parse(value.position);
  } catch { throw domainError('VALIDATION_FAILED', 422, 'Invalid page cursor.'); }
}

/** Strict flat query decoder rejects duplicate/unknown fields and numeric coercion surprises. */
export function flatPageQuery<T>(query: Record<string, unknown>, keys: readonly string[], numeric: readonly string[], schema: { safeParse(value: unknown): { success: boolean; data?: T } }): T {
  if (Object.entries(query).some(([key, value]) => !keys.includes(key) || typeof value !== 'string')) throw domainError('VALIDATION_FAILED', 422, 'Invalid page query.');
  const input: Record<string, unknown> = { ...query };
  for (const key of numeric) if (key in input) input[key] = /^\d+$/.test(input[key] as string) ? Number(input[key]) : NaN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw domainError('VALIDATION_FAILED', 422, 'Invalid page query.');
  return parsed.data!;
}
