import { useRouter } from 'expo-router';

import { useDevControls } from '../../src/data/DevControlsProvider';
import { DemoScenariosScreen } from '../../src/features/demo/DemoScenariosScreen';
import { UnavailableScreen } from '../../src/ui/UnavailableScreen';

// Builds without demo controls (production, or no mock data source) get an unavailable state
// rather than a redirect.
export default function ScenariosRoute() {
  const router = useRouter();
  const controls = useDevControls();

  if (controls === null) {
    return (
      <UnavailableScreen
        title="Not available"
        message="Demo scenarios are only available in development and preview builds that use mock data."
        onGoHome={() => router.dismissTo('/')}
      />
    );
  }

  return <DemoScenariosScreen controls={controls} onBack={() => router.back()} />;
}
