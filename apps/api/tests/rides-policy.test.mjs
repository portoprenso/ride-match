import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approximateOrigin, compatible, distanceMeters } from '../dist/rides/policy.js';
import { parseNearbyQuery, requireOperationKey } from '../dist/rides/transport.js';

test('public origins use one stable 0.02 degree cell, including world bounds', () => {
  const first = approximateOrigin({ latitude: 42.8753, longitude: 74.6067 });
  assert.deepEqual(first, approximateOrigin({ latitude: 42.8789, longitude: 74.6099 }));
  assert.equal(first.radiusMeters, 2000);
  for (const point of [{ latitude: 90, longitude: 180 }, { latitude: -90, longitude: -180 }, { latitude: 0, longitude: 0 }]) {
    const result = approximateOrigin(point);
    assert.ok(result.center.latitude >= -90 && result.center.latitude <= 90);
    assert.ok(result.center.longitude >= -180 && result.center.longitude <= 180);
    assert.ok(distanceMeters(result.center, point) < result.radiusMeters);
  }
});

test('matching is advisory coarse-place/time compatibility, not a route estimate', () => {
  const trip = { origin: { latitude: 42.87, longitude: 74.61 }, destinationId: 'test_place', departure: 1000000 };
  assert.equal(compatible(trip, trip), 'excellent');
  assert.equal(compatible(trip, { ...trip, destinationId: 'other_place' }), null);
  assert.equal(compatible(trip, { ...trip, departure: trip.departure + 300001 }), null);
  assert.equal(compatible(trip, { ...trip, origin: { latitude: 42, longitude: 74 } }), null);
});

test('nearby reconstruction rejects unknown, duplicate, nested or non-finite values and key mismatches', () => {
  const query = { 'viewport.southWest.latitude': '42.80', 'viewport.southWest.longitude': '74.50',
    'viewport.northEast.latitude': '42.95', 'viewport.northEast.longitude': '74.70', limit: '10' };
  assert.equal(parseNearbyQuery(query).limit, 10);
  for (const invalid of [{ ...query, unknown: 'x' }, { ...query, limit: ['1', '2'] }, { ...query, limit: 'Infinity' },
    { ...query, 'viewport.southWest.latitude': '42.801' }, { ...query, departureOffsetMinutes: '5' }]) {
    assert.throws(() => parseNearbyQuery(invalid), (error) => error.getStatus() === 422);
  }
  assert.doesNotThrow(() => requireOperationKey('synthetic-key', 'synthetic-key'));
  assert.throws(() => requireOperationKey(undefined, 'synthetic-key'), (error) => error.getStatus() === 422);
  assert.throws(() => requireOperationKey('other-key', 'synthetic-key'), (error) => error.getStatus() === 422);
});
