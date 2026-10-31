import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CoarseCoordinatesSchema,
  CoordinatesSchema,
  ExactLocationInputSchema,
  MeetingPointSchema,
  OwnerLocationSchema,
  PublicLocationSchema,
  isLocationFixFresh,
} from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic points; no real rider location.
const point = { latitude: 43.24, longitude: 76.95 };
const deviceFix = {
  source: 'device',
  coordinates: point,
  accuracyMeters: 12,
  capturedAt: '2026-10-31T12:00:00Z',
};
const manualPoint = { source: 'manual', coordinates: point };
const publicArea = { center: { latitude: 43.25, longitude: 76.94 }, radiusMeters: 500, label: 'City centre' };
const meetingPoint = { id: 'mp_1', coordinates: point, label: 'Central Station, main entrance', walkingMinutes: 4 };

describe('CoordinatesSchema', () => {
  it.each([
    [-90, -180],
    [90, 180],
    [0, 0],
  ])('accepts latitude %d and longitude %d', (latitude, longitude) => {
    expect(accepts(CoordinatesSchema, { latitude, longitude })).toBe(true);
  });

  it.each([
    ['a latitude above 90', { ...point, latitude: 90.000001 }],
    ['a latitude below -90', { ...point, latitude: -90.5 }],
    ['a longitude above 180', { ...point, longitude: 180.000001 }],
    ['a longitude below -180', { ...point, longitude: -180.1 }],
    ['NaN', { ...point, latitude: Number.NaN }],
    ['infinity', { ...point, longitude: Number.POSITIVE_INFINITY }],
    ['a numeric string', { ...point, latitude: '43.24' }],
    ['a missing longitude', { latitude: 43.24 }],
    ['an extra altitude', { ...point, altitude: 800 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(CoordinatesSchema, value)).toBe(false);
  });
});

describe('CoarseCoordinatesSchema', () => {
  it.each([
    [42.87, 74.59],
    [43, 76.9],
    [-0.01, -179.99],
    [90, 180],
  ])('accepts latitude %d and longitude %d', (latitude, longitude) => {
    expect(accepts(CoarseCoordinatesSchema, { latitude, longitude })).toBe(true);
  });

  it('accepts what the documented rounding produces', () => {
    const round = (degrees: number) => Math.round(degrees * 100) / 100;
    expect(accepts(CoarseCoordinatesSchema, { latitude: round(42.87563), longitude: round(74.60371) })).toBe(true);
  });

  it.each([
    ['three decimals', { latitude: 42.875, longitude: 74.59 }],
    ['an exact device position', { latitude: 42.87563, longitude: 74.60371 }],
    ['unrounded arithmetic', { latitude: 0.1 + 0.2, longitude: 74.59 }],
    ['an out-of-range value', { latitude: 90.01, longitude: 74.59 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(CoarseCoordinatesSchema, value)).toBe(false);
  });
});

describe('ExactLocationInputSchema', () => {
  it('accepts a device fix and a manual point', () => {
    expect(ExactLocationInputSchema.parse(deviceFix)).toEqual(deviceFix);
    expect(ExactLocationInputSchema.parse(manualPoint)).toEqual(manualPoint);
  });

  it('accepts device accuracy from 0 to 100 metres', () => {
    expect(accepts(ExactLocationInputSchema, { ...deviceFix, accuracyMeters: 0 })).toBe(true);
    expect(accepts(ExactLocationInputSchema, { ...deviceFix, accuracyMeters: 100 })).toBe(true);
  });

  it.each([
    ['accuracy worse than 100 metres', { ...deviceFix, accuracyMeters: 100.01 }],
    ['approximate-permission accuracy', { ...deviceFix, accuracyMeters: 1_500 }],
    ['unknown accuracy', { ...deviceFix, accuracyMeters: null }],
    ['a negative accuracy', { ...deviceFix, accuracyMeters: -1 }],
    ['a device fix without accuracy', { source: 'device', coordinates: point, capturedAt: deviceFix.capturedAt }],
    ['a device fix without a capture time', { source: 'device', coordinates: point, accuracyMeters: 12 }],
    ['a capture time with an offset', { ...deviceFix, capturedAt: '2026-10-31T18:00:00+06:00' }],
    ['invalid coordinates', { ...deviceFix, coordinates: { ...point, latitude: 91 } }],
    ['sensor fields beyond the fix', { ...deviceFix, speed: 1.2, heading: 90, altitude: 800 }],
    ['an unknown source', { ...deviceFix, source: 'network' }],
    ['a missing source', { coordinates: point }],
    ['a manual point with accuracy', { ...manualPoint, accuracyMeters: 12 }],
    ['a manual point with a capture time', { ...manualPoint, capturedAt: deviceFix.capturedAt }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(ExactLocationInputSchema, value)).toBe(false);
  });
});

describe('isLocationFixFresh', () => {
  const now = '2026-10-31T12:01:00Z';

  it.each([
    ['taken now', '2026-10-31T12:01:00Z'],
    ['exactly 60 seconds old', '2026-10-31T12:00:00Z'],
    ['up to 10 seconds ahead of the source clock', '2026-10-31T12:01:10Z'],
  ])('accepts a fix %s', (_label, capturedAt) => {
    expect(isLocationFixFresh({ capturedAt }, now)).toBe(true);
  });

  it.each([
    ['older than 60 seconds', '2026-10-31T11:59:59.999Z'],
    ['more than 10 seconds ahead of the source clock', '2026-10-31T12:01:10.001Z'],
    ['with an unparseable time', 'not a time'],
  ])('rejects a fix %s', (_label, capturedAt) => {
    expect(isLocationFixFresh({ capturedAt }, now)).toBe(false);
  });
});

describe('OwnerLocationSchema', () => {
  it('accepts the owner exact point with its source', () => {
    expect(accepts(OwnerLocationSchema, { coordinates: point, source: 'device' })).toBe(true);
    expect(accepts(OwnerLocationSchema, { coordinates: point, source: 'manual' })).toBe(true);
  });

  it.each([
    ['an echoed accuracy', { coordinates: point, source: 'device', accuracyMeters: 12 }],
    ['an echoed capture time', { coordinates: point, source: 'device', capturedAt: deviceFix.capturedAt }],
    ['a missing source', { coordinates: point }],
    ['an unknown source', { coordinates: point, source: 'network' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(OwnerLocationSchema, value)).toBe(false);
  });
});

describe('PublicLocationSchema', () => {
  it('accepts an approximate area, with or without a label', () => {
    expect(PublicLocationSchema.parse(publicArea)).toEqual(publicArea);
    expect(accepts(PublicLocationSchema, { ...publicArea, label: null })).toBe(true);
  });

  it('accepts uncertainty radii from 200 to 5,000 metres', () => {
    expect(accepts(PublicLocationSchema, { ...publicArea, radiusMeters: 200 })).toBe(true);
    expect(accepts(PublicLocationSchema, { ...publicArea, radiusMeters: 5_000 })).toBe(true);
  });

  it.each([
    ['a radius below 200 metres', { ...publicArea, radiusMeters: 199 }],
    ['a zero radius, which claims a precise point', { ...publicArea, radiusMeters: 0 }],
    ['a radius above 5,000 metres', { ...publicArea, radiusMeters: 5_001 }],
    ['a fractional radius', { ...publicArea, radiusMeters: 250.5 }],
    ['an omitted label instead of null', { center: publicArea.center, radiusMeters: 500 }],
    ['an empty label', { ...publicArea, label: '' }],
    ['a label with surrounding whitespace', { ...publicArea, label: ' City centre' }],
    ['a label with a line break', { ...publicArea, label: 'City\ncentre' }],
    ['a label over 80 characters', { ...publicArea, label: 'x'.repeat(81) }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(PublicLocationSchema, value)).toBe(false);
  });

  it.each([
    ['exact coordinates', { ...publicArea, coordinates: point }],
    ['an accuracy', { ...publicArea, accuracyMeters: 12 }],
    ['a capture time', { ...publicArea, capturedAt: deviceFix.capturedAt }],
    ['a location source', { ...publicArea, source: 'device' }],
    ['a user ID', { ...publicArea, userId: 'user_1' }],
  ])('rejects a private field: %s', (_label, value) => {
    expect(accepts(PublicLocationSchema, value)).toBe(false);
  });

  it('rejects an exact location in place of a public one', () => {
    expect(accepts(PublicLocationSchema, deviceFix)).toBe(false);
    expect(accepts(PublicLocationSchema, manualPoint)).toBe(false);
    expect(accepts(PublicLocationSchema, { coordinates: point, source: 'device' })).toBe(false);
  });
});

describe('MeetingPointSchema', () => {
  it.each([0, 60, null])('accepts a walking estimate of %s', (walkingMinutes) => {
    expect(accepts(MeetingPointSchema, { ...meetingPoint, walkingMinutes })).toBe(true);
  });

  it.each([
    ['an estimate over 60 minutes', { ...meetingPoint, walkingMinutes: 61 }],
    ['a negative estimate', { ...meetingPoint, walkingMinutes: -1 }],
    ['a fractional estimate', { ...meetingPoint, walkingMinutes: 2.5 }],
    ['an omitted estimate instead of null', { id: 'mp_1', coordinates: point, label: meetingPoint.label }],
    ['a missing ID', { coordinates: point, label: meetingPoint.label, walkingMinutes: 4 }],
    ['an empty label', { ...meetingPoint, label: '' }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(MeetingPointSchema, value)).toBe(false);
  });

  it.each([
    ['member locations', { ...meetingPoint, memberLocations: [point] }],
    ['the viewer location behind the estimate', { ...meetingPoint, viewerLocation: point }],
    ['an accuracy', { ...meetingPoint, accuracyMeters: 12 }],
  ])('rejects a private field: %s', (_label, value) => {
    expect(accepts(MeetingPointSchema, value)).toBe(false);
  });
});
