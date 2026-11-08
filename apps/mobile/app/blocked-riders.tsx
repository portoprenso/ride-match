import { useRouter } from 'expo-router';

import { BlockedRidersScreen } from '../src/features/safety/BlockedRidersScreen';

// The signed-in rider's own block list; the route carries no parameters.
export default function BlockedRidersRoute() {
  const router = useRouter();
  return (
    <BlockedRidersScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
      onSignIn={() => router.push('/auth/phone')}
    />
  );
}
