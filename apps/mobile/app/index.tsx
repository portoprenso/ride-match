import { useRouter } from 'expo-router';

import { useDevControls } from '../src/data/DevControlsProvider';
import { useSessionState } from '../src/features/auth/AuthSessionProvider';
import { useLocationIntro } from '../src/features/location/HomeLocation';
import { LocationIntroScreen } from '../src/features/location/LocationIntroScreen';
import { MapHomeScreen } from '../src/features/map/MapHomeScreen';

export default function HomeRoute() {
  const router = useRouter();
  const intro = useLocationIntro();
  const devControls = useDevControls();
  const signedIn = useSessionState().status === 'signed-in';

  if (intro.visible) {
    return (
      <LocationIntroScreen
        onUseLocation={intro.askForLocation}
        onChooseArea={intro.chooseArea}
        busy={intro.asking}
        error={intro.error}
      />
    );
  }
  return (
    <MapHomeScreen
      onSignIn={signedIn ? undefined : () => router.push('/auth/phone')}
      onOpenDemo={devControls === null ? undefined : () => router.push('/dev/scenarios')}
      onOpenSettings={() => router.push('/settings')}
    />
  );
}
