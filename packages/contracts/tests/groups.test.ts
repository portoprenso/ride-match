import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ApiErrorSchema,
  GROUP_POLICY,
  GroupClosureSchema,
  GroupMemberSchema,
  GroupPreviewSchema,
  GroupStatusSchema,
  JoinGroupInputSchema,
  JoinGroupResultSchema,
  JoinTargetSchema,
  LeaveGroupInputSchema,
  LeaveGroupResultSchema,
  LiveGroupStatusSchema,
  OwnRideRequestSchema,
  RIDE_POLICY,
  RideGroupSchema,
  UpdateGroupStatusInputSchema,
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

// Synthetic riders, rides and meeting point of one demo group; no real person or place.
const user = (letter: string) => ({ id: `user_rider_${letter}`, displayName: `Rider ${letter.toUpperCase()}`, avatarUrl: null });
const createdAt = '2026-11-01T09:31:00Z';
const memberA = { user: user('a'), joinedAt: createdAt, rideRequestId: 'ride_1' };
const memberB = { user: user('b'), joinedAt: createdAt, rideRequestId: 'ride_2' };
const memberC = { user: user('c'), joinedAt: '2026-11-01T09:33:00Z', rideRequestId: 'ride_3' };
const memberD = { user: user('d'), joinedAt: '2026-11-01T09:34:00Z', rideRequestId: 'ride_4' };
const meetingPoint = {
  id: 'point_1',
  coordinates: { latitude: 42.8741, longitude: 74.6033 },
  label: 'Demo fountain',
  walkingMinutes: 4,
};
const group = {
  id: 'group_1',
  status: 'forming',
  coordinatorId: 'user_rider_a',
  members: [memberA, memberB],
  capacity: 4,
  destination: preview.destination,
  departureAt: '2026-11-01T09:35:00Z',
  meetingPoint: null,
  createdAt,
  expiresAt: '2026-11-01T10:01:00Z',
  closure: null,
  version: 1,
};
const readyGroup = { ...group, status: 'ready', meetingPoint, version: 3 };
const closure = (reason: string) => ({
  reason,
  closedAt: '2026-11-01T09:40:00Z',
  historyExpiresAt: '2026-11-01T10:40:00Z',
});
const completedGroup = { ...readyGroup, status: 'completed', closure: closure('completed'), version: 4 };
const ownRequest = (letter: string, id: string, status: string, groupId: string | null) => ({
  id,
  user: user(letter),
  publicOrigin: preview.publicOrigin,
  destination: preview.destination,
  departureAt: '2026-11-01T09:36:00Z',
  expiresAt: '2026-11-01T09:46:00Z',
  version: 2,
  status,
  groupId,
  origin: { coordinates: { latitude: 42.8762, longitude: 74.6041 }, source: 'device' },
});

describe('GROUP_POLICY', () => {
  it('outlives every departure choice, so a group departs before it expires', () => {
    expect(Math.max(...RIDE_POLICY.departureOffsetsMinutes) * 60).toBeLessThan(GROUP_POLICY.lifetimeSeconds);
    expect(GROUP_POLICY.historyRetentionSeconds).toBeGreaterThan(0);
  });
});

describe('GroupClosureSchema', () => {
  it.each(['completed', 'coordinator_cancelled', 'expired', 'members_left'])('accepts the reason %s', (reason) => {
    expect(accepts(GroupClosureSchema, closure(reason))).toBe(true);
  });

  it.each([
    ['a block as the reason', closure('blocked')],
    ['history that expires at closure', { ...closure('expired'), historyExpiresAt: '2026-11-01T09:40:00Z' }],
    ['history that expires before closure', { ...closure('expired'), historyExpiresAt: '2026-11-01T09:30:00Z' }],
    ['a missing closure time', { reason: 'expired', historyExpiresAt: '2026-11-01T10:40:00Z' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(GroupClosureSchema, value)).toBe(false);
  });
});

describe('GroupMemberSchema', () => {
  it('accepts a public user summary, join time and linked request', () => {
    expect(GroupMemberSchema.parse(memberC)).toEqual(memberC);
  });

  it.each([
    ['a phone number', { ...memberA, user: { ...memberA.user, phoneNumber: '+12025550142' } }],
    ['an exact origin', { ...memberA, origin: { coordinates: { latitude: 42.8762, longitude: 74.6041 }, source: 'device' } }],
    ['a live location', { ...memberA, coordinates: { latitude: 42.8762, longitude: 74.6041 } }],
    ['a role field', { ...memberA, role: 'coordinator' }],
    ['a missing linked request', { user: memberA.user, joinedAt: createdAt }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(GroupMemberSchema, value)).toBe(false);
  });
});

describe('RideGroupSchema', () => {
  it.each([
    ['a forming pair waiting for a meeting point', group],
    ['a full forming group, not yet ready', { ...group, members: [memberA, memberB, memberC, memberD], version: 3 }],
    ['a ready group', readyGroup],
    ['a completed group', completedGroup],
    ['a group the coordinator cancelled', { ...group, status: 'cancelled', closure: closure('coordinator_cancelled') }],
    ['a ready group that expired', { ...readyGroup, status: 'cancelled', closure: closure('expired') }],
    [
      'a group cancelled because members left, read by the one who remained',
      { ...group, status: 'cancelled', coordinatorId: 'user_rider_b', members: [memberB], closure: closure('members_left') },
    ],
    [
      'a later joiner who took over as coordinator',
      { ...group, coordinatorId: 'user_rider_c', members: [memberC, memberD] },
    ],
    ['a meeting point without a walking estimate', { ...readyGroup, meetingPoint: { ...meetingPoint, walkingMinutes: null } }],
  ])('accepts %s', (_label, value) => {
    expect(RideGroupSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['a live group with a closure', { ...group, closure: closure('expired') }],
    ['a completed group without a closure', { ...completedGroup, closure: null }],
    ['a completed group with a cancellation reason', { ...completedGroup, closure: closure('coordinator_cancelled') }],
    ['a cancelled group without a closure', { ...group, status: 'cancelled' }],
    ['a cancelled group with the completed reason', { ...group, status: 'cancelled', closure: closure('completed') }],
    ['a live group with one member', { ...group, members: [memberA] }],
    ['a group cancelled by its coordinator with one member', { ...group, status: 'cancelled', members: [memberA], closure: closure('coordinator_cancelled') }],
    ['members leaving that left two members', { ...group, status: 'cancelled', closure: closure('members_left') }],
    ['no members', { ...group, members: [] }],
    ['five members', { ...group, members: [memberA, memberB, memberC, memberD, { ...memberD, user: user('e'), rideRequestId: 'ride_5' }] }],
    ['a user listed twice', { ...group, members: [memberA, { ...memberB, user: memberA.user }] }],
    ['a ride request listed twice', { ...group, members: [memberA, { ...memberB, rideRequestId: 'ride_1' }] }],
    ['members out of join order', { ...group, members: [memberA, memberC, memberB] }],
    ['a member who joined before the group existed', { ...group, members: [{ ...memberA, joinedAt: '2026-11-01T09:30:00Z' }, memberB] }],
    ['a coordinator who is not a member', { ...group, coordinatorId: 'user_rider_c' }],
    ['a ready group without a meeting point', { ...readyGroup, meetingPoint: null }],
    ['a completed group without a meeting point', { ...completedGroup, meetingPoint: null }],
    ['a departure after expiry', { ...group, departureAt: '2026-11-01T10:05:00Z' }],
    ['an expiry before creation', { ...group, expiresAt: '2026-11-01T09:30:00Z' }],
    ['a capacity other than four', { ...group, capacity: 5 }],
    ['a stored member count', { ...group, memberCount: 2 }],
    ['an unknown status', { ...group, status: 'departed' }],
    ['a version of 0', { ...group, version: 0 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(RideGroupSchema, value)).toBe(false);
  });

  it.each([
    ['a member exact origin', { ...group, members: [{ ...memberA, origin: { coordinates: { latitude: 42.8762, longitude: 74.6041 }, source: 'device' } }, memberB] }],
    ['a member phone number', { ...group, members: [memberA, { ...memberB, user: { ...memberB.user, phoneNumber: '+12025550142' } }] }],
    ['chat messages', { ...group, messages: [] }],
    ['the viewer location behind the walking estimate', { ...readyGroup, meetingPoint: { ...meetingPoint, from: { latitude: 42.8762, longitude: 74.6041 } } }],
  ])('rejects a private field: %s', (_label, value) => {
    expect(accepts(RideGroupSchema, value)).toBe(false);
  });
});

describe('JoinGroupInputSchema', () => {
  const join = { operationId: '3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c', rideRequestId: 'ride_2', target: { kind: 'ride', id: 'ride_1' } };

  it('accepts a solo ride or a group as the target', () => {
    expect(JoinGroupInputSchema.parse(join)).toEqual(join);
    expect(accepts(JoinGroupInputSchema, { ...join, target: { kind: 'group', id: 'group_1' } })).toBe(true);
  });

  it('accepts a group that shares its ID with the caller’s ride', () => {
    expect(accepts(JoinGroupInputSchema, { ...join, target: { kind: 'group', id: 'ride_2' } })).toBe(true);
  });

  it.each([
    ['the caller’s own ride as the target', { ...join, target: { kind: 'ride', id: 'ride_2' } }],
    ['a missing operation ID', { ...join, operationId: undefined }],
    ['a missing own request', { ...join, rideRequestId: undefined }],
    ['a target given only by ID', { ...join, target: 'ride_1' }],
    ['an expected group version', { ...join, expectedGroupVersion: 3 }],
    ['a user ID supplied by the caller', { ...join, userId: 'user_rider_b' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(JoinGroupInputSchema, value)).toBe(false);
  });
});

describe('JoinGroupResultSchema', () => {
  const joined = { group, rideRequest: ownRequest('b', 'ride_2', 'grouped', 'group_1') };

  it('accepts the new group and the grouped request', () => {
    expect(JoinGroupResultSchema.parse(joined)).toEqual(joined);
  });

  it.each([
    ['a request that is still active', { ...joined, rideRequest: ownRequest('b', 'ride_2', 'active', null) }],
    ['a request grouped into another group', { ...joined, rideRequest: ownRequest('b', 'ride_2', 'grouped', 'group_2') }],
    ['a joiner missing from the members', { ...joined, rideRequest: ownRequest('c', 'ride_3', 'grouped', 'group_1') }],
    ['a member linked to another request', { ...joined, rideRequest: ownRequest('b', 'ride_9', 'grouped', 'group_1') }],
    ['a ready group', { ...joined, group: readyGroup }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(JoinGroupResultSchema, value)).toBe(false);
  });
});

describe('LeaveGroupInputSchema and LeaveGroupResultSchema', () => {
  const left = { groupId: 'group_1', rideRequest: ownRequest('b', 'ride_2', 'cancelled', 'group_1') };

  it('accepts an operation ID, and a request cancelled with the group left', () => {
    expect(accepts(LeaveGroupInputSchema, { operationId: '5c4b3a29-1807-4f6e-8d5c-4b3a29180765' })).toBe(true);
    expect(LeaveGroupResultSchema.parse(left)).toEqual(left);
  });

  it.each([
    ['a missing operation ID', {}],
    ['an expected version', { operationId: '5c4b3a29-1807-4f6e-8d5c-4b3a29180765', expectedVersion: 2 }],
    ['another member to remove', { operationId: '5c4b3a29-1807-4f6e-8d5c-4b3a29180765', userId: 'user_rider_c' }],
  ])('rejects an input with %s', (_label, value) => {
    expect(accepts(LeaveGroupInputSchema, value)).toBe(false);
  });

  it.each([
    ['a request still grouped', { ...left, rideRequest: ownRequest('b', 'ride_2', 'grouped', 'group_1') }],
    ['a request cancelled with another group', { ...left, rideRequest: ownRequest('b', 'ride_2', 'cancelled', 'group_2') }],
    ['a request cancelled before grouping', { ...left, rideRequest: ownRequest('b', 'ride_2', 'cancelled', null) }],
    ['the group after the leave', { ...left, group }],
  ])('rejects a result with %s', (_label, value) => {
    expect(accepts(LeaveGroupResultSchema, value)).toBe(false);
  });
});

describe('UpdateGroupStatusInputSchema', () => {
  const update = { operationId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', status: 'ready', expectedVersion: 3 };

  it.each(['forming', 'ready', 'completed', 'cancelled'])('accepts a request for %s', (status) => {
    expect(accepts(UpdateGroupStatusInputSchema, { ...update, status })).toBe(true);
  });

  it.each([
    ['a missing expected version', { ...update, expectedVersion: undefined }],
    ['a missing operation ID', { ...update, operationId: undefined }],
    ['an unknown status', { ...update, status: 'departed' }],
    ['a meeting point chosen by the coordinator', { ...update, meetingPoint }],
    ['a coordinator transfer', { ...update, coordinatorId: 'user_rider_b' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(UpdateGroupStatusInputSchema, value)).toBe(false);
  });
});

describe('solo formation, last seat, leave and closure walkthrough', () => {
  const error = (code: string) => ApiErrorSchema.parse({ code, message: 'Refresh and try again.', requestId: 'req_1' });

  it('represents each step and the access each rider keeps', () => {
    // Rider B joins rider A's solo ride: a group of two, coordinated by A.
    expect(accepts(JoinGroupInputSchema, { operationId: '3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c', rideRequestId: 'ride_2', target: { kind: 'ride', id: 'ride_1' } })).toBe(true);
    const formed = JoinGroupResultSchema.parse({ group, rideRequest: ownRequest('b', 'ride_2', 'grouped', 'group_1') }).group;
    expect(formed.coordinatorId).toBe(memberA.user.id);

    // C and D fill the seats; a full group is still forming.
    const full = RideGroupSchema.parse({ ...formed, members: [memberA, memberB, memberC, memberD], version: 3 });
    expect(full.status).toBe('forming');

    // E loses the race for the last seat and keeps an active request.
    expect(error('GROUP_FULL').code).toBe('GROUP_FULL');
    expect(OwnRideRequestSchema.parse(ownRequest('e', 'ride_5', 'active', null)).groupId).toBeNull();

    // The point arrives and A marks the group ready.
    const withPoint = RideGroupSchema.parse({ ...full, meetingPoint, version: 4 });
    expect(accepts(UpdateGroupStatusInputSchema, { operationId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', status: 'ready', expectedVersion: withPoint.version })).toBe(true);
    const ready = RideGroupSchema.parse({ ...withPoint, status: 'ready', version: 5 });

    // The source changes the point: the group is forming again until A confirms it.
    const moved = RideGroupSchema.parse({ ...ready, status: 'forming', meetingPoint: { ...meetingPoint, id: 'point_2' }, version: 6 });
    expect(moved.meetingPoint?.id).not.toBe(ready.meetingPoint?.id);
    expect(accepts(RideGroupSchema, { ...ready, meetingPoint: null })).toBe(false);

    // A leaves: B, the earliest remaining member, becomes coordinator.
    const leftA = LeaveGroupResultSchema.parse({ groupId: 'group_1', rideRequest: ownRequest('a', 'ride_1', 'cancelled', 'group_1') });
    expect(leftA.rideRequest.status).toBe('cancelled');
    const afterA = RideGroupSchema.parse({ ...moved, coordinatorId: memberB.user.id, members: [memberB, memberC, memberD], version: 7 });

    // C and D leave too; B remains alone, so the group is cancelled.
    const afterC = RideGroupSchema.parse({ ...afterA, members: [memberB, memberD], version: 8 });
    const closed = RideGroupSchema.parse({
      ...afterC,
      status: 'cancelled',
      members: [memberB],
      closure: closure('members_left'),
      version: 9,
    });
    expect(closed.closure?.reason).toBe('members_left');

    // B may read the history until it expires; leavers may not read it at all.
    expect(error('HISTORY_EXPIRED').code).toBe('HISTORY_EXPIRED');
    expect(error('MEMBERSHIP_REQUIRED').code).toBe('MEMBERSHIP_REQUIRED');
  });
});
