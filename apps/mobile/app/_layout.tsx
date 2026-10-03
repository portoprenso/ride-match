import { Stack } from 'expo-router';

// Temporary: checks that the shared contracts package resolves (see the module's comment).
import '../src/bootstrap/checkContractsPackage';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
