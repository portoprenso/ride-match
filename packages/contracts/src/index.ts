/**
 * Public entry point of the shared Ride Match transport contracts.
 *
 * Each module defines Zod runtime schemas (`FooSchema`) with their inferred types
 * (`FooDto`, or the plain name for scalars and inputs). Object schemas are strict: unknown
 * fields fail validation instead of passing through, so an accidental extra field (possibly
 * private data) is caught. Keep this package limited to transport contracts; UI state,
 * services, and backend-only logic belong elsewhere.
 */
export * from './common.js';
export * from './errors.js';
