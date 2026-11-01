import { createContext, use, useSyncExternalStore, type ReactNode } from 'react';

import type { LocationController, LocationState } from './createLocationController';

const LocationContext = createContext<LocationController | null>(null);

type LocationProviderProps = {
  /** The app's one location controller; whoever creates it starts and disposes it. */
  controller: LocationController;
  children: ReactNode;
};

/** Makes the location controller available to `useLocationController()` and `useLocationState()` below it. */
export function LocationProvider({ controller, children }: LocationProviderProps) {
  return <LocationContext value={controller}>{children}</LocationContext>;
}

/**
 * Returns the location controller, for its actions (`requestPermission`, `refresh`, `observe`).
 *
 * @throws {Error} Outside a {@link LocationProvider}, which is a programming error.
 */
export function useLocationController(): LocationController {
  const controller = use(LocationContext);
  if (controller === null) throw new Error('useLocationController() must be called inside a LocationProvider.');
  return controller;
}

/**
 * Returns the current location state and re-renders on every change. Pass it to
 * `describeLocation` with the current time to decide what to show.
 */
export function useLocationState(): LocationState {
  const controller = useLocationController();
  return useSyncExternalStore(controller.subscribe, controller.getState);
}
