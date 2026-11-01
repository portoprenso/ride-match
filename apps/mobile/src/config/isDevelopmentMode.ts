/**
 * Reports whether this is a React Native development build (`__DEV__`).
 *
 * Gates development-only routes such as `/dev/scenarios`. Read the flag only through this
 * function, at render time, so tests can override it without mocking navigation; Jest runs
 * with `__DEV__` set to true. The validated build configuration (`appConfig.ts`, DATA-001-A)
 * now exists; the card that builds the scenario controls (MOCK-001-C) decides whether to gate
 * them on it instead, as development or preview builds with the mock data source.
 */
export function isDevelopmentMode(): boolean {
  return __DEV__;
}
