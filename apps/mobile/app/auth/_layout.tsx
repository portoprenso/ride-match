import { Stack } from 'expo-router';

import { SignInFlow } from '../../src/features/auth/SignInFlow';

// Phone is the first step, so opening /auth/otp directly still has the phone step beneath it.
export const unstable_settings = { anchor: 'phone' };

// The sign-in flow keeps the number and challenge in memory between its screens, closes itself
// once a rider is signed in, and tells the pending-intent gate when it closes without sign-in.
export default function AuthLayout() {
  return (
    <SignInFlow>
      <Stack screenOptions={{ headerShown: false }} />
    </SignInFlow>
  );
}
