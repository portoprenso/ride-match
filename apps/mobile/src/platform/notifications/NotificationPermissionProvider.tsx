import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

import type {
  NotificationPermissionController,
  NotificationPermissionStatus,
} from './createNotificationPermissionController';

const NotificationPermissionContext = createContext<NotificationPermissionController | null>(null);

/** Gives screens the app's one notification-permission controller. */
export function NotificationPermissionProvider({
  controller,
  children,
}: {
  controller: NotificationPermissionController;
  children: ReactNode;
}) {
  return <NotificationPermissionContext.Provider value={controller}>{children}</NotificationPermissionContext.Provider>;
}

export function useNotificationPermissionController(): NotificationPermissionController {
  const controller = useContext(NotificationPermissionContext);
  if (controller === null)
    throw new Error('useNotificationPermissionController needs a NotificationPermissionProvider.');
  return controller;
}

/** The notification permission, re-rendering when it changes (after the prompt or a foreground read). */
export function useNotificationPermission(): NotificationPermissionStatus {
  const controller = useNotificationPermissionController();
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
