// jest-expo already transforms Expo and React Native packages inside pnpm's `.pnpm` store, so
// its default `transformIgnorePatterns` is kept.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Tests live outside `app/`, where Expo Router would treat them as routes.
  testMatch: ['<rootDir>/tests/**/*.test.ts?(x)'],
};
