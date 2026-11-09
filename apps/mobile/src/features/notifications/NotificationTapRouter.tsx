import { useQueryClient } from '@tanstack/react-query';
import { useNavigationContainerRef, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useDataSource } from '../../data/DataSourceProvider';
import type { LocalNotifications } from '../../platform/notifications/localNotifications';
import { useSessionController } from '../auth/AuthSessionProvider';
import { createNotificationTapCoordinator } from './createNotificationTapCoordinator';
import { resolveNotification, type NotificationDestination } from './notificationEntry';

/** How often a destination waits for the navigator to finish mounting (a cold start). */
const NAVIGATION_WAIT_MS = 50;

/**
 * Routes notification taps (NOTIFICATION-001-C) for the whole app, warm or cold. Renders nothing;
 * the root layout mounts it once, beside its stack.
 *
 * Each destination is opened over the map, never over whatever was open: the stack goes back to
 * home first, then the target is pushed (a chat above its group), so repeated taps don't pile up
 * screens and "Back" always leads somewhere the rider may see. A destination reached before the
 * navigator is ready waits for it.
 */
export function NotificationTapRouter({ notifications }: { notifications: LocalNotifications }) {
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const session = useSessionController();
  const dataSource = useDataSource();
  const queryClient = useQueryClient();

  useEffect(() => {
    let disposed = false;
    let waiting: ReturnType<typeof setTimeout> | null = null;
    const navigate = (destination: NotificationDestination) => {
      if (disposed) return;
      if (!navigation.isReady()) {
        waiting = setTimeout(() => navigate(destination), NAVIGATION_WAIT_MS);
        return;
      }
      if (router.canDismiss()) router.dismissTo('/');
      switch (destination.kind) {
        case 'home':
          return;
        case 'unavailable':
          router.push('/notification-unavailable');
          return;
        case 'group':
          router.push({ pathname: '/groups/[groupId]', params: { groupId: destination.groupId } });
          return;
        case 'chat':
          router.push({ pathname: '/groups/[groupId]', params: { groupId: destination.groupId } });
          router.push({ pathname: '/groups/[groupId]/chat', params: { groupId: destination.groupId } });
          return;
      }
    };
    const coordinator = createNotificationTapCoordinator({
      notifications,
      session,
      resolve: (payload, viewer) => resolveNotification(payload, viewer, dataSource, queryClient),
      open: navigate,
    });
    coordinator.start();
    return () => {
      disposed = true;
      if (waiting !== null) clearTimeout(waiting);
      coordinator.dispose();
    };
  }, [notifications, session, dataSource, queryClient, router, navigation]);

  return null;
}
