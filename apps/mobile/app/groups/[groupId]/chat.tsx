import { useRouter } from 'expo-router';

import { UnavailableScreen } from '../../../src/ui/UnavailableScreen';

// Inert until CHAT-001. Like the group route, it never reads the group ID.
export default function GroupChatRoute() {
  const router = useRouter();
  return (
    <UnavailableScreen
      title="Group chat"
      message="Group chat is not available yet."
      onGoHome={() => router.dismissTo('/')}
    />
  );
}
