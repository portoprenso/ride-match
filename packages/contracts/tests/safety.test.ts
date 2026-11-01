import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ApiErrorSchema,
  BlockListPageSchema,
  BlockListQueryInputSchema,
  BlockUserInputSchema,
  BlockUserResultSchema,
  BlockedUserSchema,
  ReportContextSchema,
  ReportDetailsSchema,
  ReportReasonSchema,
  ReportReceiptSchema,
  ReportUserInputSchema,
  RideGroupSchema,
  SAFETY_POLICY,
} from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic riders, group and reports in the demo city; no real person or incident.
const user = (letter: string) => ({ id: `user_rider_${letter}`, displayName: `Rider ${letter.toUpperCase()}`, avatarUrl: null });
const operationId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const blocked = (letter: string, blockedAt: string) => ({ user: user(letter), blockedAt });
const cancelledRequest = (letter: string, id: string, groupId: string) => ({
  id,
  user: user(letter),
  publicOrigin: { center: { latitude: 42.88, longitude: 74.6 }, radiusMeters: 400, label: 'City centre' },
  destination: {
    id: 'place_asia_mall',
    label: 'Asia Mall',
    detail: 'Chyngyz Aitmatov Avenue',
    coordinates: { latitude: 42.8556, longitude: 74.5859 },
  },
  departureAt: '2026-11-01T09:36:00Z',
  expiresAt: '2026-11-01T09:46:00Z',
  version: 3,
  status: 'cancelled',
  groupId,
  origin: { coordinates: { latitude: 42.8762, longitude: 74.6041 }, source: 'device' },
});
const report = {
  operationId: operationId(1),
  targetUserId: 'user_rider_b',
  reason: 'harassment',
  details: 'Repeated rude messages in the demo chat.',
  context: { groupId: 'group_1', messageId: 'msg_7' },
};
const receipt = { id: 'RPT-EXAMPLE', receivedAt: '2026-11-01T09:38:00Z' };

describe('ReportReasonSchema', () => {
  it('accepts the four reasons of the report form, in its order', () => {
    expect(ReportReasonSchema.options).toEqual(['unsafe_behavior', 'harassment', 'spam_or_misleading', 'other']);
  });

  it.each(['spam', 'Harassment', 'unsafe_behaviour', ''])('rejects %j', (reason) => {
    expect(accepts(ReportReasonSchema, reason)).toBe(false);
  });
});

describe('ReportDetailsSchema', () => {
  it.each([
    ['one character', 'k'],
    ['line breaks inside', 'Pushed ahead of others.\n\nIgnored the group.'],
    ['the longest details', 'a'.repeat(SAFETY_POLICY.maxReportDetailsLength)],
  ])('accepts %s', (_label, details) => {
    expect(ReportDetailsSchema.parse(details)).toBe(details);
  });

  it.each([
    ['empty details', ''],
    ['only spaces', '   '],
    ['a trailing line break', 'Rude\n'],
    ['a tab', 'one\ttwo'],
    ['details one character too long', 'a'.repeat(SAFETY_POLICY.maxReportDetailsLength + 1)],
  ])('rejects %s', (_label, details) => {
    expect(accepts(ReportDetailsSchema, details)).toBe(false);
  });
});

describe('ReportContextSchema', () => {
  it.each([
    ['a group', { groupId: 'group_1', messageId: null }],
    ['a chat message', { groupId: 'group_1', messageId: 'msg_7' }],
  ])('accepts %s', (_label, value) => {
    expect(ReportContextSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['an omitted message', { groupId: 'group_1' }],
    ['a message without its group', { messageId: 'msg_7' }],
    ['copied message text', { groupId: 'group_1', messageId: 'msg_7', text: 'Demo message 7' }],
    ['a ride as the context', { groupId: 'group_1', messageId: null, rideRequestId: 'ride_2' }],
    ['an invalid group ID', { groupId: 'group 1', messageId: null }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ReportContextSchema, value)).toBe(false);
  });
});

describe('ReportUserInputSchema', () => {
  it.each([
    ['a report from chat', report],
    ['a report about a rider in the group', { ...report, context: { groupId: 'group_1', messageId: null } }],
    [
      'a report without details or context',
      { operationId: operationId(2), targetUserId: 'user_rider_b', reason: 'spam_or_misleading' },
    ],
  ])('accepts %s', (_label, value) => {
    expect(ReportUserInputSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['a missing operation ID', { ...report, operationId: undefined }],
    ['an operation ID that is not a UUID', { ...report, operationId: 'report-1' }],
    ['a missing target', { ...report, targetUserId: undefined }],
    ['an unknown reason', { ...report, reason: 'rude' }],
    ['a missing reason', { ...report, reason: undefined }],
    ['empty details', { ...report, details: '' }],
    ['details that are too long', { ...report, details: 'a'.repeat(SAFETY_POLICY.maxReportDetailsLength + 1) }],
    ['null details instead of omitted ones', { ...report, details: null }],
    ['a null context instead of an omitted one', { ...report, context: null }],
    ['a reporter chosen by the caller', { ...report, reporterId: 'user_rider_a' }],
    ['copied message text', { ...report, messageText: 'Demo message 7' }],
    ['a location', { ...report, coordinates: { latitude: 42.8762, longitude: 74.6041 } }],
    ['a target phone number', { ...report, targetPhoneNumber: '+12025550142' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ReportUserInputSchema, value)).toBe(false);
  });
});

describe('ReportReceiptSchema', () => {
  it('accepts a receipt ID and acceptance time', () => {
    expect(ReportReceiptSchema.parse(receipt)).toEqual(receipt);
  });

  it.each([
    ['a moderation status', { ...receipt, status: 'reviewed' }],
    ['a moderation outcome', { ...receipt, outcome: 'warning_issued' }],
    ['the report details', { ...receipt, details: report.details }],
    ['the reported rider', { ...receipt, targetUserId: 'user_rider_b' }],
    ['a missing receipt ID', { receivedAt: receipt.receivedAt }],
    ['a receipt ID with spaces', { ...receipt, id: 'RPT EXAMPLE' }],
    ['a time with an offset', { ...receipt, receivedAt: '2026-11-01T15:38:00+06:00' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ReportReceiptSchema, value)).toBe(false);
  });
});

describe('BlockUserInputSchema', () => {
  it('accepts an operation ID', () => {
    expect(BlockUserInputSchema.parse({ operationId: operationId(3) })).toEqual({ operationId: operationId(3) });
  });

  it.each([
    ['a missing operation ID', {}],
    ['an operation ID that is not a UUID', { operationId: 'block-1' }],
    ['a reason', { operationId: operationId(3), reason: 'harassment' }],
    ['a blocker chosen by the caller', { operationId: operationId(3), blockerId: 'user_rider_a' }],
    ['a group to remove the rider from', { operationId: operationId(3), groupId: 'group_1' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(BlockUserInputSchema, value)).toBe(false);
  });
});

describe('BlockedUserSchema', () => {
  it('accepts a public user summary and block time', () => {
    const value = blocked('b', '2026-11-01T09:39:00Z');
    expect(BlockedUserSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['a phone number', { ...blocked('b', '2026-11-01T09:39:00Z'), user: { ...user('b'), phoneNumber: '+12025550142' } }],
    ['a user given only by ID', { user: 'user_rider_b', blockedAt: '2026-11-01T09:39:00Z' }],
    ['a missing block time', { user: user('b') }],
    ['a reason', { ...blocked('b', '2026-11-01T09:39:00Z'), reason: 'harassment' }],
    ['the shared group', { ...blocked('b', '2026-11-01T09:39:00Z'), groupId: 'group_1' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(BlockedUserSchema, value)).toBe(false);
  });
});

describe('BlockUserResultSchema', () => {
  const noSharedGroup = { blockedUser: blocked('b', '2026-11-01T09:39:00Z'), leftGroup: null };
  const blockAndLeave = {
    blockedUser: blocked('b', '2026-11-01T09:39:00Z'),
    leftGroup: { groupId: 'group_1', rideRequest: cancelledRequest('a', 'ride_1', 'group_1') },
  };

  it.each([
    ['a block without a shared group', noSharedGroup],
    ['a block that left the shared group', blockAndLeave],
  ])('accepts %s', (_label, value) => {
    expect(BlockUserResultSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['an omitted leave', { blockedUser: noSharedGroup.blockedUser }],
    [
      'a leave whose request is still grouped',
      { ...blockAndLeave, leftGroup: { ...blockAndLeave.leftGroup, rideRequest: { ...cancelledRequest('a', 'ride_1', 'group_1'), status: 'grouped' } } },
    ],
    [
      'a leave whose request was cancelled with another group',
      { ...blockAndLeave, leftGroup: { ...blockAndLeave.leftGroup, groupId: 'group_2' } },
    ],
    [
      'a caller blocking themselves',
      { ...blockAndLeave, blockedUser: blocked('a', '2026-11-01T09:39:00Z') },
    ],
    ['the group after the leave', { ...noSharedGroup, group: { id: 'group_1', status: 'forming' } }],
    ['the blocked rider removed from the group', { ...noSharedGroup, removedUserId: 'user_rider_b' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(BlockUserResultSchema, value)).toBe(false);
  });
});

describe('BlockListQueryInputSchema', () => {
  it.each([
    ['the first page', { limit: 20 }],
    ['a later page', { cursor: 'c.blocks~20', limit: 20 }],
    ['the largest page', { limit: SAFETY_POLICY.maxBlockListPageSize }],
  ])('accepts %s', (_label, value) => {
    expect(BlockListQueryInputSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['a missing limit', {}],
    ['a limit of 0', { limit: 0 }],
    ['a limit above the page size', { limit: SAFETY_POLICY.maxBlockListPageSize + 1 }],
    ['a fractional limit', { limit: 2.5 }],
    ['a cursor with spaces', { cursor: 'c blocks', limit: 20 }],
    ['an empty cursor', { cursor: '', limit: 20 }],
    ['a search query', { query: 'Rider', limit: 20 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(BlockListQueryInputSchema, value)).toBe(false);
  });
});

describe('BlockListPageSchema', () => {
  const newest = blocked('b', '2026-11-01T09:39:00Z');
  const older = blocked('c', '2026-10-31T18:00:00Z');
  const many = Array.from({ length: SAFETY_POLICY.maxBlockListPageSize + 1 }, (_, index) =>
    blocked(`n${index}`, '2026-10-30T12:00:00Z'),
  );

  it.each([
    ['an empty list', { blockedUsers: [], nextCursor: null }],
    ['a first page with more to read', { blockedUsers: [newest], nextCursor: 'c.blocks~1' }],
    ['a last page, newest first', { blockedUsers: [newest, older], nextCursor: null }],
    ['blocks made at the same time', { blockedUsers: [newest, { ...older, blockedAt: newest.blockedAt }], nextCursor: null }],
    ['a full page', { blockedUsers: many.slice(1), nextCursor: 'c.blocks~50' }],
  ])('accepts %s', (_label, value) => {
    expect(BlockListPageSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['oldest first', { blockedUsers: [older, newest], nextCursor: null }],
    ['a rider listed twice', { blockedUsers: [newest, { ...newest, blockedAt: older.blockedAt }], nextCursor: null }],
    ['a next cursor on an empty page', { blockedUsers: [], nextCursor: 'c.blocks~1' }],
    ['more blocks than a page holds', { blockedUsers: many, nextCursor: null }],
    ['a total count', { blockedUsers: [], nextCursor: null, total: 0 }],
    ['a blocked rider with a phone number', { blockedUsers: [{ ...newest, user: { ...user('b'), phoneNumber: '+12025550142' } }], nextCursor: null }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(BlockListPageSchema, value)).toBe(false);
  });
});

describe('report, block and leave, and unblock walkthrough', () => {
  const createdAt = '2026-11-01T09:31:00Z';
  const member = (letter: string, rideRequestId: string, joinedAt = createdAt) => ({
    user: user(letter),
    joinedAt,
    rideRequestId,
  });
  const group = {
    id: 'group_1',
    status: 'forming',
    coordinatorId: 'user_rider_a',
    members: [member('a', 'ride_1'), member('b', 'ride_2')],
    capacity: 4,
    destination: cancelledRequest('a', 'ride_1', 'group_1').destination,
    departureAt: '2026-11-01T09:35:00Z',
    meetingPoint: null,
    createdAt,
    expiresAt: '2026-11-01T10:01:00Z',
    closure: null,
    version: 2,
  };

  it('keeps one report per intent, leaves the shared group and never restores it', () => {
    // A reports B's chat message; the response is lost, and the retry with the same operation
    // ID returns the receipt already issued.
    const input = ReportUserInputSchema.parse(report);
    const issued = ReportReceiptSchema.parse(receipt);
    expect(ReportReceiptSchema.parse({ ...receipt })).toEqual(issued);
    expect(input.context).toEqual({ groupId: 'group_1', messageId: 'msg_7' });

    // A then blocks B from the receipt. They share a group of two, so A leaves it in the same
    // operation and A's request is cancelled.
    expect(accepts(BlockUserInputSchema, { operationId: operationId(4) })).toBe(true);
    const result = BlockUserResultSchema.parse({
      blockedUser: blocked('b', '2026-11-01T09:39:00Z'),
      leftGroup: { groupId: group.id, rideRequest: cancelledRequest('a', 'ride_1', group.id) },
    });
    expect(result.leftGroup?.rideRequest.status).toBe('cancelled');

    // B, left alone, sees the group closed because members left; no reason names the block.
    const remaining = {
      ...group,
      status: 'cancelled',
      coordinatorId: 'user_rider_b',
      members: [member('b', 'ride_2')],
      closure: { reason: 'members_left', closedAt: '2026-11-01T09:39:00Z', historyExpiresAt: '2026-11-01T10:39:00Z' },
      version: 3,
    };
    expect(accepts(RideGroupSchema, remaining)).toBe(true);
    expect(accepts(RideGroupSchema, { ...remaining, closure: { ...remaining.closure, reason: 'blocked' } })).toBe(false);

    // In a group of three, the coordinator A blocks C: B takes over and the group stays live.
    const ofThree = { ...group, members: [...group.members, member('c', 'ride_3', '2026-11-01T09:33:00Z')], version: 3 };
    expect(accepts(RideGroupSchema, ofThree)).toBe(true);
    const afterLeave = { ...ofThree, coordinatorId: 'user_rider_b', members: [member('b', 'ride_2'), member('c', 'ride_3', '2026-11-01T09:33:00Z')], version: 4 };
    expect(accepts(RideGroupSchema, afterLeave)).toBe(true);

    // Blocking B again with a new operation keeps the first block and leaves nothing.
    expect(
      BlockUserResultSchema.parse({ blockedUser: result.blockedUser, leftGroup: null }).blockedUser.blockedAt,
    ).toBe('2026-11-01T09:39:00Z');
    // Reusing the first operation ID for another rider is a conflict.
    expect(
      ApiErrorSchema.parse({ code: 'IDEMPOTENCY_CONFLICT', message: 'This block was already made.', requestId: 'req_1' })
        .code,
    ).toBe('IDEMPOTENCY_CONFLICT');

    // A's block list shows B; after the unblock (no body, no result) it is empty, and nothing
    // in either result restores the group or its chat.
    const listed = BlockListPageSchema.parse({ blockedUsers: [result.blockedUser], nextCursor: null });
    expect(listed.blockedUsers.map((entry) => entry.user.id)).toEqual(['user_rider_b']);
    expect(BlockListPageSchema.parse({ blockedUsers: [], nextCursor: null }).blockedUsers).toEqual([]);

    // Blocking an unknown rider fails without guessing a target.
    expect(ApiErrorSchema.parse({ code: 'NOT_FOUND', message: 'This rider was not found.', requestId: 'req_2' }).code).toBe(
      'NOT_FOUND',
    );
  });
});
