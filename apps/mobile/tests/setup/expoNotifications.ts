/*
 * Expo Notifications has no native module under Jest. The composition root builds the
 * local-notification boundary for every route test, so each test file gets this inert stand-in:
 * nothing allowed, nothing scheduled, no tap. Tests of the boundary pass their own module to
 * `createLocalNotifications`.
 */
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DATE: 'date' },
  getPermissionsAsync: jest.fn(async () => ({
    status: 'undetermined',
    granted: false,
    canAskAgain: true,
    expires: 'never',
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: 'denied',
    granted: false,
    canAskAgain: false,
    expires: 'never',
  })),
  scheduleNotificationAsync: jest.fn(async () => 'notification'),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  dismissAllNotificationsAsync: jest.fn(async () => undefined),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
}));
