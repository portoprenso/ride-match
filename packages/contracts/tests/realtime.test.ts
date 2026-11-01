import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  AccessRevokedEventSchema,
  ChatMessageCreatedEventSchema,
  DomainEventSchema,
  EVENT_SCHEMA_VERSION,
  EventAudienceSchema,
  GroupChangedEventSchema,
  GroupEventSchema,
  MatchesChangedEventSchema,
  NearbyRemovedEventSchema,
  NearbyUpsertedEventSchema,
  PublicEventSchema,
  RideChangedEventSchema,
  SubscriptionAckSchema,
  SubscriptionRequestSchema,
  UnsubscribeInputSchema,
  UserEventSchema,
} from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic riders, rides, group and messages in the demo city; no real person or trip.
const user = (letter: string) => ({ id: `user_rider_${letter}`, displayName: `Rider ${letter.toUpperCase()}`, avatarUrl: null });
const publicOrigin = { center: { latitude: 42.88, longitude: 74.6 }, radiusMeters: 400, label: 'City centre' };
const destination = {
  id: 'place_asia_mall',
  label: 'Asia Mall',
  detail: 'Chyngyz Aitmatov Avenue',
  coordinates: { latitude: 42.8556, longitude: 74.5859 },
};
const rideItem = {
  kind: 'ride',
  id: 'ride_1',
  user: user('a'),
  publicOrigin,
  destination,
  departureAt: '2026-11-01T09:35:00Z',
  expiresAt: '2026-11-01T09:45:00Z',
  version: 1,
};
const groupItem = {
  kind: 'group',
  id: 'group_1',
  status: 'forming',
  memberCount: 2,
  capacity: 4,
  publicOrigin,
  destination,
  departureAt: '2026-11-01T09:35:00Z',
  expiresAt: '2026-11-01T10:01:00Z',
  version: 1,
};
const message = {
  id: 'msg_1',
  groupId: 'group_1',
  sender: user('b'),
  text: 'I am at the fountain.',
  createdAt: '2026-11-01T09:33:00Z',
  sequence: 1,
  clientMessageId: '00000000-0000-4000-8000-000000000001',
};
const publicAudience = { kind: 'public' };
const audienceOf = (letter: string) => ({ kind: 'user', userId: `user_rider_${letter}` });
const groupAudience = (groupId = 'group_1') => ({ kind: 'group', groupId });

let eventCount = 0;
const event = (type: string, audience: object, payload: object) => ({
  id: `evt_${++eventCount}`,
  schemaVersion: EVENT_SCHEMA_VERSION,
  occurredAt: '2026-11-01T09:32:00Z',
  type,
  audience,
  payload,
});

const upserted = event('nearby.upserted', publicAudience, { item: rideItem });
const removal = { target: { kind: 'ride', id: 'ride_1' }, version: 2, reason: 'unavailable' };
const removed = event('nearby.removed', publicAudience, removal);
const rideChanged = event('ride.changed', audienceOf('a'), { rideRequestId: 'ride_1', version: 2, status: 'grouped' });
const matchesChanged = event('matches.changed', audienceOf('a'), { rideRequestId: 'ride_1', version: 4 });
const groupChanged = event('group.changed', groupAudience(), { groupId: 'group_1', version: 2, reason: 'member_joined' });
const messageCreated = event('chat.message.created', groupAudience(), { message });
const revoked = event('access.revoked', audienceOf('b'), { groupId: 'group_1', version: 5, reason: 'left' });

describe('EventAudienceSchema', () => {
  it.each([
    ['the public', publicAudience],
    ['one user', audienceOf('a')],
    ['a group’s members', groupAudience()],
  ])('accepts %s', (_label, value) => {
    expect(EventAudienceSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['a public audience naming a user', { kind: 'public', userId: 'user_rider_a' }],
    ['a user audience without the user', { kind: 'user' }],
    ['a group audience without the group', { kind: 'group' }],
    ['a server room name', { kind: 'room', room: 'group:group_1' }],
    ['several users', { kind: 'user', userIds: ['user_rider_a', 'user_rider_b'] }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(EventAudienceSchema, value)).toBe(false);
  });
});

describe('DomainEventSchema', () => {
  it.each([
    ['a nearby ride upsert', upserted],
    ['a nearby group upsert', event('nearby.upserted', publicAudience, { item: groupItem })],
    ['a nearby removal', removed],
    ['an expiry removal', event('nearby.removed', publicAudience, { ...removal, reason: 'expired' })],
    ['a ride change', rideChanged],
    ['a match-set change', matchesChanged],
    ['a group change', groupChanged],
    ['a chat message', messageCreated],
    ['an access revocation', revoked],
  ])('accepts %s', (_label, value) => {
    expect(DomainEventSchema.parse(value)).toEqual(value);
  });

  it('has exactly the seven documented event types', () => {
    expect(DomainEventSchema.options.map((option) => option.shape.type.value)).toEqual([
      'nearby.upserted',
      'nearby.removed',
      'ride.changed',
      'matches.changed',
      'group.changed',
      'chat.message.created',
      'access.revoked',
    ]);
  });

  it.each([
    ['an unknown type', { ...groupChanged, type: 'group.updated' }],
    ['another schema version', { ...groupChanged, schemaVersion: 2 }],
    ['a missing event ID', { ...groupChanged, id: undefined }],
    ['a time with an offset', { ...groupChanged, occurredAt: '2026-11-01T15:32:00+06:00' }],
    ['a server room name', { ...groupChanged, room: 'group:group_1' }],
    ['a missing audience', { ...groupChanged, audience: undefined }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(DomainEventSchema, value)).toBe(false);
  });
});

describe('public events', () => {
  it.each([
    ['an exact origin on a ride', event('nearby.upserted', publicAudience, { item: { ...rideItem, origin: { coordinates: { latitude: 42.8762, longitude: 74.6041 }, source: 'device' } } })],
    ['a status on a ride', event('nearby.upserted', publicAudience, { item: { ...rideItem, status: 'active' } })],
    ['the group of a ride', event('nearby.upserted', publicAudience, { item: { ...rideItem, groupId: 'group_1' } })],
    ['members on a group', event('nearby.upserted', publicAudience, { item: { ...groupItem, members: [] } })],
    ['a meeting point on a group', event('nearby.upserted', publicAudience, { item: { ...groupItem, meetingPoint: null } })],
    ['a closed group', event('nearby.upserted', publicAudience, { item: { ...groupItem, status: 'cancelled' } })],
    ['a match preview', event('nearby.upserted', publicAudience, { item: rideItem, preview: { level: 'good' } })],
    ['an upsert for one user', event('nearby.upserted', audienceOf('a'), { item: rideItem })],
    ['an upsert for a group', event('nearby.upserted', groupAudience(), { item: rideItem })],
    ['a removal that reveals a join', event('nearby.removed', publicAudience, { ...removal, reason: 'grouped' })],
    ['a removal that reveals a block', event('nearby.removed', publicAudience, { ...removal, reason: 'blocked' })],
    ['a removal without a version', event('nearby.removed', publicAudience, { target: removal.target, reason: 'expired' })],
    ['a removal of a user', event('nearby.removed', publicAudience, { ...removal, target: { kind: 'user', id: 'user_rider_a' } })],
  ])('reject %s', (_label, value) => {
    expect(accepts(DomainEventSchema, value)).toBe(false);
  });

  it('keep private events off a nearby subscription', () => {
    for (const value of [upserted, removed]) expect(accepts(PublicEventSchema, value)).toBe(true);
    for (const value of [rideChanged, matchesChanged, groupChanged, messageCreated, revoked]) {
      expect(accepts(PublicEventSchema, value)).toBe(false);
    }
  });
});

describe('user events', () => {
  it.each([
    ['a ride change for the public', event('ride.changed', publicAudience, rideChanged.payload)],
    ['a ride change for a group', event('ride.changed', groupAudience(), rideChanged.payload)],
    ['a ride change with the exact origin', event('ride.changed', audienceOf('a'), { ...rideChanged.payload, origin: { coordinates: { latitude: 42.8762, longitude: 74.6041 }, source: 'device' } })],
    ['a ride change with an unknown status', event('ride.changed', audienceOf('a'), { ...rideChanged.payload, status: 'departed' })],
    ['a match change for the public', event('matches.changed', publicAudience, matchesChanged.payload)],
    ['a match change carrying the matches', event('matches.changed', audienceOf('a'), { ...matchesChanged.payload, matches: [] })],
    ['a revocation for the group', event('access.revoked', groupAudience(), revoked.payload)],
    ['a revocation that reveals a block', event('access.revoked', audienceOf('b'), { ...revoked.payload, reason: 'blocked' })],
    ['a revocation without a version', event('access.revoked', audienceOf('b'), { groupId: 'group_1', reason: 'left' })],
  ])('reject %s', (_label, value) => {
    expect(accepts(DomainEventSchema, value)).toBe(false);
  });

  it('arrive only on a user subscription', () => {
    for (const value of [rideChanged, matchesChanged, revoked]) expect(accepts(UserEventSchema, value)).toBe(true);
    for (const value of [upserted, removed, groupChanged, messageCreated]) expect(accepts(UserEventSchema, value)).toBe(false);
  });
});

describe('group events', () => {
  it.each(['member_joined', 'member_left', 'ready', 'reopened', 'meeting_point_changed', 'completed', 'cancelled'])(
    'accept the change reason %s',
    (reason) => {
      expect(accepts(GroupChangedEventSchema, { ...groupChanged, payload: { ...groupChanged.payload, reason } })).toBe(true);
    },
  );

  it.each([
    ['a change for another group', { ...groupChanged, audience: groupAudience('group_2') }],
    ['a change for the public', { ...groupChanged, audience: publicAudience }],
    ['a change for one user', { ...groupChanged, audience: audienceOf('a') }],
    ['a change that reveals a block', { ...groupChanged, payload: { ...groupChanged.payload, reason: 'member_blocked' } }],
    ['a change carrying the members', { ...groupChanged, payload: { ...groupChanged.payload, members: [] } }],
    ['a change carrying the meeting point', { ...groupChanged, payload: { ...groupChanged.payload, meetingPoint: null } }],
    ['a message for another group', { ...messageCreated, audience: groupAudience('group_2') }],
    ['a message for the public', { ...messageCreated, audience: publicAudience }],
    ['a message without its sequence', { ...messageCreated, payload: { message: { ...message, sequence: undefined } } }],
    ['a message with a delivery status', { ...messageCreated, payload: { message, status: 'delivered' } }],
  ])('reject %s', (_label, value) => {
    expect(accepts(DomainEventSchema, value)).toBe(false);
  });

  it('report a mismatched audience on its own path', () => {
    const result = GroupChangedEventSchema.safeParse({ ...groupChanged, audience: groupAudience('group_2') });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['audience.groupId']);
    expect(ChatMessageCreatedEventSchema.safeParse({ ...messageCreated, audience: groupAudience('group_2') }).error?.issues[0]?.path).toEqual([
      'audience',
      'groupId',
    ]);
  });

  it('arrive only on a group subscription', () => {
    for (const value of [groupChanged, messageCreated]) expect(accepts(GroupEventSchema, value)).toBe(true);
    for (const value of [upserted, removed, rideChanged, matchesChanged, revoked]) expect(accepts(GroupEventSchema, value)).toBe(false);
  });
});

describe('SubscriptionRequestSchema', () => {
  const viewport = { southWest: { latitude: 42.85, longitude: 74.55 }, northEast: { latitude: 42.9, longitude: 74.65 } };

  it.each([
    ['a nearby area', { kind: 'nearby', viewport }],
    ['the user’s own events', { kind: 'user' }],
    ['a group', { kind: 'group', groupId: 'group_1' }],
  ])('accepts %s', (_label, value) => {
    expect(SubscriptionRequestSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['a user chosen by the caller', { kind: 'user', userId: 'user_rider_b' }],
    ['a server room name', { kind: 'room', room: 'group:group_1' }],
    ['a group without its ID', { kind: 'group' }],
    ['an exact viewport corner', { kind: 'nearby', viewport: { ...viewport, southWest: { latitude: 42.8762, longitude: 74.55 } } }],
    ['a viewport wider than allowed', { kind: 'nearby', viewport: { ...viewport, northEast: { latitude: 43.5, longitude: 74.65 } } }],
    ['a nearby area with a destination', { kind: 'nearby', viewport, destinationPlaceId: 'place_asia_mall' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(SubscriptionRequestSchema, value)).toBe(false);
  });
});

describe('SubscriptionAckSchema and UnsubscribeInputSchema', () => {
  const ack = { subscriptionId: 'sub_1', subscription: { kind: 'group', groupId: 'group_1' } };

  it('accepts the accepted scope with its subscription ID', () => {
    expect(SubscriptionAckSchema.parse(ack)).toEqual(ack);
    expect(UnsubscribeInputSchema.parse({ subscriptionId: 'sub_1' })).toEqual({ subscriptionId: 'sub_1' });
  });

  it.each([
    ['a missing subscription ID', { subscription: ack.subscription }],
    ['a server room name', { ...ack, room: 'group:group_1' }],
    ['a scope that names a user', { ...ack, subscription: { kind: 'user', userId: 'user_rider_a' } }],
  ])('rejects an acknowledgement with %s', (_label, value) => {
    expect(accepts(SubscriptionAckSchema, value)).toBe(false);
  });

  it('rejects an unsubscribe without an ID or with a scope', () => {
    expect(accepts(UnsubscribeInputSchema, {})).toBe(false);
    expect(accepts(UnsubscribeInputSchema, { subscriptionId: 'sub_1', kind: 'group' })).toBe(false);
  });
});

describe('join, chat, and block and leave event walkthrough', () => {
  it('sends each change only to its audience, with versions that order it', () => {
    // B joins A's solo ride. Nearby subscribers see the ride leave and the group appear,
    // without learning that one became the other.
    const sequence = [
      event('nearby.removed', publicAudience, { target: { kind: 'ride', id: 'ride_1' }, version: 2, reason: 'unavailable' }),
      event('nearby.upserted', publicAudience, { item: groupItem }),
      event('ride.changed', audienceOf('a'), { rideRequestId: 'ride_1', version: 2, status: 'grouped' }),
      event('ride.changed', audienceOf('b'), { rideRequestId: 'ride_2', version: 2, status: 'grouped' }),
      // Both subscribe to the group; B's message reaches both, the sender included.
      event('chat.message.created', groupAudience(), { message }),
      // A later blocks B, so A leaves. A loses access; B, left alone, sees the group cancelled
      // with no mention of the block, and B's request is cancelled.
      event('access.revoked', audienceOf('a'), { groupId: 'group_1', version: 3, reason: 'left' }),
      event('group.changed', groupAudience(), { groupId: 'group_1', version: 3, reason: 'cancelled' }),
      event('ride.changed', audienceOf('b'), { rideRequestId: 'ride_2', version: 3, status: 'cancelled' }),
      event('nearby.removed', publicAudience, { target: { kind: 'group', id: 'group_1' }, version: 3, reason: 'unavailable' }),
    ];
    const parsed = sequence.map((value) => DomainEventSchema.parse(value));
    expect(new Set(parsed.map((entry) => entry.id)).size).toBe(parsed.length);
    expect(parsed.filter((entry) => entry.audience.kind === 'public').every((entry) => accepts(PublicEventSchema, entry))).toBe(
      true,
    );

    // A delayed upsert of the removed ride is not newer than its tombstone, so it is ignored.
    const tombstone = NearbyRemovedEventSchema.parse(sequence[0]);
    const late = NearbyUpsertedEventSchema.parse(upserted);
    expect(late.payload.item.version).toBeLessThanOrEqual(tombstone.payload.version);

    // After the revocation, a late group event for group_1 still validates; A's app drops it
    // because group_1 is no longer a group A may read, not because the event is malformed.
    const revocation = AccessRevokedEventSchema.parse(sequence[5]);
    const lateChange = GroupChangedEventSchema.parse({ ...groupChanged, payload: { ...groupChanged.payload, version: 2 } });
    expect(lateChange.audience.groupId).toBe(revocation.payload.groupId);
    expect(lateChange.payload.version).toBeLessThan(revocation.payload.version);

    // The match set and ride versions are separate resources; neither orders the other.
    expect(MatchesChangedEventSchema.parse(matchesChanged).payload.version).toBe(4);
    expect(RideChangedEventSchema.parse(rideChanged).payload.version).toBe(2);
  });
});
