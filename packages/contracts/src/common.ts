import { z } from 'zod';

/**
 * Opaque identifier of a server resource (ride request, group, user, message, …).
 *
 * Clients never parse or construct meaning from an ID; they only compare and echo it.
 * IDs appear in URL paths and event payloads, so they are limited to 1–64 URL-safe
 * characters (`A–Z`, `a–z`, `0–9`, `_`, `-`). UUIDs, ULIDs and prefixed IDs such as
 * `ride_01J…` all fit.
 */
export const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Expected URL-safe ID characters');
export type Id = z.infer<typeof IdSchema>;

/**
 * Instant in ISO-8601 UTC form, e.g. `2026-10-31T12:00:00.000Z`.
 *
 * The `Z` suffix is required: offsets and local times are rejected, so every timestamp
 * compares in one zone. Calendar dates are checked (no February 30). Fractional seconds
 * are optional. Values stay strings; convert with `Date.parse` where arithmetic is needed.
 * Server time is authoritative for expiry; a client may only derive countdowns from it.
 */
export const TimestampSchema = z.iso.datetime();
export type Timestamp = z.infer<typeof TimestampSchema>;

/**
 * Version of one resource, starting at 1 and increasing on every change to that resource.
 *
 * Versions are compared only within the same resource, never across resources or as a
 * clock. Clients use them to ignore stale snapshots and events, and coordinator commands
 * send the expected version so a stale command fails with `VERSION_CONFLICT`.
 */
export const ResourceVersionSchema = z.int().min(1);
export type ResourceVersion = z.infer<typeof ResourceVersionSchema>;

/**
 * Caller-generated identity of one user intent, used as the idempotency key of a mutation.
 *
 * The caller creates one UUID per intent and reuses it on every retry of that intent,
 * including after a timeout with an unknown outcome; a new UUID means a new intent.
 * The future HTTP adapter sends it as `Idempotency-Key`, and where a request body also
 * carries it the two values must agree. Receipts are scoped to the authenticated actor.
 */
export const OperationIdSchema = z.uuid();
export type OperationId = z.infer<typeof OperationIdSchema>;

/**
 * Opaque pagination position returned by the source and passed back unchanged.
 *
 * Limited to 1–512 RFC 3986 unreserved characters (`A–Z`, `a–z`, `0–9`, `-`, `.`, `_`, `~`)
 * so it can travel in a query string without encoding. Clients never build or edit cursors.
 */
export const CursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9._~-]+$/, 'Expected URL-safe cursor characters');
export type Cursor = z.infer<typeof CursorSchema>;

/**
 * Metadata attached to every successful response.
 *
 * `serverTime` is the source's clock when the response was produced. Clients use it to
 * estimate their clock offset for countdowns; they never extend validity with local time.
 */
export const ResponseMetaSchema = z.strictObject({
  serverTime: TimestampSchema,
});
export type ResponseMetaDto = z.infer<typeof ResponseMetaSchema>;

/**
 * Builds the success envelope `{ data, meta }` around one response data schema.
 *
 * Endpoint documentation describes only the unwrapped `data`; this envelope is the shared
 * transport shape around it. A `204` response has no body and uses no envelope.
 *
 * @param data Schema of the endpoint's unwrapped response data.
 * @returns A strict object schema that also rejects unknown top-level fields.
 */
export function apiResponseSchema<Data extends z.ZodType>(data: Data) {
  return z.strictObject({
    data,
    meta: ResponseMetaSchema,
  });
}
