import {
  BlockListQueryInputSchema,
  BlockUserInputSchema,
  IdSchema,
  ReportUserInputSchema,
  type BlockListPageDto,
  type BlockUserResultDto,
  type ReportReceiptDto,
} from '@ride-match/contracts';

import { authenticate } from './auth';
import { isMember, leaveLiveGroup } from './groups';
import { accessRevoked, discoveryRecords, nearbyRemoved, toBlockedUserDto } from './serializers';
import type { WorkContext } from './simulator';
import { isLiveGroup, type GroupRecord, type MockWorld } from './world';

/*
 * Reports and blocks (docs/api/groups.md, "Block and report"; SAFETY-001-A).
 *
 * - A block is private to its blocker. It hides each rider from the other in discovery, nearby
 *   updates and matches, and stops either joining a plan the other is in. Blocking a rider in
 *   the caller's live group also makes the caller leave it, in the same step; the others see an
 *   ordinary leave. Unblocking only ends the filtering: it restores no membership or chat.
 * - A report is stored once per operation ID and answered with a receipt that echoes nothing.
 *   The mock makes no moderation decision, and report details never leave the world record.
 */

type Context = WorkContext<MockWorld>;

/** The block-list cursor: the prefix and the number of blocks already listed. */
const CURSOR_PATTERN = /^blocks\.(0|[1-9][0-9]{0,5})$/;

/** The caller's live group that `userId` also belongs to, if any. */
function sharedLiveGroup(world: MockWorld, callerId: string, userId: string): GroupRecord | undefined {
  return [...world.groups.values()].find(
    (group) => isLiveGroup(group) && isMember(group, callerId) && isMember(group, userId),
  );
}

/**
 * Announces that each rider's discoverable items are gone for the other: a removal for every
 * active ride or live group either rider is in. The nearby subscription delivers such a removal
 * (of an item still discoverable) only to the subscribers it is now hidden from.
 */
function hideFromEachOther(context: Context, one: string, other: string): void {
  for (const item of discoveryRecords(context.state)) {
    const riders = item.kind === 'ride' ? [item.record.userId] : item.record.members.map((member) => member.userId);
    if (!riders.includes(one) && !riders.includes(other)) continue;
    context.emit(
      nearbyRemoved(
        context.eventEnvelope(),
        { kind: item.kind, id: item.record.id },
        item.record.version,
        'unavailable',
      ),
    );
  }
}

/**
 * `PUT /me/blocks/{userId}`: the caller blocks a rider.
 *
 * In this order: `VALIDATION_FAILED` (an invalid input or rider ID), `UNAUTHENTICATED`/
 * `SESSION_EXPIRED`, then the receipt: a retry with the same operation ID returns the original
 * result, its leave included, and the same ID for another rider fails with
 * `IDEMPOTENCY_CONFLICT`. A new block then fails with `VALIDATION_FAILED` for the caller
 * themself and `NOT_FOUND` for an unknown rider. Otherwise:
 *
 * - **Already blocked:** the existing block, `leftGroup: null`; nothing changes.
 * - **A shared live group:** the block, and the caller leaves the group in the same step
 *   (`leaveLiveGroup`): their request is cancelled, a ready group forms again, the earliest
 *   member takes over from a leaving coordinator, and one remaining member closes it with
 *   `members_left`. The caller is told their access ended (`access.revoked`, `left`).
 * - **Otherwise:** the block, `leftGroup: null`.
 *
 * A new block removes each rider's discoverable items from the other's nearby updates. A closed
 * group both can still read is not affected. Blocking a rider who blocked the caller succeeds
 * and reveals nothing.
 */
export function blockUser(
  context: Context,
  accessToken: string | null,
  userId: string,
  input: unknown,
): BlockUserResultDto {
  const parsed = BlockUserInputSchema.safeParse(input);
  if (!parsed.success || !IdSchema.safeParse(userId).success) {
    throw context.sourceError('VALIDATION_FAILED', 'The block is not valid.');
  }
  const caller = authenticate(context, accessToken);

  return context.receipts.once(
    { actorId: caller.id, operationId: parsed.data.operationId },
    { operation: 'safety.block', input: { userId } },
    () => {
      const { state } = context;
      if (userId === caller.id) throw context.sourceError('VALIDATION_FAILED', 'You can’t block yourself.');
      if (!state.users.has(userId)) throw context.sourceError('NOT_FOUND', 'This rider does not exist.');
      const existing = state.blocks.find((block) => block.blockerId === caller.id && block.blockedId === userId);
      if (existing !== undefined) return { blockedUser: toBlockedUserDto(state, existing), leftGroup: null };

      const block = { blockerId: caller.id, blockedId: userId, blockedAt: context.now };
      state.blocks.push(block);
      const group = sharedLiveGroup(state, caller.id, userId);
      const leftGroup = group === undefined ? null : leaveLiveGroup(context, group, caller.id);
      if (group !== undefined) context.emit(accessRevoked(context.eventEnvelope(), caller.id, group, 'left'));
      hideFromEachOther(context, caller.id, userId);
      return { blockedUser: toBlockedUserDto(state, block), leftGroup };
    },
  );
}

/**
 * `DELETE /me/blocks/{userId}`: ends the caller's block of a rider, whether or not there was
 * one. `VALIDATION_FAILED` for an invalid rider ID, then `UNAUTHENTICATED`/`SESSION_EXPIRED`.
 *
 * The riders may see and pair with each other again (unless the other still blocks the caller),
 * but nothing is restored: no membership, no chat. No event announces it; the app reads
 * discovery again.
 */
export function unblockUser(context: Context, accessToken: string | null, userId: string): void {
  if (!IdSchema.safeParse(userId).success) throw context.sourceError('VALIDATION_FAILED', 'The rider is not valid.');
  const caller = authenticate(context, accessToken);
  context.state.blocks = context.state.blocks.filter(
    (block) => !(block.blockerId === caller.id && block.blockedId === userId),
  );
}

/**
 * `GET /me/blocks`: one page of the caller's blocks, newest first, each rider once.
 *
 * `VALIDATION_FAILED` for an invalid query or malformed cursor, then `UNAUTHENTICATED`/
 * `SESSION_EXPIRED`. The cursor counts the blocks already listed, so a block or unblock while
 * paging shifts later pages; the app reloads from the first page after either (as the contract
 * says). A cursor past the end gives an empty last page.
 */
export function listBlocks(context: Context, accessToken: string | null, input: unknown): BlockListPageDto {
  const parsed = BlockListQueryInputSchema.safeParse(input);
  const offsetText =
    parsed.success && parsed.data.cursor !== undefined ? CURSOR_PATTERN.exec(parsed.data.cursor)?.[1] : '0';
  if (!parsed.success || offsetText === undefined) {
    throw context.sourceError('VALIDATION_FAILED', 'The block list request is not valid.');
  }
  const caller = authenticate(context, accessToken);
  const offset = Number(offsetText);
  const { limit } = parsed.data;
  const blocks = context.state.blocks
    .filter((block) => block.blockerId === caller.id)
    .reverse()
    .sort((first, second) => second.blockedAt - first.blockedAt);
  const page = blocks.slice(offset, offset + limit);
  const next = offset + page.length;
  return {
    blockedUsers: page.map((block) => toBlockedUserDto(context.state, block)),
    nextCursor: page.length > 0 && next < blocks.length ? `blocks.${next}` : null,
  };
}

/** Whether `userId` is or was a member of `group`: a current member, or one whose request ended in it. */
function belongedTo(world: MockWorld, group: GroupRecord, userId: string): boolean {
  if (isMember(group, userId)) return true;
  return [...world.rides.values()].some((ride) => ride.userId === userId && ride.groupId === group.id);
}

/**
 * `POST /reports`: the caller reports a rider.
 *
 * In this order: `VALIDATION_FAILED` for an invalid input, `UNAUTHENTICATED`/`SESSION_EXPIRED`,
 * then the receipt: a retry with the same operation ID returns the original receipt, even if
 * the caller lost access to the context since; the same ID with other input fails with
 * `IDEMPOTENCY_CONFLICT`. A new report then fails with:
 *
 * - `VALIDATION_FAILED` when the target is the caller, and `NOT_FOUND` for an unknown target;
 * - with a context: `MEMBERSHIP_REQUIRED` when the caller can't read the group (unknown, not a
 *   member, a former member), `HISTORY_EXPIRED` once a closed group's history is gone, and
 *   `VALIDATION_FAILED` when the target never belonged to the group, or the message is not in it
 *   or was not sent by the target.
 *
 * Otherwise the report is stored and a new receipt returned (an ID and the acceptance time,
 * nothing else). Reporting does not block, and no event is raised.
 */
export function reportUser(context: Context, accessToken: string | null, input: unknown): ReportReceiptDto {
  const parsed = ReportUserInputSchema.safeParse(input);
  if (!parsed.success) throw context.sourceError('VALIDATION_FAILED', 'The report is not valid.');
  const report = parsed.data;
  const caller = authenticate(context, accessToken);

  return context.receipts.once(
    { actorId: caller.id, operationId: report.operationId },
    { operation: 'safety.report', input: report },
    () => {
      const { state } = context;
      if (report.targetUserId === caller.id) {
        throw context.sourceError('VALIDATION_FAILED', 'You can’t report yourself.');
      }
      if (!state.users.has(report.targetUserId)) throw context.sourceError('NOT_FOUND', 'This rider does not exist.');
      if (report.context !== undefined) {
        const { groupId, messageId } = report.context;
        const group = state.groups.get(groupId);
        if (group === undefined || !isMember(group, caller.id)) {
          throw context.sourceError('MEMBERSHIP_REQUIRED', 'Only this group’s members can report from it.');
        }
        if (group.closure !== null && context.now >= group.closure.historyExpiresAt) {
          throw context.sourceError('HISTORY_EXPIRED', 'This group’s history is no longer kept.');
        }
        if (!belongedTo(state, group, report.targetUserId)) {
          throw context.sourceError('VALIDATION_FAILED', 'This rider was not in this group.');
        }
        if (
          messageId !== null &&
          !(state.messages.get(groupId) ?? []).some(
            (message) => message.id === messageId && message.senderId === report.targetUserId,
          )
        ) {
          throw context.sourceError('VALIDATION_FAILED', 'This message is not this rider’s in this group.');
        }
      }

      const id = context.ids.next('report');
      state.reports.push({
        id,
        reporterId: caller.id,
        targetId: report.targetUserId,
        reason: report.reason,
        details: report.details ?? null,
        context: report.context ?? null,
        receivedAt: context.now,
      });
      return { id, receivedAt: new Date(context.now).toISOString() };
    },
  );
}
