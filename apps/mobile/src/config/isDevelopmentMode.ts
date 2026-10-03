/**
 * Reports whether this is a React Native development build (`__DEV__`).
 *
 * Gates development-only routes such as `/dev/scenarios`. Read the flag only through this
 * function, at render time, so tests can override it without mocking navigation; Jest runs
 * with `__DEV__` set to true. DATA-001 replaces this check with validated environment and
 * data-source gating.
 */
export function isDevelopmentMode(): boolean {
  return __DEV__;
}
