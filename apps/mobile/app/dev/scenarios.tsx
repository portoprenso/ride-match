import { useRouter } from 'expo-router';

import { isDevelopmentMode } from '../../src/config/isDevelopmentMode';
import { UnavailableScreen } from '../../src/ui/UnavailableScreen';

// Development builds reach an inert placeholder; other builds get an unavailable state rather
// than a redirect. No scenario exists or runs yet.
export default function ScenariosRoute() {
  const router = useRouter();
  const goHome = () => router.dismissTo('/');

  if (!isDevelopmentMode()) {
    return (
      <UnavailableScreen
        title="Not available"
        message="This page is only available in development builds."
        onGoHome={goHome}
      />
    );
  }

  return (
    <UnavailableScreen
      title="Mock scenarios"
      message="Scenario switching is not available yet, and no scenario is running."
      onGoHome={goHome}
    />
  );
}
