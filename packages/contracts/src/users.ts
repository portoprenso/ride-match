import { z } from 'zod';

import { IdSchema, singleLineTextSchema } from './common.js';

/** Name a user shows to others: 1–40 characters on one line, with no surrounding whitespace. */
export const DisplayNameSchema = singleLineTextSchema(40);
export type DisplayName = z.infer<typeof DisplayNameSchema>;

/**
 * Address of a user's avatar image: an `https` URL on a domain name, at most 2,048
 * characters. Other schemes (`http`, `data`, `javascript`), IP addresses, `localhost` and
 * embedded user info (`user:password@`) fail.
 */
export const AvatarUrlSchema = z
  .url({ protocol: /^https$/, hostname: z.regexes.domain })
  .max(2048)
  .regex(/^https:\/\/[^/?#@]+(?:[/?#]|$)/, 'Expected no user info');
export type AvatarUrl = z.infer<typeof AvatarUrlSchema>;

/**
 * Public summary of a user: the only user shape other people see, for example in ride
 * previews, group member lists, chat senders and block lists.
 *
 * `avatarUrl` is `null` when the user has none. Phone numbers, credentials, session data and
 * locations never belong here; the strict schema rejects such fields.
 */
export const UserSchema = z.strictObject({
  id: IdSchema,
  displayName: DisplayNameSchema,
  avatarUrl: AvatarUrlSchema.nullable(),
});
export type UserDto = z.infer<typeof UserSchema>;

/**
 * The signed-in user's own view (`GET /me`), private to that user.
 *
 * - `user` is the same public summary that others see.
 * - `rideRequestId` is the user's current or latest own ride request, the one
 *   `GET /me/ride-request` returns, or `null`.
 * - `groupId` is the live group the user belongs to, or `null`.
 *
 * The references let the app restore navigation, for example after a restart; it reads each
 * resource for details. Even this private view has no phone number or credentials: those
 * stay at the authentication boundary.
 */
export const CurrentUserSchema = z.strictObject({
  user: UserSchema,
  rideRequestId: IdSchema.nullable(),
  groupId: IdSchema.nullable(),
});
export type CurrentUserDto = z.infer<typeof CurrentUserSchema>;
