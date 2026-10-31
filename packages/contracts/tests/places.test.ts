import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { PlaceSchema, PlaceSearchResultsSchema, SearchPlacesInputSchema } from '../src/index.js';

const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

// Synthetic curated places in the demo city.
const mall = {
  id: 'place_asia_mall',
  label: 'Asia Mall',
  detail: 'Chyngyz Aitmatov Avenue',
  coordinates: { latitude: 42.8556, longitude: 74.5859 },
};
const square = { id: 'place_ala_too', label: 'Ala-Too Square', detail: null, coordinates: { latitude: 42.8765, longitude: 74.6037 } };
const area = { center: { latitude: 42.87, longitude: 74.59 }, radiusMeters: 15_000 };
const search = { query: 'Asia', area, limit: 10 };

describe('PlaceSchema', () => {
  it('accepts a place with or without a detail line', () => {
    expect(PlaceSchema.parse(mall)).toEqual(mall);
    expect(accepts(PlaceSchema, square)).toBe(true);
  });

  it.each([
    ['an omitted detail instead of null', { id: mall.id, label: mall.label, coordinates: mall.coordinates }],
    ['an empty label', { ...mall, label: '' }],
    ['a label over 80 characters', { ...mall, label: 'x'.repeat(81) }],
    ['a detail over 120 characters', { ...mall, detail: 'x'.repeat(121) }],
    ['a label with a line break', { ...mall, label: 'Asia\nMall' }],
    ['an invalid ID', { ...mall, id: 'place asia mall' }],
    ['invalid coordinates', { ...mall, coordinates: { latitude: 91, longitude: 74.59 } }],
    ['missing coordinates', { id: mall.id, label: mall.label, detail: mall.detail }],
    ['a person-related field', { ...mall, userId: 'user_1' }],
    ['a distance from the searcher', { ...mall, distanceMeters: 850 }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(PlaceSchema, value)).toBe(false);
  });
});

describe('SearchPlacesInputSchema', () => {
  it('accepts a search with a query, and a search without one', () => {
    expect(SearchPlacesInputSchema.parse(search)).toEqual(search);
    expect(accepts(SearchPlacesInputSchema, { area, limit: 10 })).toBe(true);
  });

  it('accepts its limits at the boundaries', () => {
    expect(accepts(SearchPlacesInputSchema, { ...search, query: 'A' })).toBe(true);
    expect(accepts(SearchPlacesInputSchema, { ...search, query: 'x'.repeat(80) })).toBe(true);
    expect(accepts(SearchPlacesInputSchema, { ...search, limit: 1 })).toBe(true);
    expect(accepts(SearchPlacesInputSchema, { ...search, limit: 20 })).toBe(true);
    expect(accepts(SearchPlacesInputSchema, { ...search, area: { ...area, radiusMeters: 1_000 } })).toBe(true);
    expect(accepts(SearchPlacesInputSchema, { ...search, area: { ...area, radiusMeters: 50_000 } })).toBe(true);
  });

  it.each([
    ['an empty query', { ...search, query: '' }],
    ['a query over 80 characters', { ...search, query: 'x'.repeat(81) }],
    ['an untrimmed query', { ...search, query: 'Asia ' }],
    ['a query with a line break', { ...search, query: 'Asia\nMall' }],
    ['a null query instead of omitting it', { ...search, query: null }],
    ['a limit of 0', { ...search, limit: 0 }],
    ['a limit over 20', { ...search, limit: 21 }],
    ['a fractional limit', { ...search, limit: 2.5 }],
    ['a missing limit', { query: 'Asia', area }],
    ['a missing area', { query: 'Asia', limit: 10 }],
    ['a radius under 1,000 metres', { ...search, area: { ...area, radiusMeters: 999 } }],
    ['a radius over 50,000 metres', { ...search, area: { ...area, radiusMeters: 50_001 } }],
    ['a fractional radius', { ...search, area: { ...area, radiusMeters: 1_500.5 } }],
    ['a center out of range', { ...search, area: { ...area, center: { latitude: 91, longitude: 74.59 } } }],
  ])('rejects %s', (_label, value) => {
    expect(accepts(SearchPlacesInputSchema, value)).toBe(false);
  });

  it.each([
    ['a precise center', { ...search, area: { ...area, center: { latitude: 42.87563, longitude: 74.59 } } }],
    ['an exact device position', { ...search, area, origin: { latitude: 42.87563, longitude: 74.60371 } }],
    ['a location accuracy', { ...search, area: { ...area, accuracyMeters: 12 } }],
    ['a user ID', { ...search, userId: 'user_1' }],
  ])('rejects private or precise data: %s', (_label, value) => {
    expect(accepts(SearchPlacesInputSchema, value)).toBe(false);
  });
});

describe('PlaceSearchResultsSchema', () => {
  it('accepts an empty list and a list of distinct places', () => {
    expect(accepts(PlaceSearchResultsSchema, [])).toBe(true);
    expect(PlaceSearchResultsSchema.parse([mall, square])).toEqual([mall, square]);
  });

  it('accepts 20 places and rejects 21', () => {
    const places = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...square, id: `place_${index}` }));
    expect(accepts(PlaceSearchResultsSchema, places(20))).toBe(true);
    expect(accepts(PlaceSearchResultsSchema, places(21))).toBe(false);
  });

  it('rejects a place listed twice and an invalid place', () => {
    expect(accepts(PlaceSearchResultsSchema, [mall, square, mall])).toBe(false);
    expect(accepts(PlaceSearchResultsSchema, [mall, { ...square, label: '' }])).toBe(false);
  });
});
