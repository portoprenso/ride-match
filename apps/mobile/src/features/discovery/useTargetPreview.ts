import type { GroupPreviewDto, NearbyItemDto, RideRequestDto } from '@ride-match/contracts';
import { useQuery } from '@tanstack/react-query';

import { useDataSource } from '../../data/DataSourceProvider';
import type { DataError } from '../../data/errors';
import { groupPreviewQuery, rideQuery } from '../../data/queries';
import { useViewer } from '../auth/AuthSessionProvider';

/** A ride or group the rider opened from the map or the list. */
export type PreviewTarget = Readonly<{ kind: NearbyItemDto['kind']; id: string }>;

/**
 * What the preview sheet can honestly show (screens 05, 19 and 55):
 *
 * - `checking`: the target is being read again; `item` is the map's copy while there is one.
 * - `available`: the source has just confirmed the target, with its current public fields.
 * - `gone`: the source no longer has it (`TARGET_UNAVAILABLE`): a ride expired, was cancelled or
 *   joined a group, or a group closed. Nothing about it can be joined any more.
 * - `failed`: the read failed for another reason, so nobody can say whether it is still there;
 *   `item` is the last copy known, shown without a join action.
 */
export type PreviewState =
  | { kind: 'checking'; item: NearbyItemDto | null }
  | { kind: 'available'; item: NearbyItemDto }
  | { kind: 'gone' }
  | { kind: 'failed'; item: NearbyItemDto | null };

type PreviewInputs = {
  target: PreviewTarget;
  /** The current read's data, if any. */
  data: RideRequestDto | GroupPreviewDto | undefined;
  error: DataError | null;
  /** The map's copy of the target, while the snapshot still has it. */
  seed: NearbyItemDto | null;
};

/**
 * The preview state for a read's current values; pure, so every combination is testable.
 * `TARGET_UNAVAILABLE` wins over any earlier data: once the source says the target is gone, an
 * older copy must not offer a join.
 */
export function describePreview({ target, data, error, seed }: PreviewInputs): PreviewState {
  if (error?.code === 'TARGET_UNAVAILABLE') return { kind: 'gone' };
  const item = data === undefined ? null : toItem(target, data);
  if (error !== null) return { kind: 'failed', item: item ?? seed };
  if (item !== null) return { kind: 'available', item };
  return { kind: 'checking', item: seed };
}

/** The read's public fields in the shape the map uses, tagged with the target's kind. */
function toItem(target: PreviewTarget, data: RideRequestDto | GroupPreviewDto): NearbyItemDto {
  return { ...data, kind: target.kind } as NearbyItemDto;
}

/**
 * Reads the opened target's public projection again (`GET /rides/{rideId}` or
 * `GET /groups/{groupId}/preview`) each time a preview opens, so the sheet never offers a join
 * on the strength of an older snapshot. The event synchronizer invalidates the same read when the
 * target changes or is removed, so a target that expires or closes while its preview is open
 * turns `gone` without the rider doing anything.
 *
 * @param target The open target, or `null` while no preview is open (nothing is read then).
 * @param seed The map's copy of the target, shown while it is checked.
 * @returns The state, and `retry` for a failed read.
 */
export function useTargetPreview(
  target: PreviewTarget | null,
  seed: NearbyItemDto | null,
): (PreviewState & { retry: () => void }) | null {
  const dataSource = useDataSource();
  const viewer = useViewer();
  const id = target?.id ?? '';
  const ride = useQuery({ ...rideQuery(dataSource, viewer, id), enabled: target?.kind === 'ride' });
  const group = useQuery({ ...groupPreviewQuery(dataSource, viewer, id), enabled: target?.kind === 'group' });
  if (target === null) return null;
  const query = target.kind === 'ride' ? ride : group;
  const state = describePreview({ target, data: query.data, error: query.error, seed });
  return { ...state, retry: () => void query.refetch() };
}
