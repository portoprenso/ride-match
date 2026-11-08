import type {
  CoordinatesDto,
  DepartureOffsetMinutes,
  GroupClosureReason,
  GroupStatus,
  LocationSource,
  MatchLevel,
  PublicLocationDto,
  ReportReason,
  RideRequestStatus,
} from '@ride-match/contracts';

/*
 * The records the mock source stores. They are internal: only the serializers turn them into
 * contract DTOs, field by field, so a private field can reach a response only if a serializer
 * names it. Times are simulated milliseconds; serializers write them as ISO timestamps.
 * Records stay in the world after they end, so late reads and events can still find them.
 */

/** A rider's public profile. Phone numbers and sessions belong to the auth records (AUTH-001-A), never here. */
export type UserRecord = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

/**
 * A ride request.
 *
 * - `origin` is the exact pickup point. It is private: only the owner's own view (RIDE-001-A)
 *   may contain it, never a public projection or an event.
 * - `publicOrigin` is the sanitized area shown to everyone instead. Seeds choose it as a
 *   district around the origin; the mock never claims to obfuscate a real position.
 * - `groupId` is set once the request joined a group.
 */
export type RideRecord = {
  id: string;
  userId: string;
  origin: { coordinates: CoordinatesDto; source: LocationSource };
  publicOrigin: PublicLocationDto;
  destinationPlaceId: string;
  createdAt: number;
  departureAt: number;
  expiresAt: number;
  status: RideRequestStatus;
  groupId: string | null;
  version: number;
};

/** One member of a group, linked to the ride request it joined with. */
export type GroupMemberRecord = {
  userId: string;
  rideRequestId: string;
  joinedAt: number;
};

/** A group's shared meeting place: member-only, never in a public preview. */
export type MeetingPointRecord = {
  id: string;
  coordinates: CoordinatesDto;
  label: string;
};

/**
 * A group. Its members, coordinator and meeting point are member-only; the public preview
 * shows only its status, member count, `publicOrigin` area, destination and times.
 */
export type GroupRecord = {
  id: string;
  status: GroupStatus;
  coordinatorId: string;
  /** In join order; the two founders joined at `createdAt`. */
  members: GroupMemberRecord[];
  destinationPlaceId: string;
  departureAt: number;
  publicOrigin: PublicLocationDto;
  meetingPoint: MeetingPointRecord | null;
  createdAt: number;
  expiresAt: number;
  closure: { reason: GroupClosureReason; closedAt: number; historyExpiresAt: number } | null;
  version: number;
};

/**
 * One stored chat message. `sequence` is its position in its group's chat (1, 2, 3… with no
 * gaps). `senderId` names a user record, which outlives membership, so a message keeps its
 * sender's public summary after they leave. `clientMessageId` is the sender's send intent:
 * with the sender and the group, it identifies one message. The text is private to the
 * group's members and never reaches a public DTO, an event for anyone else, or a log.
 */
export type MessageRecord = {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
  sequence: number;
  clientMessageId: string;
};

/**
 * A one-time code challenge. `wrongCodes` counts rejected codes; a challenge ends `used` by a
 * successful verification or `replaced` by a newer one for the same number, and also stops
 * working at `expiresAt`.
 */
export type OtpChallengeRecord = {
  id: string;
  phoneNumber: string;
  expiresAt: number;
  resendAvailableAt: number;
  wrongCodes: number;
  status: 'open' | 'used' | 'replaced';
};

/** A signed-in session; logging out revokes it, and with it every token it issued. */
export type SessionRecord = {
  id: string;
  userId: string;
  revoked: boolean;
};

/** A refresh token. Refreshing marks it `rotated`, after which it never works again. */
export type RefreshTokenRecord = {
  sessionId: string;
  expiresAt: number;
  status: 'current' | 'rotated';
};

/**
 * Everything authentication holds. It is private: phone numbers, codes and tokens never reach a
 * public DTO, an event or a log, and only `auth.ts` reads them.
 */
export type AuthRecords = {
  /** The synthetic rider each demo phone number signs in as, kept across sign-outs until a reset. */
  accounts: Map<string, string>;
  challenges: Map<string, OtpChallengeRecord>;
  /** The newest challenge for each phone number, which a new request replaces. */
  latestChallenges: Map<string, string>;
  sessions: Map<string, SessionRecord>;
  /** Access tokens and when each expires; a token works only while its session is not revoked. */
  accessTokens: Map<string, { sessionId: string; expiresAt: number }>;
  refreshTokens: Map<string, RefreshTokenRecord>;
};

/**
 * A match the scenario supplies for a destination choice (DESTINATION-001-A). Discovery returns
 * it as an advisory preview when a read names `destinationPlaceId`; the mock never computes
 * compatibility, routes or scores (docs/MOCK_SCENARIOS.md, "Matching is a fixture").
 *
 * - `target` is the ride or group it describes; it shows only while discovery returns that item.
 * - `departures` lists the departure choices it holds for, or `null` for any. A read that names
 *   no departure choice gets every match for its destination.
 */
export type SuppliedMatchRecord = {
  destinationPlaceId: string;
  target: { kind: 'ride' | 'group'; id: string };
  level: MatchLevel;
  additionalMinutes: number | null;
  departures: readonly DepartureOffsetMinutes[] | null;
};

/**
 * A match the scenario supplies to a rider's own request after they create it (scenario C,
 * RIDE-001-D): `delayMs` after creation the source matches it with `targetRideId`, if both are
 * still active, for `lifetimeMs`. Fixture data; the mock never computes compatibility.
 */
export type MatchArrivalPlan = {
  delayMs: number;
  targetRideId: string;
  level: MatchLevel;
  additionalMinutes: number | null;
  lifetimeMs: number;
};

/** One supplied match of an own request, owner-only; it holds until `expiresAt`. */
export type OwnerMatchRecord = {
  target: { kind: 'ride' | 'group'; id: string };
  level: MatchLevel;
  additionalMinutes: number | null;
  expiresAt: number;
};

/**
 * One rider's block of another (SAFETY-001-A). Only the blocker sees it; it filters each from the
 * other's discovery, matches and joins in both directions.
 */
export type BlockRecord = { blockerId: string; blockedId: string; blockedAt: number };

/**
 * An accepted report (SAFETY-001-A): who reported whom, why, in which group and about which
 * message. It exists so tests can see a report was stored once; the mock makes no moderation
 * decision. The details are private and never leave this record.
 */
export type ReportRecord = {
  id: string;
  reporterId: string;
  targetId: string;
  reason: ReportReason;
  details: string | null;
  context: { groupId: string; messageId: string | null } | null;
  receivedAt: number;
};

/**
 * The mock source's world. Curated places are not part of it: they are a fixed catalog shared by
 * every scenario (`places.ts`).
 */
export type MockWorld = {
  /** Simulated time the scenario was activated; its timed events count from here. */
  activatedAt: number;
  users: Map<string, UserRecord>;
  rides: Map<string, RideRecord>;
  groups: Map<string, GroupRecord>;
  /** Matches the scenario supplies for destination choices, in seed order. */
  suppliedMatches: SuppliedMatchRecord[];
  /** Matches the scenario supplies to every own request created in it (scenario C). */
  matchArrivals: MatchArrivalPlan[];
  /** Each own request's match set: its version and the matches it gained, in arrival order. */
  ownerMatches: Map<string, { version: number; matches: OwnerMatchRecord[] }>;
  /** Each group's chat, in sequence order (CHAT-001-A); a group without messages has no entry. */
  messages: Map<string, MessageRecord[]>;
  /**
   * Scenario H's scripted chat faults (CHAT-001-C). `lostAnswers` new messages are stored but
   * their answer and event are lost, as if the connection dropped right after the source
   * stored them; the retry that finds one gets its event twice (`echoTwice`), as a duplicate
   * delivery would. Zero and empty in every other scenario.
   */
  chatFaults: { lostAnswers: number; echoTwice: Set<string> };
  /** Every block in force, oldest first; unblocking removes one (SAFETY-001-A). */
  blocks: BlockRecord[];
  /** Accepted reports, oldest first (SAFETY-001-A). */
  reports: ReportRecord[];
  /** No sessions in any scenario, so a reset signs everyone out; only scenarios H, J and L link the demo number to a seeded rider. */
  auth: AuthRecords;
};

/** A world with nothing in it yet, activated at `now`. */
export function createEmptyWorld(now: number): MockWorld {
  return {
    activatedAt: now,
    users: new Map(),
    rides: new Map(),
    groups: new Map(),
    suppliedMatches: [],
    matchArrivals: [],
    ownerMatches: new Map(),
    messages: new Map(),
    chatFaults: { lostAnswers: 0, echoTwice: new Set() },
    blocks: [],
    reports: [],
    auth: {
      accounts: new Map(),
      challenges: new Map(),
      latestChallenges: new Map(),
      sessions: new Map(),
      accessTokens: new Map(),
      refreshTokens: new Map(),
    },
  };
}

/** Whether a group is live (`forming` or `ready`), the only kind discovery shows. */
export function isLiveGroup(group: GroupRecord): boolean {
  return group.status === 'forming' || group.status === 'ready';
}

/**
 * Whether a ride shows on its own in discovery: only an active request does. A grouped request
 * is `grouped`, so its group stands for it once and its rider is never shown twice.
 */
export function isDiscoverableRide(ride: RideRecord): boolean {
  return ride.status === 'active';
}

/** Whether `blockerId` blocked `blockedId`. */
export function hasBlocked(world: MockWorld, blockerId: string, blockedId: string): boolean {
  return world.blocks.some((block) => block.blockerId === blockerId && block.blockedId === blockedId);
}

/** Whether either rider blocked the other: then they never see or pair with each other. */
export function isBlockedPair(world: MockWorld, one: string, other: string): boolean {
  return hasBlocked(world, one, other) || hasBlocked(world, other, one);
}
