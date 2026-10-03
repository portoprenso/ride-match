import { act } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

// Resolved from the working directory. The mobile `test` script runs in `apps/mobile`, which
// jest-expo also requires because it reads the Babel setup from there.
const APP_DIR = './app';

/**
 * Renders the real `app/` routes, layouts, and settings at `initialUrl`, as a deep link would.
 *
 * Testing Library 14 renders asynchronously, while Expo Router attaches its route helpers to
 * the returned promise; this waits for the render and exposes only the helpers the tests use.
 * `renderRouter` also switches Jest to fake timers, which {@link flushTimersAndRestore} undoes.
 */
export async function renderApp(initialUrl: string) {
  const result = renderRouter(APP_DIR, { initialUrl });
  await result;
  return {
    getPathname: () => result.getPathname(),
    /** Route names in the root layout's stack, bottom first (Expo Router nests it in `__root`). */
    getRootStack: () =>
      result.getRouterState()?.routes[0]?.state?.routes.map((route) => route.name) ?? [],
  };
}

/**
 * Runs the timers the router left pending, checks that none rescheduled themselves, then
 * restores real timers.
 *
 * Call it after each router test, once Testing Library has unmounted the tree, so no navigation
 * timer outlives its test. The fake timers also fake `queueMicrotask`, which React's `act()`
 * uses for its own follow-up check, so those microtasks are run before counting.
 */
export async function flushTimersAndRestore() {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  jest.runAllTicks();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
}
