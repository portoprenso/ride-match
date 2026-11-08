import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { parseSignOutOutcome } from '../src/features/auth/signOutOutcome';
import { SettingsScreen } from '../src/features/settings/SettingsScreen';

export default function SettingsRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  // Only an outcome code, set by the reset below; a deep link with anything else shows nothing.
  const { signedOut } = useLocalSearchParams<{ signedOut?: string }>();

  return (
    <SettingsScreen
      onBack={() => (router.canGoBack() ? router.back() : router.dismissTo('/'))}
      onSignIn={() => router.push('/auth/phone')}
      onOpenBlockedRiders={() => router.push('/blocked-riders')}
      onSignedOut={(outcome) =>
        // Rebuilds the root stack as the map with settings on top, so no screen that showed the
        // rider's private data stays beneath.
        navigation.reset({
          index: 1,
          routes: [
            { name: 'index' as never },
            {
              name: 'settings' as never,
              params: { signedOut: outcome } as never,
            },
          ],
        })
      }
      signOutOutcome={parseSignOutOutcome(signedOut)}
    />
  );
}
