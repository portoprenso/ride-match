import { Stack } from 'expo-router';

// Temporary: checks that the shared contracts package resolves (see the module's comment).
import '../src/bootstrap/checkContractsPackage';

// Home is the base screen, so a deep link to any other route still has the map beneath it to
// return to.
export const unstable_settings = { anchor: 'index' };

// Screens draw their own titles and actions, so no native header is shown. Screens with a
// header would also need to leave the top inset to it (see `Screen`).
export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
