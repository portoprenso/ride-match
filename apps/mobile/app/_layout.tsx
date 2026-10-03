import { Stack } from 'expo-router';

// Temporary: checks that the shared contracts package resolves (see the module's comment).
import '../src/bootstrap/checkContractsPackage';

// Home is the base screen, so a deep link into /auth still has the map beneath it to return to.
export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}
