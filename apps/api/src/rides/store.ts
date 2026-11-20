import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  GroupPreviewSchema, OwnRideRequestSchema, RideGroupSchema, RideRequestSchema,
} from '@ride-match/contracts';
import type { GroupStatus, RideRequestStatus, PlaceDto, UserDto, MeetingPointDto, GroupClosureReason, GroupMemberDto } from '@ride-match/contracts';
import { ApiException } from '../http/api-exception.js';

export type RideRow = {
  id: string; user_id: string; status: RideRequestStatus; group_id: string | null;
  destination: PlaceDto; public_latitude: number; public_longitude: number;
  departure_at: Date; created_at: Date; expires_at: Date; version: number;
};
export type GroupRow = {
  id: string; status: GroupStatus; coordinator_id: string; destination: PlaceDto;
  public_latitude: number; public_longitude: number; departure_at: Date; created_at: Date;
  expires_at: Date; closed_at: Date | null; history_expires_at: Date | null;
  closure_reason: GroupClosureReason | null; version: number;
};
export type MemberRow = { id: string; group_id: string; user_id: string; request_id: string; seat: number; join_order: number; joined_at: Date; left_at: Date | null; live: boolean };
export const live = (group: GroupRow) => group.status === 'forming' || group.status === 'ready';
export const domainError = (code: ConstructorParameters<typeof ApiException>[0]['code'], status: number, message: string) => new ApiException({ code, message }, status);

/** Query/projection boundary. Sensitive origin reads occur only in owner serialization. */
export class RideStore {
  constructor(readonly client: pg.PoolClient) {}

  /** Incoming blocks remain indistinguishable from vanished public targets. */
  async relationship(actor: string, participants: readonly string[]): Promise<'incoming' | 'outgoing' | null> {
    const rows = (await this.client.query<{ actor_id: string; target_id: string }>(
      `SELECT actor_id,target_id FROM ride_match.user_blocks WHERE
        (target_id=$1 AND actor_id=ANY($2::uuid[])) OR (actor_id=$1 AND target_id=ANY($2::uuid[]))`, [actor, participants])).rows;
    return rows.some((r) => r.target_id === actor) ? 'incoming' : rows.length ? 'outgoing' : null;
  }

  async ride(id: string): Promise<RideRow | undefined> {
    return (await this.client.query<RideRow>('SELECT * FROM ride_match.ride_requests WHERE id=$1', [id])).rows[0];
  }
  async group(id: string): Promise<GroupRow | undefined> {
    return (await this.client.query<GroupRow>('SELECT * FROM ride_match.ride_groups WHERE id=$1', [id])).rows[0];
  }
  async members(group: string): Promise<MemberRow[]> {
    return (await this.client.query<MemberRow>(`SELECT * FROM ride_match.group_memberships WHERE group_id=$1 AND left_at IS NULL ORDER BY join_order`, [group])).rows;
  }
  async user(id: string): Promise<UserDto> {
    const row = (await this.client.query<{ id: string; display_name: string; avatar_url: string | null }>('SELECT id,display_name,avatar_url FROM ride_match.users WHERE id=$1', [id])).rows[0]!;
    return { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url };
  }
  async point(id: string): Promise<MeetingPointDto | null> {
    const row = (await this.client.query<{ id: string; latitude: number; longitude: number; label: string }>('SELECT id,latitude,longitude,label FROM ride_match.group_meeting_points WHERE group_id=$1', [id])).rows[0];
    return row ? { id: row.id, coordinates: { latitude: row.latitude, longitude: row.longitude }, label: row.label, walkingMinutes: null } : null;
  }
  async publicRide(row: RideRow) {
    return RideRequestSchema.parse({
      id: row.id, user: await this.user(row.user_id), publicOrigin: this.origin(row),
      destination: row.destination, departureAt: row.departure_at.toISOString(), expiresAt: row.expires_at.toISOString(), version: row.version,
    });
  }
  async ownRide(row: RideRow) {
    const origin = (await this.client.query<{ latitude: number; longitude: number; source: 'device' | 'manual' }>('SELECT latitude,longitude,source FROM ride_match.ride_origins WHERE request_id=$1', [row.id])).rows[0]!;
    return OwnRideRequestSchema.parse({ ...await this.publicRide(row), status: row.status, groupId: row.group_id,
      origin: { source: origin.source, coordinates: { latitude: origin.latitude, longitude: origin.longitude } } });
  }
  async preview(row: GroupRow) {
    return GroupPreviewSchema.parse({ id: row.id, status: row.status, memberCount: (await this.members(row.id)).length,
      capacity: 4, publicOrigin: this.origin(row), destination: row.destination, departureAt: row.departure_at.toISOString(), expiresAt: row.expires_at.toISOString(), version: row.version });
  }
  async privateGroup(row: GroupRow) {
    const members: GroupMemberDto[] = [];
    for (const member of await this.members(row.id)) members.push({ user: await this.user(member.user_id), joinedAt: member.joined_at.toISOString(), rideRequestId: member.request_id });
    return RideGroupSchema.parse({ id: row.id, status: row.status, coordinatorId: row.coordinator_id, members, capacity: 4,
      destination: row.destination, departureAt: row.departure_at.toISOString(), meetingPoint: await this.point(row.id),
      createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(), version: row.version,
      closure: row.closure_reason ? { reason: row.closure_reason, closedAt: row.closed_at!.toISOString(), historyExpiresAt: row.history_expires_at!.toISOString() } : null });
  }
  origin(row: Pick<RideRow, 'public_latitude' | 'public_longitude'>) {
    return { center: { latitude: row.public_latitude, longitude: row.public_longitude }, radiusMeters: 2000, label: null };
  }
  /** Checks current/closure authorization without revealing an unknown group to outsiders. */
  async readable(groupId: string, actor: string, now: Date, membershipId?: string): Promise<{ group: GroupRow; member: MemberRow }> {
    const member = (await this.members(groupId)).find((entry) => entry.user_id === actor && (!membershipId || entry.id === membershipId));
    const group = await this.group(groupId);
    if (!group || !member) throw domainError('MEMBERSHIP_REQUIRED', 403, 'Group membership required.');
    if (group.history_expires_at && group.history_expires_at <= now) throw domainError('HISTORY_EXPIRED', 410, 'Group history expired.');
    return { group, member };
  }
  /** Only resource references enter the outbox. Delivery/authorized event projection belongs to BE-005. */
  async intent(kind: string, id: string, version: number, now: Date): Promise<void> {
    await this.client.query('INSERT INTO ride_match.domain_outbox VALUES ($1,$2,$3,$4,$5)', [randomUUID(), kind, id, version, now]);
  }
}
