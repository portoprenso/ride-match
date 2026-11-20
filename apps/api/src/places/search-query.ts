import { SearchPlacesInputSchema } from '@ride-match/contracts';
import type { SearchPlacesInput } from '@ride-match/contracts';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { ApiException } from '../http/api-exception.js';

const keys = ['query', 'area.center.latitude', 'area.center.longitude', 'area.radiusMeters', 'limit'];

/** Reconstructs only documented dotted keys. Duplicates, unknown keys and non-finite numbers fail. */
export function parsePlaceQuery(query: Record<string, unknown>): SearchPlacesInput {
  if (Object.entries(query).some(([key, value]) => !keys.includes(key) || typeof value !== 'string')) {
    throw new ApiException({ code: 'VALIDATION_FAILED', message: 'Invalid search query.' }, 422);
  }
  const number = (key: string) => {
    const value = query[key];
    return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  };
  return new ZodValidationPipe(SearchPlacesInputSchema).transform({
    ...(query.query !== undefined ? { query: query.query } : {}),
    area: { center: { latitude: number('area.center.latitude'), longitude: number('area.center.longitude') }, radiusMeters: number('area.radiusMeters') },
    limit: number('limit'),
  });
}
