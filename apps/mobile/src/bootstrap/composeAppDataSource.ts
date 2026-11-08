import type { InstallationId } from '@ride-match/contracts';
import Constants from 'expo-constants';
import type { QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { AppConfigError, readAppConfig, type AppConfig } from '../config/appConfig';
import type { AppDataSource } from '../data/AppDataSource';
import { createDataSource, type DataSourceFactories } from '../data/createDataSource';
import { createSyncCoordinator, type SyncCoordinator } from '../data/createSyncCoordinator';
import { DataSourceUnavailableError } from '../data/errors';
import type { DemoSignIn } from '../data/DemoSignIn';
import type { DevControls } from '../data/DevControls';
import { createSessionController, type SessionController } from '../features/auth/createSessionController';
import { createPendingIntentGate, type PendingIntentGate } from '../features/auth/pendingIntent';
import { sessionViewerSource } from '../features/auth/sessionViewer';
import type { AppStateSource } from '../platform/appState';
import { createMockDataSource, createMockSimulator } from '../data/mock/createMockDataSource';
import { MOCK_DEMO_SIGN_IN } from '../data/mock/auth';
import { createMockDevControls } from '../data/mock/createMockDevControls';
import { startMockPush, type PushDelivery } from '../data/mock/push';
import { isMockScenarioKey, MOCK_SCENARIO_KEYS } from '../data/mock/scenarios';
import { createOperationId } from '../data/operationId';
import {
  createNotificationPermissionController,
  type NotificationPermissionController,
} from '../platform/notifications/createNotificationPermissionController';
import { createInstallationIdSource } from '../platform/notifications/installationId';
import { createLocalNotifications, type LocalNotifications } from '../platform/notifications/localNotifications';
import { createSecureCredentialStore, type CredentialStore } from '../platform/secureStorage/credentialStore';
import { createAnalytics, type Analytics } from '../analytics/createAnalytics';
import { selectAnalyticsSink } from '../analytics/sinks';
import { clearNotificationsOnSignOut } from './clearNotificationsOnSignOut';
import { createQueryClient } from './createQueryClient';
import { syncPushRegistration, type PushRegistration } from './syncPushRegistration';
import { withSessionRenewal } from './withSessionRenewal';

/**
 * The data source the app runs on, the auth session that supplies its access token, the Query
 * cache and the sync coordinator that keeps it true to the session and the connection, and the
 * release of what they hold, or why this build's configuration cannot run.
 */
export type AppComposition =
  | {
      status: 'ready';
      dataSource: AppDataSource;
      session: SessionController;
      /** Keeps a protected action across sign-in (AUTH-001-C). */
      pendingIntents: PendingIntentGate;
      queryClient: QueryClient;
      sync: SyncCoordinator;
      dispose: () => void;
      devControls: DevControls | null;
      demoSignIn: DemoSignIn | null;
      /**
       * The analytics client (MAP-002-A, the first instrumented card): memory in development and
       * preview, nothing in production; never sent anywhere. The root layout starts it.
       */
      analytics: Analytics;
      /** The local-notification boundary; the root layout configures its presentation at launch. */
      notifications: LocalNotifications;
      /** The notification permission, read at launch and on foreground, never prompted for unasked. */
      notificationPermission: NotificationPermissionController;
    }
  | { status: 'failed'; error: AppConfigError | DataSourceUnavailableError };

/**
 * The data-source builders. The mock one also starts the mock push service, whose deliveries go
 * to `deliverPush` (NOTIFICATION-001-B).
 */
const createFactories = (deliverPush: PushDelivery): DataSourceFactories => ({
  mock({ scenario, devControls, accessToken }) {
    // The configuration checks only the key's format; the simulator knows which scenarios exist.
    if (!isMockScenarioKey(scenario)) {
      throw new AppConfigError([
        `EXPO_PUBLIC_MOCK_SCENARIO is ${JSON.stringify(scenario)}; use one of ${MOCK_SCENARIO_KEYS.join(', ')}.`,
      ]);
    }
    const simulator = createMockSimulator(scenario);
    const stopPush = startMockPush(simulator, deliverPush);
    return {
      dataSource: createMockDataSource(simulator, { accessToken }),
      dispose: () => {
        stopPush();
        simulator.dispose();
      },
      devControls: devControls ? createMockDevControls(simulator, scenario) : null,
      demoSignIn: MOCK_DEMO_SIGN_IN,
    };
  },
});

/**
 * Starting a demo scenario signs everyone out of the simulator and ends every subscription, so
 * the demo controls then forget the app's session (otherwise the app would keep sending
 * credentials of a world that no longer exists) and subscribe again into the new world.
 */
function resetOnScenarioStart(controls: DevControls, session: SessionController, sync: SyncCoordinator): DevControls {
  const afterStart = () => {
    void session.discard();
    sync.resetWorld();
  };
  return {
    ...controls,
    selectScenario(key) {
      controls.selectScenario(key);
      afterStart();
    },
    reset() {
      controls.reset();
      afterStart();
    },
  };
}

export type CompositionOptions = {
  /** Reads the configuration; tests pass their own. */
  readConfig?: () => AppConfig;
  /** The refresh-token store; the SecureStore one for the data source's namespace unless a test passes its own. */
  credentialStore?: CredentialStore;
  /** Foreground and background; React Native's `AppState` unless a test passes its own. */
  appState?: AppStateSource;
  /** The local-notification boundary; Expo Notifications unless a test passes its own. */
  notifications?: LocalNotifications;
  /** This installation's ID; stored in SecureStore unless a test passes its own. */
  installationId?: () => Promise<InstallationId>;
};

/**
 * The composition root: reads the build configuration and builds the one data source and the
 * auth session, once per app launch. The mock data source starts its scenario at once, timed
 * events included. The session starts when the root layout calls `restore()`; on the mock data
 * source it never resumes a stored session, because the simulator's world starts empty. The sync
 * coordinator starts when the root layout calls `sync.start()`.
 *
 * Demo controls exist only in development and preview builds on the mock data source; a
 * production build never creates them, so nothing in it can reach the simulator's controls.
 *
 * An invalid configuration, an unknown scenario or the unavailable API data source becomes a
 * `failed` composition, which the root layout shows instead of the app; any other error is a bug
 * and is rethrown. A `ready` composition must be disposed when the app's root unmounts.
 */
export function composeAppDataSource({
  readConfig = readAppConfig,
  credentialStore,
  appState = AppState,
  notifications = createLocalNotifications(),
  installationId = createInstallationIdSource(createOperationId),
}: CompositionOptions = {}): AppComposition {
  try {
    const config = readConfig();
    // The data source reads the token through this indirection, because the session that holds
    // it needs the data source's auth operations and is built just after it.
    let session: SessionController | null = null;
    // A push delivered to this installation shows as a local notification; others are another device's.
    const deliverPush: PushDelivery = (target, payload) => {
      void installationId().then((own) => (own === target ? notifications.present(payload) : undefined));
    };
    const composed = createDataSource(config.dataSource, createFactories(deliverPush), {
      devControls: config.appEnv !== 'production',
      accessToken: () => session?.getAccessToken() ?? null,
    });
    const built = createSessionController({
      auth: composed.dataSource.auth,
      store: credentialStore ?? createSecureCredentialStore(config.dataSource.kind),
      resumeStoredSession: config.dataSource.kind !== 'mock',
      beforeSignOut: () => registration?.removeBeforeSignOut() ?? Promise.resolve(),
    });
    session = built;
    // Features get the data source whose signed-in calls renew an expired access token once.
    const dataSource = withSessionRenewal(composed.dataSource, () => session);
    const pendingIntents = createPendingIntentGate(built);
    const queryClient = createQueryClient();
    const sync = createSyncCoordinator({
      queryClient,
      events: composed.dataSource.events,
      viewer: sessionViewerSource(built),
      appState,
    });
    // Local notifications belong to the rider signed in when they were made (NOTIFICATION-001-A).
    const stopClearingNotifications = clearNotificationsOnSignOut(built, notifications);
    const notificationPermission = createNotificationPermissionController(notifications, appState);
    // Only the mock source exists, so the token is synthetic: no real push token is requested.
    const registration: PushRegistration = syncPushRegistration({
      session: built,
      permission: notificationPermission,
      devices: dataSource.devices,
      installationId,
      pushToken: (id) => `ExponentPushToken[demo-${id}]`,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    const analytics = createAnalytics({
      sink: selectAnalyticsSink(config.appEnv),
      environment: config.appEnv,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      dataSource: config.dataSource,
      appState,
    });
    return {
      status: 'ready',
      dataSource,
      session: built,
      pendingIntents,
      queryClient,
      sync,
      devControls: composed.devControls && resetOnScenarioStart(composed.devControls, built, sync),
      demoSignIn: composed.demoSignIn,
      analytics,
      notifications,
      notificationPermission,
      dispose: () => {
        registration.dispose();
        notificationPermission.dispose();
        stopClearingNotifications();
        analytics.dispose();
        sync.dispose();
        queryClient.clear();
        pendingIntents.dispose();
        built.dispose();
        composed.dispose();
      },
    };
  } catch (error) {
    if (error instanceof AppConfigError || error instanceof DataSourceUnavailableError) {
      return { status: 'failed', error };
    }
    throw error;
  }
}
