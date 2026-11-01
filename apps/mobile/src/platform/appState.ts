/**
 * The part of React Native's `AppState` that lifecycle code uses (location observation,
 * analytics sessions), so tests can supply their own. `AppState` itself fits it.
 */
export type AppStateSource = {
  currentState: string;
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
};
