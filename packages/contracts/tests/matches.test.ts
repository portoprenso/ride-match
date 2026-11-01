import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MatchLevelSchema, MatchPreviewSchema, RideMatchSchema, RideMatchSetSchema } from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

const preview = { target: { kind: 'ride', id: 'ride_1' }, level: 'excellent', additionalMinutes: 4 };
const match = { ...preview, expiresAt: '2026-11-01T09:45:00Z' };
const groupMatch = { ...match, target: { kind: 'group', id: 'group_1' }, level: 'good', additionalMinutes: null };

describe('MatchLevelSchema', () => {
  it('accepts the three levels', () => {
    expect(MatchLevelSchema.options).toEqual(['possible', 'good', 'excellent']);
  });

  it.each(['perfect', 0.92, null])('rejects %s', (level) => {
    expect(accepts(MatchLevelSchema, level)).toBe(false);
  });
});

describe('MatchPreviewSchema', () => {
  it.each([0, 60, null])('accepts %s additional minutes', (additionalMinutes) => {
    expect(accepts(MatchPreviewSchema, { ...preview, additionalMinutes })).toBe(true);
  });

  it.each([
    ['61 additional minutes', { ...preview, additionalMinutes: 61 }],
    ['negative minutes', { ...preview, additionalMinutes: -1 }],
    ['fractional minutes', { ...preview, additionalMinutes: 2.5 }],
    ['omitted minutes instead of null', { target: preview.target, level: preview.level }],
    ['an unknown target kind', { ...preview, target: { kind: 'user', id: 'user_1' } }],
    ['a bare target ID', { ...preview, target: 'ride_1' }],
    ['a numeric score', { ...preview, score: 0.92 }],
    ['an expiry, which only matches carry', { ...preview, expiresAt: match.expiresAt }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(MatchPreviewSchema, value)).toBe(false);
  });
});

describe('RideMatchSchema', () => {
  it('accepts a ride match and a group match', () => {
    expect(RideMatchSchema.parse(match)).toEqual(match);
    expect(accepts(RideMatchSchema, groupMatch)).toBe(true);
  });

  it.each([
    ['a missing expiry', preview],
    ['a numeric score', { ...match, score: 0.92 }],
    ["the target's exact origin", { ...match, targetOrigin: { latitude: 42.8762, longitude: 74.6041 } }],
    ["the target's rider", { ...match, user: { id: 'user_1', displayName: 'Rider A', avatarUrl: null } }],
    ['a seat reservation', { ...match, reservedSeat: true }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(RideMatchSchema, value)).toBe(false);
  });
});

describe('RideMatchSetSchema', () => {
  it('accepts an empty set and a set of distinct targets', () => {
    expect(accepts(RideMatchSetSchema, { version: 1, matches: [] })).toBe(true);
    const set = { version: 4, matches: [match, groupMatch] };
    expect(RideMatchSetSchema.parse(set)).toEqual(set);
  });

  it('keeps a ride and a group with the same ID apart', () => {
    const sameId = { ...groupMatch, target: { kind: 'group', id: 'ride_1' } };
    expect(accepts(RideMatchSetSchema, { version: 2, matches: [match, sameId] })).toBe(true);
  });

  it('accepts 20 matches and rejects 21', () => {
    const matches = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...match, target: { kind: 'ride', id: `ride_${index}` } }));
    expect(accepts(RideMatchSetSchema, { version: 1, matches: matches(20) })).toBe(true);
    expect(accepts(RideMatchSetSchema, { version: 1, matches: matches(21) })).toBe(false);
  });

  it.each([
    ['a target listed twice', { version: 3, matches: [match, groupMatch, { ...match, level: 'good' }] }],
    ['an invalid match', { version: 3, matches: [{ ...match, level: 'perfect' }] }],
    ['a missing version', { matches: [match] }],
    ['a version of 0', { version: 0, matches: [] }],
    ['a pagination cursor', { version: 1, matches: [], nextCursor: 'abc' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(RideMatchSetSchema, value)).toBe(false);
  });
});
