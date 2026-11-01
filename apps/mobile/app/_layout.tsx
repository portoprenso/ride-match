import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { ConfigurationErrorScreen } from '../src/bootstrap/ConfigurationErrorScreen';
import { composeAppDataSource } from '../src/bootstrap/composeAppDataSource';
import { createQueryClient } from '../src/bootstrap/createQueryClient';
import { DataSourceProvider } from '../src/data/DataSourceProvider';

// Home is the base screen, so a deep link to any other route still has the map beneath it to
// return to.
export const unstable_settings = { anchor: 'index' };

// Screens draw their own titles and actions, so no native header is shown. Screens with a
// header would also need to leave the top inset to it (see `Screen`).
export default function RootLayout() {
  // Composed once per launch. A configuration that cannot run replaces every route.
  const [composition] = useState(() => composeAppDataSource());
  const [queryClient] = useState(createQueryClient);

  if (composition.status === 'failed') return <ConfigurationErrorScreen error={composition.error} />;

  return (
    <DataSourceProvider dataSource={composition.dataSource}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        </Stack>
      </QueryClientProvider>
    </DataSourceProvider>
  );
}
