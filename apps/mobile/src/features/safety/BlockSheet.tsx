import type { BlockUserResultDto, RideGroupDto } from '@ride-match/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { useDataSource } from '../../data/DataSourceProvider';
import { withDataErrors, type DataError } from '../../data/errors';
import { createOperationId } from '../../data/operationId';
import type { SignedInViewer } from '../../data/queryKeys';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { ConfirmAction } from '../../ui/ConfirmAction';
import { Notice } from '../../ui/Notice';
import { applyBlockLeave, refreshAfterBlockChange } from './blockCache';
import { describeBlockConsequences, describeBlockError } from './blockFlow';

type BlockSheetProps = {
  viewer: SignedInViewer;
  /** The rider being blocked, named in the title and button so the block can't fall on someone else. */
  target: { id: string; displayName: string };
  /** The group where the viewer met the rider, as last read, which decides the copy; or `null`. */
  group: RideGroupDto | null;
  /** Tells the host sheet whether the block is on its way, so it isn't dismissed mid-send. */
  onPendingChange: (pending: boolean) => void;
  /** The source made the block. The cache is already updated; the host leaves or says so. */
  onBlocked: (result: BlockUserResultDto) => void;
  /** Switches to the report form for the same rider, from the menu's confirmation (43). */
  onReport?: () => void;
  onClose: () => void;
};

/**
 * Blocking a rider (design 43), as the content of a screen's sheet, confirmed before anything is
 * sent. The copy follows `describeBlockConsequences`: block and leave a live group they share
 * (with the two-person and coordinator cases), a closed group left as it is, or no group at all.
 *
 * - The operation ID is fixed at the first confirmation. A lost answer or busy service keeps
 *   it, so confirming again returns the original result instead of blocking twice; a refusal
 *   drops it.
 * - Only the source's answer counts: then the leave is applied to the cache (`applyBlockLeave`),
 *   the block list, discovery and matches are reread, `user_blocked` is recorded without
 *   properties, and `onBlocked` lets the host navigate or say so.
 * - The blocked rider and the other members are never told about the block.
 */
export function BlockSheet({ viewer, target, group, onPendingChange, onBlocked, onReport, onClose }: BlockSheetProps) {
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
  const [operationId, setOperationId] = useState<string | null>(null);

  const block = useMutation<BlockUserResultDto, DataError, string>({
    mutationFn: (id) => withDataErrors(dataSource.safety.block(target.id, { operationId: id })),
    onSuccess: (result) => {
      applyBlockLeave(queryClient, viewer, result);
      refreshAfterBlockChange(queryClient, viewer);
      analytics.track('user_blocked');
      onBlocked(result);
    },
    onError: (error) => {
      if (describeBlockError(error).kind === 'rejected') setOperationId(null);
    },
  });
  const pending = block.isPending;
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);

  const confirm = () => {
    if (pending) return;
    const id = operationId ?? createOperationId();
    setOperationId(id);
    block.mutate(id);
  };

  const copy = describeBlockConsequences(group, viewer.userId, target);
  return (
    <ConfirmAction
      title={copy.title}
      message={copy.message}
      confirmLabel={copy.confirmLabel}
      cancelLabel="Go back"
      tone="danger"
      busy={pending}
      error={block.error === null ? undefined : describeBlockError(block.error).message}
      onConfirm={confirm}
      onCancel={onClose}
    >
      {copy.warning === null ? null : <Notice tone="danger" message={copy.warning} />}
      {copy.detail === null ? null : <AppText color="muted">{copy.detail}</AppText>}
      {onReport === undefined ? null : (
        <Button label="Report this rider" variant="ghost" disabled={pending} onPress={onReport} />
      )}
    </ConfirmAction>
  );
}
