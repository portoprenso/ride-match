import { z } from 'zod';

import { IdSchema, OperationIdSchema, ResourceVersionSchema, TimestampSchema } from './common.js';
import { MeetingPointSchema, PublicLocationSchema } from './location.js';
import { PlaceSchema } from './places.js';
import { OwnRideRequestSchema } from './rides.js';
import { UserSchema } from './users.js';

/**
 * Group rules of the mock MVP. One account occupies one seat, so the member count is also the
 * number of people. CONTRACT-002-B added the sizes for the public group preview, and
 * CONTRACT-003-A the timings. The schemas enforce the sizes; the source applies the timings.
 * Revisit them before a backend exists.
 */
export const GROUP_POLICY = {
  /** Seats in a group, and so its largest member count. */
  capacity: 4,
  /** Fewest members of a live group: with fewer, the group is cancelled. */
  minMembers: 2,
  /** How long a group lives after its creation before the source cancels it (30 minutes). */
  lifetimeSeconds: 1800,
  /** How long the members at closure can still read a closed group and its chat (one hour). */
  historyRetentionSeconds: 3600,
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

/**
 * Why a group closed.
 *
 * - `completed`: the coordinator marked the ready group completed.
 * - `coordinator_cancelled`: the coordinator cancelled it.
 * - `expired`: it reached its `expiresAt` while live, and the source cancelled it.
 * - `members_left`: fewer than `GROUP_POLICY.minMembers` remained after a member left,
 *   including a member who left by blocking someone. The reason never says that a block
 *   happened, so the remaining member cannot learn it.
 */
export const GroupClosureReasonSchema = z.enum(['completed', 'coordinator_cancelled', 'expired', 'members_left']);
export type GroupClosureReason = z.infer<typeof GroupClosureReasonSchema>;

/**
 * How and when a group closed, for its read-only history.
 *
 * `historyExpiresAt` is when the members at closure lose read access too, set by the source
 * `GROUP_POLICY.historyRetentionSeconds` after `closedAt`. Reads after it fail with
 * `HISTORY_EXPIRED`.
 */
export const GroupClosureSchema = z
  .strictObject({
    reason: GroupClosureReasonSchema,
    closedAt: TimestampSchema,
    historyExpiresAt: TimestampSchema,
  })
  .refine((closure) => Date.parse(closure.closedAt) < Date.parse(closure.historyExpiresAt), {
    message: 'Expected history to expire after closure',
    path: ['historyExpiresAt'],
  });
export type GroupClosureDto = z.infer<typeof GroupClosureSchema>;

/**
 * One member of a group, as the group's members see it.
 *
 * - `user` is the member's public summary, the same one any viewer sees on a ride.
 * - `joinedAt` is when the member joined; the two founders joined when the group was created.
 * - `rideRequestId` is the member's ride request linked to the group. Other members cannot
 *   read that request: its public projection ends once it is grouped.
 *
 * Members never see each other's exact origin, private destination or phone number; the
 * strict schema rejects them.
 */
export const GroupMemberSchema = z.strictObject({
  user: UserSchema,
  joinedAt: TimestampSchema,
  rideRequestId: IdSchema,
});
export type GroupMemberDto = z.infer<typeof GroupMemberSchema>;

/** The group fields that the group refinements below read. */
type GroupShape = {
  status: GroupStatus;
  members: readonly GroupMemberDto[];
  createdAt: string;
  closure: GroupClosureDto | null;
};

/** Whether a group has a closure exactly when it is closed, with a reason that fits its status. */
function hasClosureForStatus({ status, closure }: GroupShape): boolean {
  switch (status) {
    case 'forming':
    case 'ready':
      return closure === null;
    case 'completed':
      return closure?.reason === 'completed';
    case 'cancelled':
      return closure !== null && closure.reason !== 'completed';
  }
}

/**
 * Whether the member count fits the group's state: a group falls below
 * `GROUP_POLICY.minMembers` only when the last leave closed it, and then nobody else leaves.
 */
function hasMemberCountForState({ members, closure }: GroupShape): boolean {
  return (members.length < GROUP_POLICY.minMembers) === (closure?.reason === 'members_left');
}

/** Whether each user and each ride request appears once among the members. */
function hasDistinctMembers({ members }: GroupShape): boolean {
  return (
    new Set(members.map((member) => member.user.id)).size === members.length &&
    new Set(members.map((member) => member.rideRequestId)).size === members.length
  );
}

/** Whether the members are listed in join order, none before the group existed. */
function hasMembersInJoinOrder({ members, createdAt }: GroupShape): boolean {
  let previous = Date.parse(createdAt);
  return members.every((member) => {
    const joinedAt = Date.parse(member.joinedAt);
    const inOrder = joinedAt >= previous;
    previous = joinedAt;
    return inOrder;
  });
}

/**
 * The member-only view of a group (`GET /groups/{groupId}`, and the result of joining or of
 * a coordinator's status change). Only the group's current members read it; a former member
 * loses access as soon as they leave. The public preview is `GroupPreviewSchema`.
 *
 * - `status` follows the state machine in `docs/api/groups.md`.
 * - `coordinatorId` is the user ID of the member who may change the status. When the
 *   coordinator leaves, the earliest remaining member takes over, even if the group then
 *   closes, so the coordinator is always listed.
 * - `members` are listed in join order. A live or completed group has
 *   `GROUP_POLICY.minMembers` to `capacity` members; a group cancelled because members left
 *   keeps its one remaining member, who may read its history.
 * - `destination` and `departureAt` come from the target ride when the group formed; members
 *   do not edit them. The group departs before it expires.
 * - `meetingPoint` is the shared meeting place, or `null` until the source suggests one. Its
 *   `walkingMinutes` is for the viewer, so it may differ between members and reads without
 *   changing the group version. A change of point comes with a new point `id`. A ready group
 *   always has a point, and a changed or withdrawn point returns it to `forming` until the
 *   coordinator marks it ready again. A completed group keeps the point it was ready with.
 * - `expiresAt` is `GROUP_POLICY.lifetimeSeconds` after `createdAt`; a live group still open
 *   then is cancelled with reason `expired`. Its members' grouped requests follow this
 *   deadline, not their own discovery deadline.
 * - `closure` is `null` while the group is live, and says how it ended once it is completed or
 *   cancelled.
 * - `version` increases on every change of status, members, coordinator, meeting point or
 *   closure.
 *
 * Members' exact origins, phone numbers and chat messages never appear here; the strict
 * schemas reject them.
 */
export const RideGroupSchema = z
  .strictObject({
    id: IdSchema,
    status: GroupStatusSchema,
    coordinatorId: IdSchema,
    members: z.array(GroupMemberSchema).min(1).max(GROUP_POLICY.capacity),
    capacity: z.literal(GROUP_POLICY.capacity),
    destination: PlaceSchema,
    departureAt: TimestampSchema,
    meetingPoint: MeetingPointSchema.nullable(),
    createdAt: TimestampSchema,
    expiresAt: TimestampSchema,
    closure: GroupClosureSchema.nullable(),
    version: ResourceVersionSchema,
  })
  .refine(hasClosureForStatus, {
    message: 'Expected a closure exactly when the group is closed, with a reason that fits its status',
    path: ['closure'],
  })
  .refine(hasMemberCountForState, {
    message: 'Expected at least two members unless the group closed because members left',
    path: ['members'],
  })
  .refine(hasDistinctMembers, { message: 'Expected each user and ride request once', path: ['members'] })
  .refine(hasMembersInJoinOrder, {
    message: 'Expected members in join order, joined no earlier than the group was created',
    path: ['members'],
  })
  .refine((group) => group.members.some((member) => member.user.id === group.coordinatorId), {
    message: 'Expected the coordinator among the members',
    path: ['coordinatorId'],
  })
  .refine((group) => (group.status !== 'ready' && group.status !== 'completed') || group.meetingPoint !== null, {
    message: 'Expected a meeting point once the group is ready',
    path: ['meetingPoint'],
  })
  .refine(
    (group) =>
      Date.parse(group.createdAt) < Date.parse(group.expiresAt) &&
      Date.parse(group.departureAt) < Date.parse(group.expiresAt),
    { message: 'Expected creation and departure before expiry', path: ['expiresAt'] },
  );
export type RideGroupDto = z.infer<typeof RideGroupSchema>;

/**
 * Joins the caller's active ride request to a solo ride or a group (`POST /groups/join`).
 *
 * - `operationId` makes a retry return the original result; a new join from a caller who is
 *   already grouped fails with `ALREADY_IN_GROUP`.
 * - `rideRequestId` is the caller's own active request. The caller's own ride is not a valid
 *   target.
 * - `target` is the ride or group the caller confirmed. Joining a solo ride creates a group of
 *   two, coordinated by that ride's rider. If another join grouped that ride first, the
 *   caller joins its group instead, when it has a free seat.
 *
 * There is no expected version: a join checks the group's current status and seats, so of two
 * joins for the last seat one succeeds and the other fails with `GROUP_FULL`. The checks, in
 * order, are in `docs/api/groups.md`. The result is a `JoinGroupResultDto`.
 */
export const JoinGroupInputSchema = z
  .strictObject({
    operationId: OperationIdSchema,
    rideRequestId: IdSchema,
    target: JoinTargetSchema,
  })
  .refine((input) => input.target.kind !== 'ride' || input.target.id !== input.rideRequestId, {
    message: 'Expected a target other than the caller’s own ride',
    path: ['target'],
  });
export type JoinGroupInput = z.infer<typeof JoinGroupInputSchema>;

/**
 * Result of a successful join: the group the caller now belongs to, still `forming`, and the
 * caller's request, now `grouped` into it and listed among its members.
 */
export const JoinGroupResultSchema = z
  .strictObject({
    group: RideGroupSchema,
    rideRequest: OwnRideRequestSchema,
  })
  .refine(
    ({ group, rideRequest }) =>
      group.status === 'forming' &&
      rideRequest.status === 'grouped' &&
      rideRequest.groupId === group.id &&
      group.members.some(
        (member) => member.user.id === rideRequest.user.id && member.rideRequestId === rideRequest.id,
      ),
    { message: 'Expected the grouped request among the members of a forming group', path: ['rideRequest'] },
  );
export type JoinGroupResultDto = z.infer<typeof JoinGroupResultSchema>;

/**
 * Leaves a live group (`DELETE /groups/{groupId}/members/me`). Any member may leave without a
 * version check. Access ends at once, and the caller's request is cancelled. A retry with the
 * same `operationId` returns the original result; a new leave by someone who is not a member
 * fails with `MEMBERSHIP_REQUIRED`, and leaving a closed group fails with `GROUP_CLOSED`.
 */
export const LeaveGroupInputSchema = z.strictObject({
  operationId: OperationIdSchema,
});
export type LeaveGroupInput = z.infer<typeof LeaveGroupInputSchema>;

/**
 * Result of leaving: the group left, and the caller's request, now `cancelled` with that
 * group. It holds nothing about the group after the leave, which the caller may no longer
 * read.
 */
export const LeaveGroupResultSchema = z
  .strictObject({
    groupId: IdSchema,
    rideRequest: OwnRideRequestSchema,
  })
  .refine(
    ({ groupId, rideRequest }) => rideRequest.status === 'cancelled' && rideRequest.groupId === groupId,
    { message: 'Expected the request cancelled with the group left', path: ['rideRequest'] },
  );
export type LeaveGroupResultDto = z.infer<typeof LeaveGroupResultSchema>;

/**
 * The coordinator's status change (`PATCH /groups/{groupId}/status`); the result is the updated
 * `RideGroupDto`.
 *
 * - `status` is the requested status: `ready` (from `forming`, with a meeting point),
 *   `forming` (reopen a ready group), `completed` (from `ready`) or `cancelled` (from either
 *   live status).
 * - `expectedVersion` is the group version the coordinator last saw.
 *
 * A caller who is not a member fails with `MEMBERSHIP_REQUIRED`, a member who is not the
 * coordinator with `FORBIDDEN`, and a closed group with `GROUP_CLOSED`. Then a stale
 * `expectedVersion` fails with `VERSION_CONFLICT`, and only then does a transition the
 * current status does not allow fail with `INVALID_TRANSITION`.
 */
export const UpdateGroupStatusInputSchema = z.strictObject({
  operationId: OperationIdSchema,
  status: GroupStatusSchema,
  expectedVersion: ResourceVersionSchema,
});
export type UpdateGroupStatusInput = z.infer<typeof UpdateGroupStatusInputSchema>;
