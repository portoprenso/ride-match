import { useRouter } from 'expo-router';

import { UnavailableScreen } from '../../../src/ui/UnavailableScreen';

// Inert until GROUP-002. The group ID is deliberately not read: membership is never inferred
// from a route parameter, and every ID, malformed or not, shows the same unavailable state.
export default function GroupRoute() {
  const router = useRouter();
  return (
    <UnavailableScreen
      title="Group"
      message="Group details are not available yet."
      onGoHome={() => router.dismissTo('/')}
    />
  );
}
