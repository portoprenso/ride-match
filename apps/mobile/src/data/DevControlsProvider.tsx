import { createContext, use, type ReactNode } from 'react';

import type { DevControls } from './DevControls';

// `undefined` outside a provider; `null` inside one when this build has no demo controls.
const DevControlsContext = createContext<DevControls | null | undefined>(undefined);

type DevControlsProviderProps = {
  /** The composition's demo controls, or `null` in builds without them. */
  controls: DevControls | null;
  children: ReactNode;
};

/** Makes the demo controls, or their absence, available to `useDevControls()` below it. */
export function DevControlsProvider({ controls, children }: DevControlsProviderProps) {
  return <DevControlsContext value={controls}>{children}</DevControlsContext>;
}

/**
 * Returns the demo controls, or `null` when this build has none: production builds and the API
 * data source. Screens that offer them must handle `null`.
 *
 * @throws {Error} Outside a {@link DevControlsProvider}, which is a programming error.
 */
export function useDevControls(): DevControls | null {
  const controls = use(DevControlsContext);
  if (controls === undefined) throw new Error('useDevControls() must be called inside a DevControlsProvider.');
  return controls;
}
