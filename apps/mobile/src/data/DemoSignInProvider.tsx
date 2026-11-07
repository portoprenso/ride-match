import { createContext, use, type ReactNode } from 'react';

import type { DemoSignIn } from './DemoSignIn';

// `undefined` outside a provider; `null` inside one when the data source is not synthetic.
const DemoSignInContext = createContext<DemoSignIn | null | undefined>(undefined);

/** Makes the data source's demo sign-in, or its absence, available to `useDemoSignIn()` below it. */
export function DemoSignInProvider({ value, children }: { value: DemoSignIn | null; children: ReactNode }) {
  return <DemoSignInContext value={value}>{children}</DemoSignInContext>;
}

/**
 * Returns the demo sign-in of a synthetic data source, or `null` for a real one.
 *
 * @throws {Error} Outside a {@link DemoSignInProvider}, which is a programming error.
 */
export function useDemoSignIn(): DemoSignIn | null {
  const value = use(DemoSignInContext);
  if (value === undefined) throw new Error('useDemoSignIn() must be called inside a DemoSignInProvider.');
  return value;
}
