import {
  GROUP_POLICY,
  type AuthSessionDto,
  type CurrentUserDto,
  type GroupChangeReason,
  type GroupChangedEventDto,
  type GroupPreviewDto,
  type JoinTargetDto,
  type MatchPreviewDto,
  type MatchesChangedEventDto,
  type NearbyItemDto,
  type NearbyRemovalReason,
  type NearbyRemovedEventDto,
  type NearbyUpsertedEventDto,
  type OwnRideRequestDto,
  type OtpChallengeDto,
  type PlaceDto,
  type PublicLocationDto,
  type RideChangedEventDto,
  type RideGroupDto,
  type RideRequestDto,
  type SessionCredentialsDto,
  type UserDto,
} from '@ride-match/contracts';

import { findPlace } from './places';
import type { EventEnvelope } from './simulator';
import {
  isDiscoverableRide,
  isLiveGroup,
  type GroupRecord,
  type MockWorld,
  type OtpChallengeRecord,
  type RideRecord,
  type SuppliedMatchRecord,
  type UserRecord,
} from './world';

/*
 * Safe serializers: the only way records leave the mock source. Each one builds a new DTO field
 * by field, so callers never share or change world state, and a field a contract does not list
 * cannot leak. Public serializers refuse records that have no public projection, rather than
 * trusting each caller to check first. Outputs and events are validated against the contract
 * schemas in tests.
 */

const toTimestamp = (milliseconds: number) => new Date(milliseconds).toISOString();

export function toUserDto(user: UserRecord): UserDto {
  return { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl };
}

export function toPlaceDto(place: PlaceDto): PlaceDto {
  return {
    id: place.id,
    label: place.label,
    detail: place.detail,
    coordinates: { latitude: place.coordinates.latitude, longitude: place.coordinates.longitude },
  };
}

function toPublicLocationDto(area: PublicLocationDto): PublicLocationDto {
  return {
    center: { latitude: area.center.latitude, longitude: area.center.longitude },
    radiusMeters: area.radiusMeters,
    label: area.label,
  };
}

/** A challenge as its requester sees it: never the code or the phone number. */
export function toOtpChallengeDto(challenge: OtpChallengeRecord): OtpChallengeDto {
  return {
    id: challenge.id,
    expiresAt: toTimestamp(challenge.expiresAt),
    resendAvailableAt: toTimestamp(challenge.resendAvailableAt),
  };
}

/** Tokens just issued to a session, with their expiry times in simulated milliseconds. */
export type IssuedCredentials = {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
};

export function toSessionCredentialsDto(credentials: IssuedCredentials): SessionCredentialsDto {
  return {
    accessToken: credentials.accessToken,
    accessTokenExpiresAt: toTimestamp(credentials.accessTokenExpiresAt),
    refreshToken: credentials.refreshToken,
    refreshTokenExpiresAt: toTimestamp(credentials.refreshTokenExpiresAt),
  };
}

/** A new session for its own user: the public summary and the credentials, no phone number. */
export function toAuthSessionDto(user: UserRecord, credentials: IssuedCredentials): AuthSessionDto {
  return { user: toUserDto(user), ...toSessionCredentialsDto(credentials) };
}

/**
 * The signed-in user with references to their live request and its group, so the app can
 * restore navigation. Only the user themself receives it.
 */
export function toCurrentUserDto(world: MockWorld, user: UserRecord): CurrentUserDto {
  const ride = [...world.rides.values()].find(
    (candidate) => candidate.userId === user.id && (candidate.status === 'active' || candidate.status === 'grouped'),
  );
  return { user: toUserDto(user), rideRequestId: ride?.id ?? null, groupId: ride?.groupId ?? null };
}

function requireUser(world: MockWorld, userId: string): UserRecord {
  const user = world.users.get(userId);
  if (user === undefined) throw new Error(`The mock world has no user ${userId}.`);
  return user;
}

function requirePlace(placeId: string): PlaceDto {
  const place = findPlace(placeId);
  if (place === undefined) throw new Error(`The curated catalog has no place ${placeId}.`);
  return place;
}

/**
 * The public projection of an active ride request: the rider's public summary, the public
 * area instead of the exact origin, and no status or group.
 *
 * @throws {Error} For a request that is not active, which has no public projection.
 */
export function toRideRequestDto(world: MockWorld, ride: RideRecord): RideRequestDto {
  if (!isDiscoverableRide(ride)) throw new Error(`Ride ${ride.id} is ${ride.status} and has no public projection.`);
  return {
    id: ride.id,
    user: toUserDto(requireUser(world, ride.userId)),
    publicOrigin: toPublicLocationDto(ride.publicOrigin),
    destination: toPlaceDto(requirePlace(ride.destinationPlaceId)),
    departureAt: toTimestamp(ride.departureAt),
    expiresAt: toTimestamp(ride.expiresAt),
    version: ride.version,
  };
}

/**
 * The owner's own view of their request (`GET /me/ride-request`, create and cancel results): the
 * public fields plus status, group and the exact origin. Only the owner may receive it. Unlike
 * the public projection it exists in every status, so the app can explain how a request ended.
 */
export function toOwnRideRequestDto(world: MockWorld, ride: RideRecord): OwnRideRequestDto {
  return {
    id: ride.id,
    user: toUserDto(requireUser(world, ride.userId)),
    publicOrigin: toPublicLocationDto(ride.publicOrigin),
    destination: toPlaceDto(requirePlace(ride.destinationPlaceId)),
    departureAt: toTimestamp(ride.departureAt),
    expiresAt: toTimestamp(ride.expiresAt),
    version: ride.version,
    status: ride.status,
    groupId: ride.groupId,
    origin: { coordinates: { ...ride.origin.coordinates }, source: ride.origin.source },
  };
}

/**
 * The public preview of a live group: its status, member count and public area, without
 * members, coordinator, meeting point or linked requests.
 *
 * @throws {Error} For a closed group, which has no preview.
 */
export function toGroupPreviewDto(group: GroupRecord): GroupPreviewDto {
  if (group.status !== 'forming' && group.status !== 'ready') {
    throw new Error(`Group ${group.id} is ${group.status} and has no public preview.`);
  }
  return {
    id: group.id,
    status: group.status,
    memberCount: group.members.length,
    capacity: GROUP_POLICY.capacity,
    publicOrigin: toPublicLocationDto(group.publicOrigin),
    destination: toPlaceDto(requirePlace(group.destinationPlaceId)),
    departureAt: toTimestamp(group.departureAt),
    expiresAt: toTimestamp(group.expiresAt),
    version: group.version,
  };
}

/**
 * The member-only view of a group (`RideGroupDto`): its members' public summaries in join order,
 * the coordinator, the meeting point and the closure. Only the group's members may receive it;
 * it never holds a member's exact origin. The meeting point's walking estimate is viewer-specific
 * and the mock supplies none yet, so it is `null`.
 */
export function toRideGroupDto(world: MockWorld, group: GroupRecord): RideGroupDto {
  const { meetingPoint, closure } = group;
  return {
    id: group.id,
    status: group.status,
    coordinatorId: group.coordinatorId,
    members: group.members.map((member) => ({
      user: toUserDto(requireUser(world, member.userId)),
      joinedAt: toTimestamp(member.joinedAt),
      rideRequestId: member.rideRequestId,
    })),
    capacity: GROUP_POLICY.capacity,
    destination: toPlaceDto(requirePlace(group.destinationPlaceId)),
    departureAt: toTimestamp(group.departureAt),
    meetingPoint:
      meetingPoint === null
        ? null
        : {
            id: meetingPoint.id,
            coordinates: { latitude: meetingPoint.coordinates.latitude, longitude: meetingPoint.coordinates.longitude },
            label: meetingPoint.label,
            walkingMinutes: null,
          },
    createdAt: toTimestamp(group.createdAt),
    expiresAt: toTimestamp(group.expiresAt),
    closure:
      closure === null
        ? null
        : {
            reason: closure.reason,
            closedAt: toTimestamp(closure.closedAt),
            historyExpiresAt: toTimestamp(closure.historyExpiresAt),
          },
    version: group.version,
  };
}

/** A discovery item, which is how both nearby reads and `nearby.upserted` events carry a ride or group. */
export type DiscoveryRecord = { kind: 'ride'; record: RideRecord } | { kind: 'group'; record: GroupRecord };

/** The rides and groups discovery shows: active solo rides and live groups, each once. */
export function discoveryRecords(world: MockWorld): DiscoveryRecord[] {
  return [
    ...[...world.rides.values()].filter(isDiscoverableRide).map((record) => ({ kind: 'ride' as const, record })),
    ...[...world.groups.values()].filter(isLiveGroup).map((record) => ({ kind: 'group' as const, record })),
  ];
}

export function toNearbyItemDto(world: MockWorld, item: DiscoveryRecord): NearbyItemDto {
  return item.kind === 'ride'
    ? { kind: 'ride', ...toRideRequestDto(world, item.record) }
    : { kind: 'group', ...toGroupPreviewDto(item.record) };
}

/** A supplied match as discovery's advisory preview: its target, level and extra minutes only. */
export function toMatchPreviewDto(match: SuppliedMatchRecord): MatchPreviewDto {
  return {
    target: { kind: match.target.kind, id: match.target.id },
    level: match.level,
    additionalMinutes: match.additionalMinutes,
  };
}

/** Tells the owner their match set changed; they reread it (`GET /rides/{rideId}/matches`). */
export function matchesChanged(envelope: EventEnvelope, ride: RideRecord, version: number): MatchesChangedEventDto {
  return {
    ...envelope,
    type: 'matches.changed',
    audience: { kind: 'user', userId: ride.userId },
    payload: { rideRequestId: ride.id, version },
  };
}

export function nearbyUpserted(envelope: EventEnvelope, item: NearbyItemDto): NearbyUpsertedEventDto {
  return { ...envelope, type: 'nearby.upserted', audience: { kind: 'public' }, payload: { item } };
}

/** A removal tombstone: the target and its version after the change, never where it was or why beyond `reason`. */
export function nearbyRemoved(
  envelope: EventEnvelope,
  target: JoinTargetDto,
  version: number,
  reason: NearbyRemovalReason,
): NearbyRemovedEventDto {
  return {
    ...envelope,
    type: 'nearby.removed',
    audience: { kind: 'public' },
    payload: { target: { kind: target.kind, id: target.id }, version, reason },
  };
}

/** Tells the owner, and only the owner, that their request changed; the owner rereads it for details. */
export function rideChanged(envelope: EventEnvelope, ride: RideRecord): RideChangedEventDto {
  return {
    ...envelope,
    type: 'ride.changed',
    audience: { kind: 'user', userId: ride.userId },
    payload: { rideRequestId: ride.id, version: ride.version, status: ride.status },
  };
}

/** Tells the group's members that it changed; they reread the group for details. */
export function groupChanged(
  envelope: EventEnvelope,
  group: GroupRecord,
  reason: GroupChangeReason,
): GroupChangedEventDto {
  return {
    ...envelope,
    type: 'group.changed',
    audience: { kind: 'group', groupId: group.id },
    payload: { groupId: group.id, version: group.version, reason },
  };
}
