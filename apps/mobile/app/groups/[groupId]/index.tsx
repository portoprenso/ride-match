import { useLocalSearchParams, useRouter } from 'expo-router';

import { GroupScreen } from '../../../src/features/groups/GroupScreen';

// The group ID is only sent to the source, which decides whether the viewer may see the group;
// membership is never inferred from the route, and the ID is never shown.
export default function GroupRoute() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  return (
    <GroupScreen
      groupId={typeof groupId === 'string' ? groupId : undefined}
      onBack={() => (router.canGoBack() ? router.back() : router.dismissTo('/'))}
      onGoHome={() => router.dismissTo('/')}
      onOpenChat={(id) => router.push({ pathname: '/groups/[groupId]/chat', params: { groupId: id } })}
    />
  );
}
