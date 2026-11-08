import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChatScreen } from '../../../src/features/chat/ChatScreen';

// Like the group route, the ID is only sent to the source, which decides whether the viewer may
// read the chat; it is never shown.
export default function GroupChatRoute() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const id = typeof groupId === 'string' ? groupId : undefined;
  return (
    <ChatScreen
      groupId={id}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else if (id !== undefined) router.replace({ pathname: '/groups/[groupId]', params: { groupId: id } });
        else router.dismissTo('/');
      }}
      onGoHome={() => router.dismissTo('/')}
    />
  );
}
