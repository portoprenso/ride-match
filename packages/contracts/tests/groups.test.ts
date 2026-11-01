import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  GroupPreviewSchema,
  GroupStatusSchema,
  JoinTargetSchema,
  LiveGroupStatusSchema,
  hasDistinctTargets,
  joinTargetKey,
} from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic group in the demo city.
const preview = {
  id: 'group_1',
  status: 'forming',
  memberCount: 3,
  capacity: 4,
  publicOrigin: { center: { latitude: 42.88, longitude: 74.6 }, radiusMeters: 400, label: 'City centre' },
  destination: {
    id: 'place_asia_mall',
    label: 'Asia Mall',
    detail: 'Chyngyz Aitmatov Avenue',
    coordinates: { latitude: 42.8556, longitude: 74.5859 },
  },
  departureAt: '2026-11-01T09:35:00Z',
  expiresAt: '2026-11-01T10:00:00Z',
  version: 3,
};

describe('GroupStatusSchema', () => {
  it('accepts the four statuses and lists only forming and ready as live', () => {
    for (const status of ['forming', 'ready', 'completed', 'cancelled']) {
      expect(accepts(GroupStatusSchema, status)).toBe(true);
    }
    expect(LiveGroupStatusSchema.options).toEqual(['forming', 'ready']);
  });

  it('rejects a departed state, which the MVP does not have', () => {
    expect(accepts(GroupStatusSchema, 'departed')).toBe(false);
  });
});

describe('JoinTargetSchema', () => {
  it('accepts a ride and a group', () => {
    expect(accepts(JoinTargetSchema, { kind: 'ride', id: 'ride_1' })).toBe(true);
    expect(accepts(JoinTargetSchema, { kind: 'group', id: 'group_1' })).toBe(true);
  });

  it.each([
    ['an unknown kind', { kind: 'user', id: 'user_1' }],
    ['an invalid ID', { kind: 'ride', id: 'ride 1' }],
    ['a missing kind', { id: 'ride_1' }],
    ['an extra field', { kind: 'ride', id: 'ride_1', version: 2 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(JoinTargetSchema, value)).toBe(false);
  });
});

describe('joinTargetKey and hasDistinctTargets', () => {
  it('keeps a ride and a group with the same ID apart', () => {
    const ride = { kind: 'ride', id: 'shared_1' } as const;
    const group = { kind: 'group', id: 'shared_1' } as const;
    expect(joinTargetKey(ride)).not.toBe(joinTargetKey(group));
    expect(hasDistinctTargets([ride, group])).toBe(true);
  });

  it('finds a repeated target', () => {
    const ride = { kind: 'ride', id: 'ride_1' } as const;
    expect(hasDistinctTargets([])).toBe(true);
    expect(hasDistinctTargets([ride, { kind: 'group', id: 'group_1' }, ride])).toBe(false);
  });
});

describe('GroupPreviewSchema', () => {
  it('accepts a forming and a full ready group', () => {
    expect(GroupPreviewSchema.parse(preview)).toEqual(preview);
    expect(accepts(GroupPreviewSchema, { ...preview, status: 'ready', memberCount: 4 })).toBe(true);
  });

  it.each([2, 4])('accepts %d members', (memberCount) => {
    expect(accepts(GroupPreviewSchema, { ...preview, memberCount })).toBe(true);
  });

  it.each([
    ['one member', { ...preview, memberCount: 1 }],
    ['five members', { ...preview, memberCount: 5 }],
    ['a fractional member count', { ...preview, memberCount: 2.5 }],
    ['a capacity other than four', { ...preview, capacity: 5 }],
    ['a completed group', { ...preview, status: 'completed' }],
    ['a cancelled group', { ...preview, status: 'cancelled' }],
    ['a missing departure', { ...preview, departureAt: undefined }],
    ['a destination given only by ID', { ...preview, destination: 'place_asia_mall' }],
    ['a radius that claims a precise origin', { ...preview, publicOrigin: { ...preview.publicOrigin, radiusMeters: 50 } }],
    ['a version of 0', { ...preview, version: 0 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(GroupPreviewSchema, value)).toBe(false);
  });

  it.each([
    ['a member list', { ...preview, members: [{ id: 'user_1', displayName: 'Rider A', avatarUrl: null }] }],
    ['member IDs', { ...preview, memberIds: ['user_1', 'user_2'] }],
    ['the coordinator', { ...preview, coordinatorId: 'user_1' }],
    ['the meeting point', { ...preview, meetingPoint: { id: 'mp_1', coordinates: { latitude: 42.87, longitude: 74.59 } } }],
    ['chat messages', { ...preview, messages: [] }],
    ['linked ride requests', { ...preview, rideRequestIds: ['ride_1'] }],
    ['an exact origin', { ...preview, origin: { coordinates: { latitude: 42.8762, longitude: 74.6041 }, source: 'device' } }],
  ])('rejects a member-only or private field: %s', (_label, value) => {
    expect(accepts(GroupPreviewSchema, value)).toBe(false);
  });
});
