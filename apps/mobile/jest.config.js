// jest-expo already transforms Expo and React Native packages inside pnpm's `.pnpm` store, so
// its default `transformIgnorePatterns` is kept.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Tests live outside `app/`, where Expo Router would treat them as routes.
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
  // React Native's preset already mocks some APIs, such as `AccessibilityInfo`, with shared
  // `jest.fn`s. `jest.spyOn` returns that same mock and `restoreAllMocks` does not reset it, so
  // recorded calls are cleared before every test instead.
  clearMocks: true,
};
