import type {
  CoordinatesDto,
  GroupClosureReason,
  GroupStatus,
  LocationSource,
  PublicLocationDto,
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
 * The mock source's world. Curated places are not part of it: they are a fixed catalog shared by
 * every scenario (`places.ts`). Later cards add their own records, such as sessions or messages.
 */
export type MockWorld = {
  /** Simulated time the scenario was activated; its timed events count from here. */
  activatedAt: number;
  users: Map<string, UserRecord>;
  rides: Map<string, RideRecord>;
  groups: Map<string, GroupRecord>;
};

/** A world with nothing in it yet, activated at `now`. */
export function createEmptyWorld(now: number): MockWorld {
  return { activatedAt: now, users: new Map(), rides: new Map(), groups: new Map() };
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
