import { useRouter } from 'expo-router';

import { MapPlaceholderScreen } from '../src/features/map/MapPlaceholderScreen';

export default function HomeRoute() {
  const router = useRouter();
  return <MapPlaceholderScreen onSignIn={() => router.push('/auth/phone')} />;
}
