import { useRouter } from 'expo-router';

import { PhoneScreen } from '../../src/features/auth/PhoneScreen';

export default function PhoneRoute() {
  const router = useRouter();
  return <PhoneScreen onCodeRequested={() => router.push('/auth/otp')} />;
}
