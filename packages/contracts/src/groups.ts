import { z } from 'zod';

import { IdSchema, ResourceVersionSchema, TimestampSchema } from './common.js';
import { PublicLocationSchema } from './location.js';
import { PlaceSchema } from './places.js';

/**
 * Group size rules of the mock MVP. One account occupies one seat, so the member count is
 * also the number of people. CONTRACT-002-B added these for the public group preview;
 * CONTRACT-003-A owns the rest of the group contracts.
 */
export const GROUP_POLICY = {
  /** Seats in a group, and so its largest member count. */
  capacity: 4,
  /** Fewest members of a live group: with fewer, the group is cancelled. */
  minMembers: 2,
} as const;

/**
 * Lifecycle status of a group: `forming` (accepts joins while seats remain), `ready`
 * (the coordinator confirmed the meeting point; no joins), then `completed` or `cancelled`.
 * The transitions are specified in `docs/api/groups.md`.
 */
export const GroupStatusSchema = z.enum(['forming', 'ready', 'completed', 'cancelled']);
export type GroupStatus = z.infer<typeof GroupStatusSchema>;

/** The statuses of a live group, the only groups that public previews and discovery show. */
export const LiveGroupStatusSchema = GroupStatusSchema.extract(['forming', 'ready']);
export type LiveGroupStatus = z.infer<typeof LiveGroupStatusSchema>;

/** What a rider can join: a solo ride request or a group. */
export const JoinTargetKindSchema = z.enum(['ride', 'group']);
export type JoinTargetKind = z.infer<typeof JoinTargetKindSchema>;

/**
 * Reference to a solo ride request or a group that a rider could join. Matches and match
 * previews point at their target this way, and it identifies a nearby discovery item.
 */
export const JoinTargetSchema = z.strictObject({
  kind: JoinTargetKindSchema,
  id: IdSchema,
});
export type JoinTargetDto = z.infer<typeof JoinTargetSchema>;

/**
 * Stable key of a join target, such as `ride:ride_1`, for sets and maps. A ride and a group
 * may share an ID, so the key includes the kind.
 */
export function joinTargetKey(target: Pick<JoinTargetDto, 'kind' | 'id'>): string {
  return `${target.kind}:${target.id}`;
}

/** Whether each target appears at most once in a list, compared by kind and ID. */
export function hasDistinctTargets(targets: readonly Pick<JoinTargetDto, 'kind' | 'id'>[]): boolean {
  return new Set(targets.map(joinTargetKey)).size === targets.length;
}

/**
 * Public preview of a live group (`GET /groups/{groupId}/preview`, and the group item of
 * nearby discovery), which anyone may see, including anonymous viewers.
 *
 * - `status` is `forming` or `ready`. A completed, cancelled or unknown group has no
 *   preview: the source answers `TARGET_UNAVAILABLE`.
 * - `memberCount` is the number of people, from `GROUP_POLICY.minMembers` to `capacity`
 *   (four). The group accepts joins only while `forming` with a seat left; a full group
 *   still `forming` is not yet ready.
 * - `publicOrigin` is an approximate area for the map marker. It is never the shared
 *   meeting point or a member's exact origin.
 * - `destination` is the group's agreed curated place, and `departureAt` its expected
 *   departure.
 * - `expiresAt` is the group's deadline, after which the source cancels it.
 *
 * Members-only data never appears here: no member list, coordinator, meeting point, chat or
 * linked ride requests. The strict schema rejects them.
 */
export const GroupPreviewSchema = z.strictObject({
  id: IdSchema,
  status: LiveGroupStatusSchema,
  memberCount: z.int().min(GROUP_POLICY.minMembers).max(GROUP_POLICY.capacity),
  capacity: z.literal(GROUP_POLICY.capacity),
  publicOrigin: PublicLocationSchema,
  destination: PlaceSchema,
  departureAt: TimestampSchema,
  expiresAt: TimestampSchema,
  version: ResourceVersionSchema,
});
export type GroupPreviewDto = z.infer<typeof GroupPreviewSchema>;
