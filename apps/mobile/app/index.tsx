import { useRouter } from 'expo-router';

import { HomeLocationPanel, useLocationIntro } from '../src/features/location/HomeLocation';
import { LocationIntroScreen } from '../src/features/location/LocationIntroScreen';
import { MapPlaceholderScreen } from '../src/features/map/MapPlaceholderScreen';

export default function HomeRoute() {
  const router = useRouter();
  const intro = useLocationIntro();

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
    <MapPlaceholderScreen onSignIn={() => router.push('/auth/phone')}>
      <HomeLocationPanel />
    </MapPlaceholderScreen>
  );
}
