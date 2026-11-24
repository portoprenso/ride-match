import { GROUP_POLICY, JoinGroupInputSchema } from '@ride-match/contracts';

import { DEMO_OTP_CODE, requestOtp, verifyOtp } from './auth';
import { sendChatMessage } from './chat';
import { joinGroup, updateGroupStatus } from './groups';
import type { Simulator, WorkContext } from './simulator';
import { isLiveGroup, isBlockedPair, type MockWorld } from './world';

type Context = WorkContext<MockWorld>;

/** Deterministic fixture intents, separate from user-generated operation IDs. */
const intent = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`;

/** Signs in a seeded actor through normal mock auth; credentials never leave the simulator. */
function actorAccess(context: Context, userId: string, slot = 1): string {
  const { auth } = context.state;
  for (const [token, record] of auth.accessTokens) {
    const session = auth.sessions.get(record.sessionId);
    if (record.expiresAt > context.now && session?.userId === userId && !session.revoked) return token;
  }
  const phoneNumber = `+44770090090${slot}`;
  auth.accounts.set(phoneNumber, userId);
  const challenge = requestOtp(context, { phoneNumber });
  return verifyOtp(context, { challengeId: challenge.id, code: DEMO_OTP_CODE }).accessToken;
}

/** A scripted rider joins only while their request, relationship and target still permit it. */
function joinSeededRide(context: Context, rideId: string, groupId: string, slot: number): void {
  const ride = context.state.rides.get(rideId);
  const group = context.state.groups.get(groupId);
  if (!ride || ride.status !== 'active' || !group || group.status !== 'forming' || group.members.length >= GROUP_POLICY.capacity) return;
  if (context.now >= ride.expiresAt || context.now >= group.expiresAt) return;
  if (group.members.some((member) => isBlockedPair(context.state, member.userId, ride.userId))) return;
  joinGroup(context, actorAccess(context, ride.userId, slot), {
    operationId: intent(slot), rideRequestId: rideId, target: { kind: 'group', id: groupId },
  });
}

/**
 * Scenario E schedules the competing real join before the caller's simulated latency completes.
 * A separate scheduled commit preserves the competitor's events even when the caller fails.
 * Other scenarios and malformed/unrelated inputs are unchanged; reset cancels the scheduled work.
 */
export function prepareScenarioJoin(simulator: Simulator<MockWorld>, input: unknown): void {
  const plan = simulator.state.scenarioPlan;
  if (plan?.kind !== 'last-seat' || plan.queued) return;
  const parsed = JoinGroupInputSchema.safeParse(input);
  if (!parsed.success || parsed.data.rideRequestId !== plan.ownRideId ||
    parsed.data.target.kind !== 'group' || parsed.data.target.id !== plan.groupId) return;
  plan.queued = true;
  simulator.schedule(simulator.clock.now(), (context) => joinSeededRide(context, plan.competitorRideId, plan.groupId, 1));
}

/** Scenario D's first accepted own join starts exactly two subsequent joins, including on lost replies. */
export function scheduleScenarioMembers(context: Context, ownRideId: string, groupId: string): void {
  const plan = context.state.scenarioPlan;
  if (plan?.kind !== 'formation' || plan.started || plan.ownRideId !== ownRideId) return;
  plan.started = true;
  plan.joiningRideIds.forEach((rideId, index) => {
    context.schedule(context.now + (index + 1) * 5000, (next) => joinSeededRide(next, rideId, groupId, index + 1));
  });
}

/** Adds one source-owned reply without bypassing current membership or closed-group rules. */
function reply(context: Context, groupId: string, text: string, n: number): void {
  const group = context.state.groups.get(groupId);
  if (!group || !isLiveGroup(group) || context.now >= group.expiresAt) return;
  sendChatMessage(context, actorAccess(context, group.coordinatorId), groupId, { clientMessageId: intent(n), text });
}

/**
 * Activates G/K/N's bounded source-time scripts. All work belongs to the simulator scheduler,
 * so reset/disposal cancels it; no listeners, native permissions or OS delivery are invented.
 */
export function activateScenarioActions(simulator: Simulator<MockWorld>): void {
  const plan = simulator.state.scenarioPlan;
  const start = simulator.state.activatedAt;
  if (plan?.kind === 'offline') {
    simulator.schedule(start + 5000, () => simulator.setConnection('disconnected'));
    simulator.schedule(start + 10000, (context) => reply(context, plan.groupId, 'A plan update while you were offline.', 3));
    simulator.schedule(start + 15000, () => simulator.setConnection('connected'));
  } else if (plan?.kind === 'notification') {
    simulator.schedule(start + 30000, (context) => {
      const group = context.state.groups.get(plan.groupId);
      if (!group || group.status !== 'forming' || context.now >= group.expiresAt || group.members.length < 2 || group.meetingPoint === null) return;
      updateGroupStatus(context, actorAccess(context, group.coordinatorId), group.id, {
        operationId: intent(4), status: 'ready', expectedVersion: group.version,
      });
    });
    simulator.schedule(start + 40000, (context) => reply(context, plan.groupId, 'The group is ready to meet.', 5));
  } else if (plan?.kind === 'session') {
    simulator.schedule(start + 20000, (context) => {
      for (const record of context.state.auth.accessTokens.values()) record.expiresAt = context.now;
    });
    simulator.schedule(start + 40000, (context) => {
      for (const record of context.state.auth.accessTokens.values()) record.expiresAt = context.now;
      for (const record of context.state.auth.refreshTokens.values()) record.expiresAt = context.now;
    });
  }
}
