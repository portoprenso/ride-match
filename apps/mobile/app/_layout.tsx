import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { AnalyticsProvider } from '../src/analytics/AnalyticsProvider';
import { ConfigurationErrorScreen } from '../src/bootstrap/ConfigurationErrorScreen';
import { composeAppDataSource } from '../src/bootstrap/composeAppDataSource';
import { DataSourceProvider } from '../src/data/DataSourceProvider';
import { DemoSignInProvider } from '../src/data/DemoSignInProvider';
import { DevControlsProvider } from '../src/data/DevControlsProvider';
import { SyncProvider } from '../src/data/SyncProvider';
import { AuthSessionProvider } from '../src/features/auth/AuthSessionProvider';
import { PendingIntentProvider } from '../src/features/auth/PendingIntentProvider';
import { SessionExpiryRedirect } from '../src/features/auth/SessionExpiryRedirect';
import { LocationChoicesProvider } from '../src/features/location/LocationChoicesProvider';
import { NotificationTapRouter } from '../src/features/notifications/NotificationTapRouter';
import { createLocationController } from '../src/platform/location/createLocationController';
import { LocationProvider } from '../src/platform/location/LocationProvider';
import { NotificationPermissionProvider } from '../src/platform/notifications/NotificationPermissionProvider';

// Home is the base screen, so a deep link to any other route still has the map beneath it to
// return to.
export const unstable_settings = { anchor: 'index' };

// Screens draw their own titles and actions, so no native header is shown. Screens with a
// header would also need to leave the top inset to it (see `Screen`).
export default function RootLayout() {
  // Composed once per launch. A configuration that cannot run replaces every route.
  const [composition] = useState(() => composeAppDataSource());
  // Releases the simulator's timers and listeners if the root ever unmounts, as in a Fast
  // Refresh remount or a test.
  useEffect(() => (composition.status === 'ready' ? composition.dispose : undefined), [composition]);
  // Restores the stored session, or clears the demo one; browsing stays anonymous meanwhile. The
  // sync coordinator then follows the session, the connection and the foreground.
  useEffect(() => {
    if (composition.status !== 'ready') return;
    void composition.session.restore();
    composition.sync.start();
    // Sessions and their `app_opened` begin here; nothing is sent off the device.
    composition.analytics.start();
    // Notifications: how they show while the app is open, and the permission read without asking.
    composition.notifications.configurePresentation();
    composition.notificationPermission.start();
  }, [composition]);
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
    <AnalyticsProvider analytics={composition.analytics}>
      <DataSourceProvider dataSource={composition.dataSource}>
        <AuthSessionProvider controller={composition.session}>
          <PendingIntentProvider gate={composition.pendingIntents}>
            <DemoSignInProvider value={composition.demoSignIn}>
              <DevControlsProvider controls={composition.devControls}>
                <QueryClientProvider client={composition.queryClient}>
                  <SyncProvider coordinator={composition.sync}>
                    <LocationProvider controller={location}>
                      <NotificationPermissionProvider controller={composition.notificationPermission}>
                        <LocationChoicesProvider>
                          <Stack screenOptions={{ headerShown: false }}>
                            <Stack.Screen name="index" />
                            <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
                          </Stack>
                          <SessionExpiryRedirect />
                          <NotificationTapRouter notifications={composition.notifications} />
                        </LocationChoicesProvider>
                      </NotificationPermissionProvider>
                    </LocationProvider>
                  </SyncProvider>
                </QueryClientProvider>
              </DevControlsProvider>
            </DemoSignInProvider>
          </PendingIntentProvider>
        </AuthSessionProvider>
      </DataSourceProvider>
    </AnalyticsProvider>
  );
}
