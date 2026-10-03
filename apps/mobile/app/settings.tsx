import { useRouter } from 'expo-router';

import { UnavailableScreen } from '../src/ui/UnavailableScreen';

// Inert: no session, permission, or blocked-user controls until the features behind them exist.
export default function SettingsRoute() {
  const router = useRouter();
  return (
    <UnavailableScreen
      title="Settings"
      message="Settings are not available yet."
      onGoHome={() => router.dismissTo('/')}
    />
  );
}
