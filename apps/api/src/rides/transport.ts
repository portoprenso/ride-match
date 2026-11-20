import { NearbyQueryInputSchema } from '@ride-match/contracts';
import type { NearbyQueryInput } from '@ride-match/contracts';
import { domainError } from './store.js';

/** Validates a mutation's stable intent header without accepting missing/multiple keys. */
export function requireOperationKey(header: string | undefined, operationId: string): void {
  if (header !== operationId) throw domainError('VALIDATION_FAILED', 422, 'Idempotency key must match operation ID.');
}

/** Whitelisted dotted GET encoding, preserving strict rejection of duplicate/unknown query fields. */
export function parseNearbyQuery(query: Record<string, unknown>): NearbyQueryInput {
  const keys = ['viewport.southWest.latitude', 'viewport.southWest.longitude', 'viewport.northEast.latitude', 'viewport.northEast.longitude', 'destinationPlaceId', 'departureOffsetMinutes', 'limit'];
  if (Object.entries(query).some(([key, value]) => !keys.includes(key) || typeof value !== 'string')) throw domainError('VALIDATION_FAILED', 422, 'Invalid discovery query.');
  const number = (key: string) => typeof query[key] === 'string' && /^-?\d+(\.\d+)?$/.test(query[key]) ? Number(query[key]) : NaN;
  const parsed = NearbyQueryInputSchema.safeParse({
    viewport: {
      southWest: { latitude: number('viewport.southWest.latitude'), longitude: number('viewport.southWest.longitude') },
      northEast: { latitude: number('viewport.northEast.latitude'), longitude: number('viewport.northEast.longitude') },
    },
    ...(query.destinationPlaceId !== undefined ? { destinationPlaceId: query.destinationPlaceId } : {}),
    ...(query.departureOffsetMinutes !== undefined ? { departureOffsetMinutes: number('departureOffsetMinutes') } : {}), limit: number('limit'),
  });
  if (!parsed.success) throw domainError('VALIDATION_FAILED', 422, 'Invalid discovery query.');
  return parsed.data;
}
