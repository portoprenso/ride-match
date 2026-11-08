/*
 * Expo SecureStore has no native module under Jest. Route tests render the real root layout,
 * whose session controller clears the demo credential at launch, so every test gets this
 * in-memory stand-in. Each test file starts with an empty store; tests that need a failing store
 * replace a call with `jest.mocked(SecureStore.…)`.
 */
jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 6,
    getItemAsync: jest.fn(async (key: string) => items.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      items.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      items.delete(key);
    }),
  };
});
