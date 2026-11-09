import { useRouter } from 'expo-router';

import { NotificationUnavailableScreen } from '../src/features/notifications/NotificationUnavailableScreen';

// Opened only by notification taps whose target can't be shown; it carries no parameters, so
// nothing about the notification reaches the route.
export default function NotificationUnavailableRoute() {
  const router = useRouter();
  return <NotificationUnavailableScreen onGoHome={() => router.dismissTo('/')} />;
}
