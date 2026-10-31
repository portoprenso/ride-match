import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CurrentUserSchema, UserSchema } from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic user; no real person.
const user = { id: 'user_1', displayName: 'Test Rider', avatarUrl: 'https://avatars.example.com/user_1.png' };
const currentUser = { user, rideRequestId: 'ride_1', groupId: null };

describe('UserSchema', () => {
  it('accepts a user with or without an avatar', () => {
    expect(UserSchema.parse(user)).toEqual(user);
    expect(accepts(UserSchema, { ...user, avatarUrl: null })).toBe(true);
  });

  it.each(['A', 'x'.repeat(40), 'Алия', 'Jean-Luc O’Neill', '🚕 Sam'])(
    'accepts the display name %s',
    (displayName) => {
      expect(accepts(UserSchema, { ...user, displayName })).toBe(true);
    },
  );

  it.each([
    ['empty', ''],
    ['over 40 characters', 'x'.repeat(41)],
    ['leading whitespace', ' Sam'],
    ['trailing whitespace', 'Sam '],
    ['only whitespace', '   '],
    ['a line break', 'Sam\nSmith'],
    ['a tab', 'Sam\tSmith'],
    ['a null character', 'Sam\u0000'],
  ])('rejects a display name with %s', (_label, displayName) => {
    expect(accepts(UserSchema, { ...user, displayName })).toBe(false);
  });

  it.each([
    ['http', 'http://avatars.example.com/user_1.png'],
    ['a data URL', 'data:image/png;base64,iVBORw0KGgo='],
    ['a javascript URL', 'javascript:alert(1)'],
    ['localhost', 'https://localhost/user_1.png'],
    ['an IP address', 'https://192.0.2.10/user_1.png'],
    ['user info', 'https://name:secret@avatars.example.com/user_1.png'],
    ['a relative path', '/avatars/user_1.png'],
    ['over 2,048 characters', `https://avatars.example.com/${'a'.repeat(2_048)}`],
  ])('rejects an avatar URL with %s', (_label, avatarUrl) => {
    expect(accepts(UserSchema, { ...user, avatarUrl })).toBe(false);
  });

  it('rejects an omitted avatar instead of null, and an invalid ID', () => {
    expect(accepts(UserSchema, { id: 'user_1', displayName: 'Test Rider' })).toBe(false);
    expect(accepts(UserSchema, { ...user, id: 'user 1' })).toBe(false);
  });

  it.each([
    ['a phone number', { phone: '+00000000000' }],
    ['a phone number under another name', { phoneNumber: '+00000000000' }],
    ['an access token', { accessToken: 'synthetic-token' }],
    ['a refresh token', { refreshToken: 'synthetic-token' }],
    ['session data', { session: { expiresAt: '2026-10-31T12:00:00Z' } }],
    ['a location', { location: { latitude: 43.24, longitude: 76.95 } }],
  ])('rejects a private field: %s', (_label, extra) => {
    expect(accepts(UserSchema, { ...user, ...extra })).toBe(false);
  });
});

describe('CurrentUserSchema', () => {
  it('accepts the user with present or absent references', () => {
    expect(CurrentUserSchema.parse(currentUser)).toEqual(currentUser);
    expect(accepts(CurrentUserSchema, { user, rideRequestId: null, groupId: null })).toBe(true);
    expect(accepts(CurrentUserSchema, { user, rideRequestId: 'ride_1', groupId: 'group_1' })).toBe(true);
  });

  it.each([
    ['omitted references instead of null', { user }],
    ['an invalid reference', { ...currentUser, groupId: 'group/1' }],
    ['an invalid user', { ...currentUser, user: { ...user, displayName: '' } }],
    ['a phone number', { ...currentUser, phone: '+00000000000' }],
    ['a phone number inside the user', { ...currentUser, user: { ...user, phone: '+00000000000' } }],
    ['credentials', { ...currentUser, accessToken: 'synthetic-token', refreshToken: 'synthetic-token' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(CurrentUserSchema, value)).toBe(false);
  });
});
