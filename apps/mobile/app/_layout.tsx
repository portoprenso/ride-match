import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { ConfigurationErrorScreen } from '../src/bootstrap/ConfigurationErrorScreen';
import { composeAppDataSource } from '../src/bootstrap/composeAppDataSource';
import { createQueryClient } from '../src/bootstrap/createQueryClient';
import { DataSourceProvider } from '../src/data/DataSourceProvider';
import { DevControlsProvider } from '../src/data/DevControlsProvider';
import { LocationChoicesProvider } from '../src/features/location/LocationChoicesProvider';
import { createLocationController } from '../src/platform/location/createLocationController';
import { LocationProvider } from '../src/platform/location/LocationProvider';

// Home is the base screen, so a deep link to any other route still has the map beneath it to
// return to.
export const unstable_settings = { anchor: 'index' };

// Screens draw their own titles and actions, so no native header is shown. Screens with a
// header would also need to leave the top inset to it (see `Screen`).
export default function RootLayout() {
  // Composed once per launch. A configuration that cannot run replaces every route.
  const [composition] = useState(() => composeAppDataSource());
  const [queryClient] = useState(createQueryClient);
  // Releases the simulator's timers and listeners if the root ever unmounts, as in a Fast
  // Refresh remount or a test.
  useEffect(() => (composition.status === 'ready' ? composition.dispose : undefined), [composition]);
  // The one location controller. It reads the permission without prompting; only the location
  // introduction or the home card shows the OS prompt.
  const [location] = useState(() => createLocationController());
  useEffect(() => {
    if (composition.status !== 'ready') return undefined;
    location.start();
    return () => location.dispose();
  }, [composition, location]);

  if (composition.status === 'failed') return <ConfigurationErrorScreen error={composition.error} />;

  return (
    <DataSourceProvider dataSource={composition.dataSource}>
      <DevControlsProvider controls={composition.devControls}>
        <QueryClientProvider client={queryClient}>
          <LocationProvider controller={location}>
            <LocationChoicesProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
              </Stack>
            </LocationChoicesProvider>
          </LocationProvider>
        </QueryClientProvider>
      </DevControlsProvider>
    </DataSourceProvider>
  );
}
