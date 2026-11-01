import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ChatMessageCreatedNotificationSchema,
  ExpoPushTokenSchema,
  GroupMemberJoinedNotificationSchema,
  GroupReadyNotificationSchema,
  InstallationIdSchema,
  MatchesAvailableNotificationSchema,
  NOTIFICATION_POLICY,
  NOTIFICATION_SCHEMA_VERSION,
  NotificationPayloadSchema,
  NotificationPermissionSchema,
  PushDeviceReceiptSchema,
  PushPlatformSchema,
  RegisterPushDeviceInputSchema,
} from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic rides, groups, messages, installations and tokens; no real device, person or trip.
const issuedAt = '2026-11-01T09:30:00Z';
const secondsAfterIssue = (seconds: number) => new Date(Date.parse(issuedAt) + seconds * 1000).toISOString();

let notificationCount = 0;
const notification = (kind: string, resources: object) => ({
  id: `ntf_${++notificationCount}`,
  schemaVersion: NOTIFICATION_SCHEMA_VERSION,
  kind,
  issuedAt,
  expiresAt: secondsAfterIssue(900),
  ...resources,
});

const matchesAvailable = notification('matches.available', { rideRequestId: 'ride_1', target: { kind: 'group', id: 'group_1' } });
const severalMatches = notification('matches.available', { rideRequestId: 'ride_1', target: null });
const memberJoined = notification('group.member_joined', { groupId: 'group_1' });
const groupReady = notification('group.ready', { groupId: 'group_1' });
const messageCreated = notification('chat.message_created', { groupId: 'group_1', messageId: 'msg_1' });

const installationId = '00000000-0000-4000-8000-0000000000a1';
const pushToken = 'ExponentPushToken[SYNTHETICtoken000000001]';
const registration = { pushToken, platform: 'ios', permission: 'granted' };
const receipt = { installationId, registeredAt: '2026-11-01T09:20:00Z' };

describe('NotificationPayloadSchema', () => {
  it.each([
    ['one new match', matchesAvailable],
    ['several new matches', severalMatches],
    ['a member who joined', memberJoined],
    ['a ready group', groupReady],
    ['a chat message', messageCreated],
  ])('accepts %s', (_label, value) => {
    expect(NotificationPayloadSchema.parse(value)).toEqual(value);
  });

  it('has exactly the four documented kinds', () => {
    expect(NotificationPayloadSchema.options.map((option) => option.shape.kind.value)).toEqual([
      'matches.available',
      'group.member_joined',
      'group.ready',
      'chat.message_created',
    ]);
  });

  it('matches each kind with its own schema', () => {
    expect(accepts(MatchesAvailableNotificationSchema, matchesAvailable)).toBe(true);
    expect(accepts(GroupMemberJoinedNotificationSchema, memberJoined)).toBe(true);
    expect(accepts(GroupReadyNotificationSchema, groupReady)).toBe(true);
    expect(accepts(ChatMessageCreatedNotificationSchema, messageCreated)).toBe(true);
    expect(accepts(GroupReadyNotificationSchema, memberJoined)).toBe(false);
  });

  it.each([
    ['an unknown kind', { ...groupReady, kind: 'group.updated' }],
    ['the realtime event type', { ...messageCreated, kind: 'chat.message.created' }],
    ['another schema version', { ...groupReady, schemaVersion: 2 }],
    ['a missing notification ID', { ...groupReady, id: undefined }],
    ['a notification ID with spaces', { ...groupReady, id: 'ntf 1' }],
    ['a missing expiry', { ...groupReady, expiresAt: undefined }],
    ['a time with an offset', { ...groupReady, issuedAt: '2026-11-01T15:30:00+06:00' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(NotificationPayloadSchema, value)).toBe(false);
  });
});

describe('notification lifetime', () => {
  it('accepts an expiry up to the longest lifetime', () => {
    expect(accepts(NotificationPayloadSchema, { ...groupReady, expiresAt: secondsAfterIssue(1) })).toBe(true);
    expect(
      accepts(NotificationPayloadSchema, { ...groupReady, expiresAt: secondsAfterIssue(NOTIFICATION_POLICY.maxLifetimeSeconds) }),
    ).toBe(true);
  });

  it.each([
    ['at issue', 0],
    ['before issue', -60],
    ['after the longest lifetime', NOTIFICATION_POLICY.maxLifetimeSeconds + 1],
  ])('rejects an expiry %s, on the expiry', (_label, seconds) => {
    for (const value of [matchesAvailable, memberJoined, groupReady, messageCreated]) {
      const result = NotificationPayloadSchema.safeParse({ ...value, expiresAt: secondsAfterIssue(seconds) });
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([['expiresAt']]);
    }
  });
});

describe('notification privacy', () => {
  it.each([
    ['message text', { ...messageCreated, text: 'I am at the fountain.' }],
    ['the sender', { ...messageCreated, senderId: 'user_rider_b' }],
    ['a title', { ...groupReady, title: 'Your group is ready' }],
    ['a body', { ...matchesAvailable, body: 'A person nearby is travelling in your direction.' }],
    ['a meeting point', { ...groupReady, meetingPoint: { coordinates: { latitude: 42.8746, longitude: 74.6122 }, label: 'Fountain' } }],
    ['coordinates', { ...matchesAvailable, coordinates: { latitude: 42.8762, longitude: 74.6041 } }],
    ['who joined', { ...memberJoined, user: { id: 'user_rider_c', displayName: 'Rider C', avatarUrl: null } }],
    ['the recipient', { ...memberJoined, userId: 'user_rider_a' }],
    ['a phone number', { ...groupReady, phoneNumber: '+15555550123' }],
    ['a push token', { ...groupReady, pushToken }],
    ['an access token', { ...groupReady, accessToken: 'synthetic-access-token-0001' }],
    ['the matches', { ...severalMatches, matches: [{ target: { kind: 'ride', id: 'ride_2' }, level: 'good' }] }],
    ['a match level', { ...matchesAvailable, level: 'excellent' }],
    ['a deep link', { ...groupReady, url: 'ridematch://groups/group_1' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(NotificationPayloadSchema, value)).toBe(false);
  });

  it.each([
    ['matches without the request', notification('matches.available', { target: null })],
    ['matches with an omitted target', notification('matches.available', { rideRequestId: 'ride_1' })],
    ['matches for a user target', notification('matches.available', { rideRequestId: 'ride_1', target: { kind: 'user', id: 'user_rider_b' } })],
    ['a join without the group', notification('group.member_joined', {})],
    ['a ready group named by a ride', notification('group.ready', { rideRequestId: 'ride_1' })],
    ['a ready group with a message', notification('group.ready', { groupId: 'group_1', messageId: 'msg_1' })],
    ['a chat message without the group', notification('chat.message_created', { messageId: 'msg_1' })],
    ['a chat message without its ID', notification('chat.message_created', { groupId: 'group_1' })],
  ])('rejects %s', (_label, value) => {
    expect(accepts(NotificationPayloadSchema, value)).toBe(false);
  });
});

describe('InstallationIdSchema', () => {
  it('accepts a UUID', () => {
    expect(InstallationIdSchema.parse(installationId)).toBe(installationId);
  });

  it.each([
    ['a resource ID', 'install_1'],
    ['a hardware-style serial', 'SYNTHETIC-SERIAL-0001'],
    ['an empty value', ''],
  ])('rejects %s', (_label, value) => {
    expect(accepts(InstallationIdSchema, value)).toBe(false);
  });
});

describe('ExpoPushTokenSchema', () => {
  it.each([
    ['the Exponent form', pushToken],
    ['the Expo form', 'ExpoPushToken[SYNTHETIC-token_000000002]'],
  ])('accepts %s', (_label, value) => {
    expect(ExpoPushTokenSchema.parse(value)).toBe(value);
  });

  it.each([
    ['the inner value alone', 'SYNTHETICtoken000000001'],
    ['the legacy UUID form', '00000000-0000-4000-8000-000000000001'],
    ['empty brackets', 'ExponentPushToken[]'],
    ['another prefix', 'FcmPushToken[SYNTHETICtoken000000001]'],
    ['spaces inside', 'ExponentPushToken[SYNTHETIC token]'],
    ['a missing closing bracket', 'ExponentPushToken[SYNTHETICtoken000000001'],
    ['trailing text', `${pushToken} `],
    ['more than 256 characters', `ExponentPushToken[${'a'.repeat(238)}]`],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ExpoPushTokenSchema, value)).toBe(false);
  });

  it('accepts exactly 256 characters', () => {
    expect(accepts(ExpoPushTokenSchema, `ExponentPushToken[${'a'.repeat(237)}]`)).toBe(true);
  });
});

describe('PushPlatformSchema and NotificationPermissionSchema', () => {
  it('accept the two platforms and three permission states', () => {
    expect(PushPlatformSchema.options).toEqual(['ios', 'android']);
    expect(NotificationPermissionSchema.options).toEqual(['granted', 'denied', 'undetermined']);
  });

  it('reject other values', () => {
    expect(accepts(PushPlatformSchema, 'web')).toBe(false);
    expect(accepts(NotificationPermissionSchema, 'blocked')).toBe(false);
  });
});

describe('RegisterPushDeviceInputSchema', () => {
  it.each(['granted', 'denied', 'undetermined'])('accepts the permission %s', (permission) => {
    const value = { ...registration, permission };
    expect(RegisterPushDeviceInputSchema.parse(value)).toEqual(value);
  });

  it('accepts an Android installation', () => {
    expect(accepts(RegisterPushDeviceInputSchema, { ...registration, platform: 'android' })).toBe(true);
  });

  it.each([
    ['a missing token', { platform: 'ios', permission: 'granted' }],
    ['a null token', { ...registration, pushToken: null }],
    ['a malformed token', { ...registration, pushToken: 'SYNTHETICtoken000000001' }],
    ['a missing permission', { pushToken, platform: 'ios' }],
    ['the installation in the body', { ...registration, installationId }],
    ['a caller-chosen user', { ...registration, userId: 'user_rider_a' }],
    ['a device model', { ...registration, deviceModel: 'Synthetic Phone' }],
    ['a phone number', { ...registration, phoneNumber: '+15555550123' }],
    ['a location', { ...registration, coordinates: { latitude: 42.8762, longitude: 74.6041 } }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(RegisterPushDeviceInputSchema, value)).toBe(false);
  });
});

describe('PushDeviceReceiptSchema', () => {
  it('accepts the installation and the registration time', () => {
    expect(PushDeviceReceiptSchema.parse(receipt)).toEqual(receipt);
  });

  it.each([
    ['the echoed token', { ...receipt, pushToken }],
    ['the user', { ...receipt, userId: 'user_rider_a' }],
    ['a delivery status', { ...receipt, delivery: 'inert' }],
    ['the permission', { ...receipt, permission: 'granted' }],
    ['a missing registration time', { installationId }],
    ['a non-UUID installation', { ...receipt, installationId: 'install_1' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(PushDeviceReceiptSchema, value)).toBe(false);
  });
});

describe('registration and group notification walkthrough', () => {
  it('registers before and after permission, rotates the token and turns off, never echoing the token', () => {
    const rotated = { ...registration, pushToken: 'ExponentPushToken[SYNTHETICtoken000000002]' };
    for (const step of [{ ...registration, permission: 'undetermined' }, registration, rotated, { ...rotated, permission: 'denied' }]) {
      expect(accepts(RegisterPushDeviceInputSchema, step)).toBe(true);
    }
    expect(accepts(PushDeviceReceiptSchema, { ...receipt, registeredAt: '2026-11-01T09:25:00Z' })).toBe(true);
    expect(accepts(PushDeviceReceiptSchema, { ...receipt, pushToken: rotated.pushToken })).toBe(false);
  });

  it('carries only IDs and times from match to chat', () => {
    // Rider A's request matches Rider B's ride, they form group_1, Rider C joins, the
    // coordinator confirms the meeting point and Rider B writes. Each step notifies the
    // recipients its kind documents, with its own notification ID.
    const delivered = [
      notification('matches.available', { rideRequestId: 'ride_1', target: { kind: 'ride', id: 'ride_2' } }),
      notification('group.member_joined', { groupId: 'group_1' }),
      notification('group.ready', { groupId: 'group_1' }),
      notification('chat.message_created', { groupId: 'group_1', messageId: 'msg_1' }),
    ].map((value) => NotificationPayloadSchema.parse(value));

    expect(new Set(delivered.map((value) => value.id)).size).toBe(delivered.length);
    for (const value of delivered) {
      const serialized = JSON.stringify(value);
      for (const privateText of ['fountain', 'Rider', 'latitude', '+1555', 'PushToken']) {
        expect(serialized).not.toContain(privateText);
      }
    }
  });
});
