import { useRouter } from 'expo-router';

import { SessionEndedScreen } from '../../src/features/auth/SessionEndedScreen';

export default function SessionEndedRoute() {
  const router = useRouter();
  return <SessionEndedScreen onSignIn={() => router.push('/auth/phone')} />;
}
