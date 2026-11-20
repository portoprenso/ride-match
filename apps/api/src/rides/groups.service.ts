import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JoinGroupResultSchema, LeaveGroupResultSchema, RideGroupSchema } from '@ride-match/contracts';
import type { JoinGroupInput, LeaveGroupInput, UpdateGroupStatusInput } from '@ride-match/contracts';
import { API_CONFIG } from '../config/environment.js';
import type { ApiConfig } from '../config/environment.js';
import { RideDomain } from './domain.js';
import { RideStore, domainError, live } from './store.js';
import type { GroupRow, RideRow } from './store.js';
import { mutation } from './receipts.js';
import { leaveLiveGroup } from './leave.js';
import { closeGroup, reconcilePoint } from './lifecycle.js';

/** Membership/state operations commit requests, seats, receipts and event intents in one transaction. */
@Injectable()
export class RideGroupsService {
  constructor(@Inject(RideDomain) private readonly domain: RideDomain, @Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async preview(id: string, actor: string | null = null) {
    return this.domain.run(async (store) => {
      const row = await store.group(id);
      if (!row || !live(row) || (actor && await store.relationship(actor, (await store.members(id)).map((m) => m.user_id)))) throw domainError('TARGET_UNAVAILABLE', 404, 'Group unavailable.');
      return store.preview(row);
    });
  }
  async read(actor: string, id: string) {
    return this.domain.run(async (store, now) => store.privateGroup((await store.readable(id, actor, now)).group));
  }
  async join(actor: string, input: JoinGroupInput) {
    return this.domain.run((store, now) => mutation({ store, now, actor, operationId: input.operationId,
      operation: 'groups.join', target: `${input.target.kind}:${input.target.id}`, input, secret: this.config.API_AUTH_SECRET, schema: JoinGroupResultSchema,
      perform: async () => {
        const own = await store.ride(input.rideRequestId);
        if (!own || own.user_id !== actor) throw domainError('FORBIDDEN', 403, 'Request ownership required.');
        if (own.status === 'grouped') throw domainError('ALREADY_IN_GROUP', 409, 'Already in a group.');
        if (own.status === 'expired') throw domainError('RIDE_EXPIRED', 410, 'Ride request expired.');
        if (own.status !== 'active') throw domainError('INVALID_TRANSITION', 422, 'Request is not active.');
        let group: GroupRow | undefined;
        let targetRide: RideRow | undefined;
        if (input.target.kind === 'ride') {
          targetRide = await store.ride(input.target.id);
          if (targetRide?.status === 'grouped' && targetRide.group_id) group = await store.group(targetRide.group_id);
          else if (targetRide?.status !== 'active') targetRide = undefined;
        } else group = await store.group(input.target.id);
        if ((!group && !targetRide) || (group && !live(group))) throw domainError('TARGET_UNAVAILABLE', 404, 'Join target unavailable.');
        const participants = group ? (await store.members(group.id)).map((m) => m.user_id) : [targetRide!.user_id];
        const relation = await store.relationship(actor, participants);
        if (relation === 'incoming') throw domainError('TARGET_UNAVAILABLE', 404, 'Join target unavailable.');
        if (relation === 'outgoing') throw domainError('BLOCKED_RELATIONSHIP', 409, 'Pairing is unavailable.');
        if (group?.status === 'ready') throw domainError('GROUP_CLOSED', 409, 'Group is not accepting joins.');
        if (group && (await store.members(group.id)).length >= 4) throw domainError('GROUP_FULL', 409, 'Group is full.');
        if (!group) {
          const target = targetRide!;
          if (target.user_id === actor) throw domainError('VALIDATION_FAILED', 422, 'Choose another rider.');
          const id = randomUUID();
          group = (await store.client.query<GroupRow>(`INSERT INTO ride_match.ride_groups
            (id,status,coordinator_id,destination,public_latitude,public_longitude,departure_at,created_at,expires_at,version)
            VALUES ($1,'forming',$2,$3,$4,$5,$6,$7,$8,1) RETURNING *`,
          [id, target.user_id, JSON.stringify(target.destination), target.public_latitude, target.public_longitude, target.departure_at, now, new Date(now.getTime() + 1800000)])).rows[0]!;
          await this.addMember(store, group, target, 1, 1, now);
          await this.groupRequest(store, target, group.id, now);
        } else {
          group = (await store.client.query<GroupRow>('UPDATE ride_match.ride_groups SET version=version+1 WHERE id=$1 RETURNING *', [group.id])).rows[0]!;
        }
        const members = await store.members(group.id);
        const seat = [1, 2, 3, 4].find((value) => !members.some((member) => member.seat === value))!;
        const order = (await store.client.query<{ next: number }>('SELECT COALESCE(max(join_order),0)+1 AS next FROM ride_match.group_memberships WHERE group_id=$1', [group.id])).rows[0]!.next;
        const membershipId = await this.addMember(store, group, own, seat, order, now);
        await this.groupRequest(store, own, group.id, now);
        await reconcilePoint(store, group, now);
        const current = (await store.group(group.id))!;
        await store.intent('group.changed', group.id, current.version, now, { reason: 'member_joined', actorId: actor });
        await store.intent('nearby.upserted.group', group.id, current.version, now);
        return { result: JoinGroupResultSchema.parse({ group: await store.privateGroup(current), rideRequest: await store.ownRide((await store.ride(own.id))!) }), accessMembershipId: membershipId };
      } }));
  }
  async leave(actor: string, id: string, input: LeaveGroupInput) {
    return this.domain.run((store, now) => mutation({ store, now, actor, operationId: input.operationId,
      operation: 'groups.leave', target: id, input, secret: this.config.API_AUTH_SECRET, schema: LeaveGroupResultSchema,
      perform: async () => {
        return { result: await leaveLiveGroup(store, actor, id, now) };
      } }));
  }
  async update(actor: string, id: string, input: UpdateGroupStatusInput) {
    return this.domain.run((store, now) => mutation({ store, now, actor, operationId: input.operationId,
      operation: 'groups.updateStatus', target: id, input, secret: this.config.API_AUTH_SECRET, schema: RideGroupSchema,
      perform: async () => {
        const member = (await store.members(id)).find((entry) => entry.user_id === actor);
        const group = await store.group(id);
        if (!member || !group) throw domainError('MEMBERSHIP_REQUIRED', 403, 'Group membership required.');
        if (group.coordinator_id !== actor) throw domainError('FORBIDDEN', 403, 'Coordinator role required.');
        if (!live(group)) throw domainError('GROUP_CLOSED', 409, 'Group is closed.');
        if (group.version !== input.expectedVersion) throw domainError('VERSION_CONFLICT', 409, 'Group changed.');
        const allowed = input.status === 'cancelled' || (group.status === 'forming' && input.status === 'ready' && await store.point(id)) ||
          (group.status === 'ready' && (input.status === 'forming' || input.status === 'completed'));
        if (!allowed) throw domainError('INVALID_TRANSITION', 422, 'Group transition is not allowed.');
        let updated: GroupRow;
        if (input.status === 'completed' || input.status === 'cancelled') updated = await closeGroup(store, group, input.status,
          input.status === 'completed' ? 'completed' : 'coordinator_cancelled', now);
        else {
          updated = (await store.client.query<GroupRow>('UPDATE ride_match.ride_groups SET status=$2,version=version+1 WHERE id=$1 RETURNING *', [id, input.status])).rows[0]!;
          await store.intent('group.changed', id, updated.version, now, { reason: input.status === 'ready' ? 'ready' : 'reopened', actorId: actor });
          await store.intent('nearby.upserted.group', id, updated.version, now);
        }
        return { result: await store.privateGroup(updated), accessMembershipId: member.id };
      } }));
  }
  private async addMember(store: RideStore, group: GroupRow, ride: RideRow, seat: number, order: number, now: Date): Promise<string> {
    const id = randomUUID();
    await store.client.query(`INSERT INTO ride_match.group_memberships (id,group_id,user_id,request_id,seat,join_order,joined_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, group.id, ride.user_id, ride.id, seat, order, now]);
    return id;
  }
  private async groupRequest(store: RideStore, row: RideRow, id: string, now: Date): Promise<void> {
    await store.client.query("UPDATE ride_match.ride_requests SET status='grouped',group_id=$2,version=version+1 WHERE id=$1", [row.id, id]);
    await store.intent('ride.changed', row.id, row.version + 1, now);
    await store.intent('nearby.removed.ride', row.id, row.version + 1, now);
  }
}
