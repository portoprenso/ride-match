import { useRouter } from 'expo-router';

import { OtpPlaceholder } from '../../src/features/auth/AuthPlaceholderScreens';

export default function OtpRoute() {
  const router = useRouter();
  return (
    <OtpPlaceholder
      onBack={() => router.dismissTo('/auth/phone')}
      onClose={() => router.dismissTo('/')}
    />
  );
}
