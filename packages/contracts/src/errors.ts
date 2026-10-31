import { z } from 'zod';

import { IdSchema } from './common.js';

/**
 * Stable machine-readable error codes shared by every endpoint.
 *
 * Clients branch only on these codes, never on message text. This list is the table in
 * `docs/api/overview.md`, including the OTP verification failures from CONTRACT-001-C; a
 * later domain contract that owns more codes adds them here. Transport failures such
 * as timeouts, aborted requests or schema mismatches are not server errors and have no code
 * here; the mobile app models them separately.
 */
export const ApiErrorCodeSchema = z.enum([
  // 401
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'REFRESH_TOKEN_INVALID',
  // 403
  'FORBIDDEN',
  'MEMBERSHIP_REQUIRED',
  // 404
  'NOT_FOUND',
  'TARGET_UNAVAILABLE',
  // 409
  'ACTIVE_REQUEST_EXISTS',
  'ALREADY_IN_GROUP',
  'GROUP_FULL',
  'GROUP_CLOSED',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'USE_LEAVE_GROUP',
  'BLOCKED_RELATIONSHIP',
  // 410
  'RIDE_EXPIRED',
  'HISTORY_EXPIRED',
  'OTP_EXPIRED',
  // 422
  'VALIDATION_FAILED',
  'LOCATION_STALE',
  'INVALID_DEPARTURE',
  'INVALID_TRANSITION',
  'OTP_INVALID',
  // 429
  'RATE_LIMITED',
  'OTP_ATTEMPTS_EXCEEDED',
  'OTP_RESEND_THROTTLED',
  // 503
  'SERVICE_UNAVAILABLE',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** Why one submitted field was rejected. Clients map these codes to their own copy. */
export const FieldErrorCodeSchema = z.enum([
  'REQUIRED',
  'INVALID_FORMAT',
  'TOO_SHORT',
  'TOO_LONG',
  'OUT_OF_RANGE',
  'INVALID_VALUE',
]);
export type FieldErrorCode = z.infer<typeof FieldErrorCodeSchema>;

/**
 * One rejected field of a request.
 *
 * `field` is a dot path into the request body, such as `origin.latitude` or `members.0.userId`.
 * The object is strict and has no value field: an error must never echo what was submitted,
 * because the input may be an exact location, phone number or code.
 */
export const FieldErrorSchema = z.strictObject({
  field: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z][A-Za-z0-9]*(\.(?:[A-Za-z][A-Za-z0-9]*|\d+))*$/, 'Expected a dot path'),
  code: FieldErrorCodeSchema,
  message: z.string().min(1).max(200),
});
export type FieldErrorDto = z.infer<typeof FieldErrorSchema>;

/**
 * Body of every failed server response.
 *
 * - `code` is the only value clients branch on.
 * - `message` is safe to show or log; it never contains submitted values or private data.
 * - `requestId` identifies the request for diagnostics and carries no user data.
 * - `fieldErrors` lists rejected fields, when the failure is about specific fields.
 * - `retryAfterSeconds` is the server's minimum wait before retrying, when it gives one
 *   (rate limits, temporary unavailability). Absent means no server-specified delay.
 */
export const ApiErrorSchema = z.strictObject({
  code: ApiErrorCodeSchema,
  message: z.string().min(1).max(500),
  requestId: IdSchema,
  fieldErrors: z.array(FieldErrorSchema).min(1).max(50).optional(),
  retryAfterSeconds: z.int().min(1).max(86_400).optional(),
});
export type ApiErrorDto = z.infer<typeof ApiErrorSchema>;
