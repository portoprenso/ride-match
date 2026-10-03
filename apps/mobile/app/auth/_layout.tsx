import { Stack } from 'expo-router';

// Phone is the first step, so opening /auth/otp directly still has the phone step beneath it.
export const unstable_settings = { anchor: 'phone' };

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
