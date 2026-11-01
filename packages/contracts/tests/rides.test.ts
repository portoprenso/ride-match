import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CancelRideRequestInputSchema,
  CreateRideRequestInputSchema,
  DepartureOffsetMinutesSchema,
  NearbyItemSchema,
  OwnRideRequestSchema,
  RIDE_POLICY,
  RideMatchSetSchema,
  RideRequestSchema,
  RideRequestStatusSchema,
  type OwnRideRequestDto,
} from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic rider, places and points in the demo city; no real person or location.
const rider = { id: 'user_rider_a', displayName: 'Rider A', avatarUrl: null };
const mall = {
  id: 'place_asia_mall',
  label: 'Asia Mall',
  detail: 'Chyngyz Aitmatov Avenue',
  coordinates: { latitude: 42.8556, longitude: 74.5859 },
};
const publicOrigin = { center: { latitude: 42.88, longitude: 74.6 }, radiusMeters: 400, label: 'Near Ala-Too Square' };
const exactPoint = { latitude: 42.8762, longitude: 74.6041 };
const ride = {
  id: 'ride_1',
  user: rider,
  publicOrigin,
  destination: mall,
  departureAt: '2026-11-01T09:35:00Z',
  expiresAt: '2026-11-01T09:45:00Z',
  version: 1,
};
const ownRide = { ...ride, status: 'active', groupId: null, origin: { coordinates: exactPoint, source: 'device' } };
const createInput = {
  operationId: '0b6f7c1e-2d4a-4f3b-9c8d-7e6f5a4b3c2d',
  origin: { source: 'device', coordinates: exactPoint, accuracyMeters: 12, capturedAt: '2026-11-01T09:29:50Z' },
  destinationPlaceId: 'place_asia_mall',
  departureOffsetMinutes: 5,
};
const cancelInput = { operationId: '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d', expectedVersion: 1 };

describe('RIDE_POLICY', () => {
  it('lets every departure choice happen before the request expires', () => {
    const latestDepartureSeconds = Math.max(...RIDE_POLICY.departureOffsetsMinutes) * 60;
    expect(latestDepartureSeconds).toBeLessThan(RIDE_POLICY.activeLifetimeSeconds);
  });
});

describe('DepartureOffsetMinutesSchema', () => {
  it.each([0, 5, 10])('accepts %d minutes', (minutes) => {
    expect(accepts(DepartureOffsetMinutesSchema, minutes)).toBe(true);
  });

  it.each([1, 15, -5, 5.5, '5', null])('rejects %s', (minutes) => {
    expect(accepts(DepartureOffsetMinutesSchema, minutes)).toBe(false);
  });
});

describe('RideRequestStatusSchema', () => {
  it('accepts the five statuses', () => {
    expect(RideRequestStatusSchema.options).toEqual(['active', 'grouped', 'completed', 'expired', 'cancelled']);
  });
});

describe('RideRequestSchema', () => {
  it('accepts the public projection of an active request', () => {
    expect(RideRequestSchema.parse(ride)).toEqual(ride);
  });

  it.each([
    ['a departure at the expiry time', { ...ride, departureAt: ride.expiresAt }],
    ['a departure after expiry', { ...ride, departureAt: '2026-11-01T09:50:00Z' }],
    ['a missing rider', { ...ride, user: undefined }],
    ['a destination given only by ID', { ...ride, destination: 'place_asia_mall' }],
    ['a radius that claims a precise origin', { ...ride, publicOrigin: { ...publicOrigin, radiusMeters: 0 } }],
    ['a timestamp with an offset', { ...ride, expiresAt: '2026-11-01T15:45:00+06:00' }],
    ['a version of 0', { ...ride, version: 0 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(RideRequestSchema, value)).toBe(false);
  });

  it.each([
    ['the exact origin', { ...ride, origin: { coordinates: exactPoint, source: 'device' } }],
    ['exact coordinates', { ...ride, coordinates: exactPoint }],
    ['a location accuracy', { ...ride, accuracyMeters: 12 }],
    ['the status', { ...ride, status: 'active' }],
    ['a group reference', { ...ride, groupId: 'group_1' }],
    ['a distance from the viewer', { ...ride, distanceMeters: 350 }],
    ['a phone number', { ...ride, user: { ...rider, phoneNumber: '+12025550142' } }],
  ])('rejects an owner-only or private field: %s', (_label, value) => {
    expect(accepts(RideRequestSchema, value)).toBe(false);
  });
});

describe('OwnRideRequestSchema', () => {
  it.each([
    ['active', null],
    ['grouped', 'group_1'],
    ['completed', 'group_1'],
    ['expired', null],
    ['cancelled', null],
    ['cancelled', 'group_1'],
  ])('accepts a %s request with group %s', (status, groupId) => {
    expect(accepts(OwnRideRequestSchema, { ...ownRide, status, groupId })).toBe(true);
  });

  it('keeps the exact origin and its source for the owner', () => {
    const manual = { ...ownRide, origin: { coordinates: exactPoint, source: 'manual' } };
    expect(OwnRideRequestSchema.parse(manual)).toEqual(manual);
  });

  it.each([
    ['an active request with a group', { ...ownRide, groupId: 'group_1' }],
    ['a grouped request without a group', { ...ownRide, status: 'grouped' }],
    ['a completed request without a group', { ...ownRide, status: 'completed' }],
    ['an expired request with a group', { ...ownRide, status: 'expired', groupId: 'group_1' }],
    ['an omitted group instead of null', { ...ownRide, groupId: undefined }],
    ['an unknown status', { ...ownRide, status: 'departed' }],
    ['a missing origin', { ...ownRide, origin: undefined }],
    ['an echoed fix accuracy', { ...ownRide, origin: { ...ownRide.origin, accuracyMeters: 12 } }],
    ['a departure after expiry', { ...ownRide, departureAt: '2026-11-01T09:50:00Z' }],
    ['a phone number', { ...ownRide, phoneNumber: '+12025550142' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(OwnRideRequestSchema, value)).toBe(false);
  });
});

describe('CreateRideRequestInputSchema', () => {
  it('accepts a device fix and a confirmed manual point', () => {
    expect(CreateRideRequestInputSchema.parse(createInput)).toEqual(createInput);
    expect(
      accepts(CreateRideRequestInputSchema, { ...createInput, origin: { source: 'manual', coordinates: exactPoint } }),
    ).toBe(true);
  });

  it.each([
    ['a missing operation ID', { ...createInput, operationId: undefined }],
    ['an operation ID that is not a UUID', { ...createInput, operationId: 'retry-1' }],
    ['a departure outside the choices', { ...createInput, departureOffsetMinutes: 15 }],
    ['an absolute departure time', { ...createInput, departureAt: '2026-11-01T09:35:00Z' }],
    ['a whole place instead of its ID', { ...createInput, destinationPlaceId: undefined, destination: mall }],
    ['a fix worse than 100 metres', { ...createInput, origin: { ...createInput.origin, accuracyMeters: 150 } }],
    ['a public origin chosen by the client', { ...createInput, publicOrigin }],
    ['an owner ID supplied by the caller', { ...createInput, userId: 'user_rider_a' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(CreateRideRequestInputSchema, value)).toBe(false);
  });
});

describe('create, match and expire walkthrough', () => {
  // What a source serializer does: copy the public fields, never spread the owner view.
  const toPublic = ({ id, user, publicOrigin, destination, departureAt, expiresAt, version }: OwnRideRequestDto) => ({
    id,
    user,
    publicOrigin,
    destination,
    departureAt,
    expiresAt,
    version,
  });

  it('represents each step with the owner and public projections', () => {
    expect(accepts(CreateRideRequestInputSchema, createInput)).toBe(true);

    const created = OwnRideRequestSchema.parse(ownRide);
    const publicView = toPublic(created);
    expect(RideRequestSchema.parse(publicView)).toEqual(publicView);
    expect(accepts(NearbyItemSchema, { kind: 'ride', ...publicView })).toBe(true);
    expect(accepts(RideRequestSchema, created)).toBe(false);

    const matched = RideMatchSetSchema.parse({
      version: 2,
      matches: [{ target: { kind: 'ride', id: 'ride_2' }, level: 'excellent', additionalMinutes: 3, expiresAt: created.expiresAt }],
    });
    expect(matched.matches).toHaveLength(1);

    const expired = OwnRideRequestSchema.parse({ ...created, status: 'expired', version: created.version + 1 });
    expect(expired.groupId).toBeNull();
    expect(RideMatchSetSchema.parse({ version: matched.version + 1, matches: [] }).matches).toEqual([]);
  });
});

describe('CancelRideRequestInputSchema', () => {
  it('accepts an operation ID and an expected version', () => {
    expect(CancelRideRequestInputSchema.parse(cancelInput)).toEqual(cancelInput);
  });

  it.each([
    ['a missing expected version', { operationId: cancelInput.operationId }],
    ['a version of 0', { ...cancelInput, expectedVersion: 0 }],
    ['a missing operation ID', { expectedVersion: 1 }],
    ['a requested status', { ...cancelInput, status: 'cancelled' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(CancelRideRequestInputSchema, value)).toBe(false);
  });
});
