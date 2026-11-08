import type { BlockedUserDto } from '@ride-match/contracts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDataSource } from '../../data/DataSourceProvider';
import { useDemoSignIn } from '../../data/DemoSignInProvider';
import { withDataErrors, type DataError } from '../../data/errors';
import { blockListQuery } from '../../data/queries';
import type { SignedInViewer } from '../../data/queryKeys';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { useAnnouncement } from '../../ui/FieldMessage';
import { Notice } from '../../ui/Notice';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { colors, radii, spacing } from '../../ui/tokens';
import { useViewer } from '../auth/AuthSessionProvider';
import { refreshAfterBlockChange } from './blockCache';

type BlockedRidersScreenProps = {
  onBack: () => void;
  /** Opens sign-in, offered when nobody is signed in: the list is the signed-in rider's own. */
  onSignIn: () => void;
};

/**
 * The blocked-riders panel (design 44), opened from settings: the signed-in rider's blocks,
 * newest first, read page by page from the source (`blockListQuery`), with "Unblock" for each.
 *
 * - **States:** loading, a failed read with "Try again", an empty list, and "Load more blocked
 *   riders" while the source says more follow. Anonymous viewers are asked to sign in; the list
 *   is never shown for anyone else.
 * - **Unblock** is sent at once (it is idempotent and can be undone by blocking again). Only the
 *   source's answer removes the row: the list is then read again from its first page, and
 *   discovery and matches are reread (`refreshAfterBlockChange`). A failure stays on that row.
 * - Unblocking allows future pairing only; it restores no group membership or old chat, and the
 *   screen says so.
 */
export function BlockedRidersScreen({ onBack, onSignIn }: BlockedRidersScreenProps) {
  const viewer = useViewer();
  return (
    <Screen scroll>
      <View style={styles.content}>
        <ScreenHeader title="Blocked riders" onBack={onBack} backLabel="Back to settings" />
        <View style={styles.heading}>
          <AppText variant="section">People you’ve blocked.</AppText>
          <AppText color="muted">Blocked riders are filtered from your signed-in discovery and future pairing.</AppText>
        </View>
        {viewer.kind === 'user' ? (
          <BlockList viewer={viewer} />
        ) : (
          <>
            <AppText color="muted">Sign in to see the riders you’ve blocked.</AppText>
            <Button label="Sign in" variant="secondary" onPress={onSignIn} />
          </>
        )}
      </View>
    </Screen>
  );
}

function BlockList({ viewer }: { viewer: SignedInViewer }) {
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const demo = useDemoSignIn() !== null;
  const list = useInfiniteQuery(blockListQuery(dataSource, viewer));
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useAnnouncement(announcement ?? undefined);

  const unblock = useMutation<void, DataError, BlockedUserDto>({
    mutationFn: (entry) => withDataErrors(dataSource.safety.unblock(entry.user.id)),
    onMutate: () => {
      setFailed(null);
      setAnnouncement(null);
    },
    onSuccess: (_result, entry) => {
      refreshAfterBlockChange(queryClient, viewer);
      setAnnouncement(`You unblocked ${entry.user.displayName}.`);
    },
    onError: (_error, entry) => setFailed(entry.user.id),
  });

  if (list.isPending) {
    return (
      <AppText color="muted" accessibilityLiveRegion="polite">
        Loading blocked riders…
      </AppText>
    );
  }
  if (list.isError) {
    return (
      <>
        <AppText color="muted" accessibilityLiveRegion="polite">
          Blocked riders couldn’t be loaded.
        </AppText>
        <Button label="Try again" variant="secondary" onPress={() => void list.refetch()} />
      </>
    );
  }

  const entries = list.data.pages.flatMap((page) => page.blockedUsers);
  return (
    <>
      {announcement === null ? null : <Notice message={announcement} />}
      {entries.length === 0 ? (
        <AppText color="muted">You haven’t blocked anyone.</AppText>
      ) : (
        entries.map((entry) => {
          const name = entry.user.displayName;
          const busy = unblock.isPending && unblock.variables.user.id === entry.user.id;
          return (
            <View key={entry.user.id} style={styles.row}>
              <View accessible style={styles.rowText}>
                <AppText variant="label">{name}</AppText>
                <AppText variant="small" color="muted">
                  {demo ? 'Blocked in this demo' : 'Blocked'}
                </AppText>
              </View>
              <Button
                label={`Unblock ${name}`}
                variant="secondary"
                busy={busy}
                disabled={unblock.isPending && !busy}
                onPress={() => unblock.mutate(entry)}
              />
              {failed === entry.user.id ? (
                <AppText color="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
                  {name} couldn’t be unblocked. Try again.
                </AppText>
              ) : null}
            </View>
          );
        })
      )}
      {list.hasNextPage ? (
        <Button
          label="Load more blocked riders"
          variant="ghost"
          busy={list.isFetchingNextPage}
          onPress={() => void list.fetchNextPage()}
        />
      ) : null}
      {list.isFetchNextPageError ? (
        <AppText color="danger" accessibilityLiveRegion="polite">
          More blocked riders couldn’t be loaded.
        </AppText>
      ) : null}
      <Notice message="Unblocking allows future pairing. It does not restore group membership or access to old chat." />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  heading: {
    gap: spacing.sm,
  },
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  rowText: {
    gap: spacing.xs,
  },
});
