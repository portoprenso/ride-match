import { useRouter } from 'expo-router';

import { OtpScreen } from '../../src/features/auth/OtpScreen';

export default function OtpRoute() {
  const router = useRouter();
  return <OtpScreen onChangeNumber={() => router.dismissTo('/auth/phone')} />;
}
