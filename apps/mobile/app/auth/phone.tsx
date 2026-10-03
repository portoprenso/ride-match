import { useRouter } from 'expo-router';

import { PhonePlaceholder } from '../../src/features/auth/AuthPlaceholderScreens';

export default function PhoneRoute() {
  const router = useRouter();
  return (
    <PhonePlaceholder
      onPreviewCode={() => router.push('/auth/otp')}
      onClose={() => router.dismissTo('/')}
    />
  );
}
