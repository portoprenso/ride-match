import type { CancelRideRequestInput, OwnRideRequestDto } from '@ride-match/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDataSource } from '../../data/DataSourceProvider';
import { withDataErrors, type DataError } from '../../data/errors';
import { createOperationId } from '../../data/operationId';
import { queryKeys } from '../../data/queryKeys';
import { AppText } from '../../ui/AppText';
import { ConfirmAction } from '../../ui/ConfirmAction';
import { Notice } from '../../ui/Notice';
import { SheetHost } from '../../ui/SheetHost';
import { spacing } from '../../ui/tokens';
import { useViewer } from '../auth/AuthSessionProvider';
import { departureText } from '../discovery/nearbyItems';

type CancelRequestSheetProps = {
  /** The active request to cancel, or `null` while closed. */
  request: OwnRideRequestDto | null;
  now: number;
  onClose: () => void;
};

/**
 * What a failed cancel means. A state refusal (expired, grouped, already ended) or a version
 * conflict is settled by reading the request again, and the card then shows what is true; only
 * an unknown outcome is retried, with the same operation ID.
 */
export function describeCancelError(error: DataError): { close: boolean; retry: boolean; message: string } {
  switch (error.code) {
    case 'RIDE_EXPIRED':
    case 'INVALID_TRANSITION':
      return { close: true, retry: false, message: 'This request has already ended.' };
    case 'USE_LEAVE_GROUP':
      return { close: true, retry: false, message: 'Your request joined a group. Leave the group to end it.' };
    case 'VERSION_CONFLICT':
      return { close: false, retry: false, message: 'Your request changed. Check it, then try again.' };
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return { close: false, retry: false, message: 'Your session ended. Sign in again to cancel.' };
    default:
      return {
        close: false,
        retry: true,
        message: 'We couldn’t confirm it was cancelled. Try again: it won’t be cancelled twice.',
      };
  }
}

/**
 * The cancel confirmation (screen 28). "Cancel my request" sends the request's current version
 * and an operation ID fixed at the first press; a retry after no answer resends both, so the
 * source cancels once. The card updates from the source's canonical answer, never optimistically.
 * The sheet cannot be dismissed while the cancel runs; nothing is re-created afterwards.
 */
export function CancelRequestSheet({ request, now, onClose }: CancelRequestSheetProps) {
  const [busy, setBusy] = useState(false);
  return (
    <SheetHost open={request !== null} onDismiss={onClose} dismissible={!busy}>
      {request === null ? null : <CancelFlow request={request} now={now} onClose={onClose} onBusyChange={setBusy} />}
    </SheetHost>
  );
}

function CancelFlow({
  request,
  now,
  onClose,
  onBusyChange,
}: {
  request: OwnRideRequestDto;
  now: number;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const viewer = useViewer();
  const [sent, setSent] = useState<CancelRideRequestInput | null>(null);
  const refreshOwn = () => {
    if (viewer.kind === 'user') void queryClient.invalidateQueries({ queryKey: queryKeys.ownRequest(viewer) });
  };
  const cancel = useMutation<OwnRideRequestDto, DataError, CancelRideRequestInput>({
    mutationFn: (input) => withDataErrors(dataSource.rides.cancel(request.id, input)),
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onSuccess: (cancelled) => {
      if (viewer.kind === 'user') {
        queryClient.setQueryData(queryKeys.ownRequest(viewer), cancelled);
        void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser(viewer) });
      }
      onClose();
    },
    onError: (error) => {
      const outcome = describeCancelError(error);
      if (!outcome.retry) {
        setSent(null);
        refreshOwn();
      }
      if (outcome.close) onClose();
    },
  });
  const failure = cancel.error === null ? null : describeCancelError(cancel.error);
  // The search window ends while the rider decides: the action is no longer valid. A cancel
  // already on its way finishes first; the source answers it either way.
  const pending = cancel.isPending;
  useEffect(() => {
    if (pending) return undefined;
    const timer = setTimeout(onClose, Math.max(0, Date.parse(request.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [pending, request.expiresAt, onClose]);

  return (
    <ConfirmAction
      title="Stop looking for a ride?"
      message="Your request and its matches will be removed from discovery."
      confirmLabel={failure?.retry ? 'Try cancelling again' : 'Cancel my request'}
      cancelLabel="Keep searching"
      tone="danger"
      busy={cancel.isPending}
      error={failure?.message}
      onConfirm={() => {
        if (cancel.isPending) return;
        const input = sent ?? { operationId: createOperationId(), expectedVersion: request.version };
        setSent(input);
        cancel.mutate(input);
      }}
      onCancel={onClose}
    >
      <View style={styles.summary}>
        <AppText variant="label">{request.destination.label}</AppText>
        <AppText variant="small" color="muted">
          {departureText(request.departureAt, now)}
        </AppText>
      </View>
      <Notice message="A new search needs a new request. We won’t restart it automatically." />
    </ConfirmAction>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.xs,
  },
});
