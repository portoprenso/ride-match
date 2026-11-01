import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { MapViewportSchema, NearbyItemSchema, NearbyQueryInputSchema, NearbySnapshotSchema } from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic discovery data in the demo city.
const viewport = { southWest: { latitude: 42.8, longitude: 74.5 }, northEast: { latitude: 42.95, longitude: 74.7 } };
const mall = {
  id: 'place_asia_mall',
  label: 'Asia Mall',
  detail: 'Chyngyz Aitmatov Avenue',
  coordinates: { latitude: 42.8556, longitude: 74.5859 },
};
const publicOrigin = { center: { latitude: 42.88, longitude: 74.6 }, radiusMeters: 400, label: 'Near Ala-Too Square' };
const rideItem = {
  kind: 'ride',
  id: 'ride_1',
  user: { id: 'user_rider_a', displayName: 'Rider A', avatarUrl: null },
  publicOrigin,
  destination: mall,
  departureAt: '2026-11-01T09:35:00Z',
  expiresAt: '2026-11-01T09:45:00Z',
  version: 1,
};
const groupItem = {
  kind: 'group',
  id: 'group_1',
  status: 'forming',
  memberCount: 3,
  capacity: 4,
  publicOrigin,
  destination: mall,
  departureAt: '2026-11-01T09:35:00Z',
  expiresAt: '2026-11-01T10:00:00Z',
  version: 2,
};
const ridePreview = { target: { kind: 'ride', id: 'ride_1' }, level: 'excellent', additionalMinutes: 4 };
const query = { viewport, limit: 100 };

describe('MapViewportSchema', () => {
  it('accepts a coarse viewport', () => {
    expect(MapViewportSchema.parse(viewport)).toEqual(viewport);
  });

  it.each([
    [42.6, 43.1, 74.4, 74.9],
    [42.37, 42.87, 74.07, 74.57],
    [42.87, 42.88, 74.59, 74.6],
  ])('accepts spans up to 0.5 degrees (%d–%d, %d–%d)', (south, north, west, east) => {
    const box = { southWest: { latitude: south, longitude: west }, northEast: { latitude: north, longitude: east } };
    expect(accepts(MapViewportSchema, box)).toBe(true);
  });

  it.each([
    ['a latitude span over 0.5 degrees', { ...viewport, northEast: { latitude: 43.31, longitude: 74.7 } }],
    ['a longitude span over 0.5 degrees', { ...viewport, northEast: { latitude: 42.95, longitude: 75.01 } }],
    ['north below south', { southWest: viewport.northEast, northEast: viewport.southWest }],
    ['a zero-height viewport', { ...viewport, northEast: { latitude: 42.8, longitude: 74.7 } }],
    [
      'a viewport across the antimeridian',
      { southWest: { latitude: 42.8, longitude: 179.9 }, northEast: { latitude: 42.95, longitude: -179.9 } },
    ],
    ['a precise corner', { ...viewport, southWest: { latitude: 42.8763, longitude: 74.5 } }],
    ['an out-of-range corner', { ...viewport, northEast: { latitude: 91, longitude: 74.7 } }],
    ['a center and radius instead of corners', { center: { latitude: 42.87, longitude: 74.59 }, radiusMeters: 5_000 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(MapViewportSchema, value)).toBe(false);
  });
});

describe('NearbyQueryInputSchema', () => {
  it('accepts general browsing, a destination, and a destination with departure', () => {
    expect(NearbyQueryInputSchema.parse(query)).toEqual(query);
    expect(accepts(NearbyQueryInputSchema, { ...query, destinationPlaceId: mall.id })).toBe(true);
    expect(
      accepts(NearbyQueryInputSchema, { ...query, destinationPlaceId: mall.id, departureOffsetMinutes: 0 }),
    ).toBe(true);
  });

  it.each([
    ['a departure without a destination', { ...query, departureOffsetMinutes: 5 }],
    ['a departure outside the choices', { ...query, destinationPlaceId: mall.id, departureOffsetMinutes: 15 }],
    ['a null destination instead of omitting it', { ...query, destinationPlaceId: null }],
    ['a limit of 0', { ...query, limit: 0 }],
    ['a limit over 100', { ...query, limit: 101 }],
    ['a fractional limit', { ...query, limit: 10.5 }],
    ['a missing limit', { viewport }],
    ['a missing viewport', { limit: 10 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(NearbyQueryInputSchema, value)).toBe(false);
  });

  it.each([
    ['the device position', { ...query, origin: { latitude: 42.8762, longitude: 74.6041 } }],
    ['a location accuracy', { ...query, accuracyMeters: 12 }],
    ['a user ID', { ...query, userId: 'user_rider_a' }],
  ])('rejects private data: %s', (_label, value) => {
    expect(accepts(NearbyQueryInputSchema, value)).toBe(false);
  });
});

describe('NearbyItemSchema', () => {
  it('accepts a ride item and a group item', () => {
    expect(NearbyItemSchema.parse(rideItem)).toEqual(rideItem);
    expect(NearbyItemSchema.parse(groupItem)).toEqual(groupItem);
  });

  it.each([
    ['an unknown kind', { ...rideItem, kind: 'person' }],
    ['a missing kind', { ...rideItem, kind: undefined }],
    ['a ride with group fields', { ...rideItem, memberCount: 2 }],
    ['a group with a rider', { ...groupItem, user: rideItem.user }],
    ['a ride departing after expiry', { ...rideItem, departureAt: '2026-11-01T09:50:00Z' }],
    ['a closed group', { ...groupItem, status: 'completed' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(NearbyItemSchema, value)).toBe(false);
  });

  it.each([
    ['an exact ride origin', { ...rideItem, origin: { coordinates: { latitude: 42.8762, longitude: 74.6041 }, source: 'device' } }],
    ['a ride status', { ...rideItem, status: 'active' }],
    ['a group member list', { ...groupItem, members: [] }],
    ['a group meeting point', { ...groupItem, meetingPoint: { id: 'mp_1' } }],
    ['a distance from the viewer', { ...rideItem, distanceMeters: 350 }],
  ])('rejects a private field: %s', (_label, value) => {
    expect(accepts(NearbyItemSchema, value)).toBe(false);
  });
});

describe('NearbySnapshotSchema', () => {
  it('accepts an empty area and a mixed snapshot with previews', () => {
    expect(accepts(NearbySnapshotSchema, { items: [], truncated: false, previews: [] })).toBe(true);
    const snapshot = { items: [rideItem, groupItem], truncated: true, previews: [ridePreview] };
    expect(NearbySnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('keeps a ride and a group with the same ID apart', () => {
    const sameId = { ...groupItem, id: 'ride_1' };
    expect(accepts(NearbySnapshotSchema, { items: [rideItem, sameId], truncated: false, previews: [] })).toBe(true);
  });

  it('accepts 100 items and rejects 101', () => {
    const items = (count: number) => Array.from({ length: count }, (_, index) => ({ ...rideItem, id: `ride_${index}` }));
    expect(accepts(NearbySnapshotSchema, { items: items(100), truncated: true, previews: [] })).toBe(true);
    expect(accepts(NearbySnapshotSchema, { items: items(101), truncated: true, previews: [] })).toBe(false);
  });

  it.each([
    ['an item listed twice', { items: [rideItem, groupItem, rideItem], truncated: false, previews: [] }],
    [
      'a preview for an item not returned',
      { items: [groupItem], truncated: false, previews: [ridePreview] },
    ],
    [
      'two previews for one item',
      { items: [rideItem], truncated: false, previews: [ridePreview, { ...ridePreview, level: 'good' }] },
    ],
    ['a missing truncation flag', { items: [rideItem], previews: [] }],
    ['omitted previews instead of an empty list', { items: [rideItem], truncated: false }],
    ['a total count', { items: [rideItem], truncated: true, previews: [], totalCount: 250 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(NearbySnapshotSchema, value)).toBe(false);
  });
});
