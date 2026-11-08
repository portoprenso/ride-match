import {
  NOTIFICATION_POLICY,
  NOTIFICATION_SCHEMA_VERSION,
  NotificationPayloadSchema,
  type DomainEventDto,
  type InstallationId,
  type NotificationPayloadDto,
} from '@ride-match/contracts';

import type { Simulator } from './simulator';
import type { GroupRecord, MockWorld } from './world';

/*
 * The mock push service (NOTIFICATION-001-B): it plays the backend's part in notifications. For
 * each published event that warrants one (docs/api/realtime.md, "Notification payloads"), it
 * builds the payload for each recipient and hands it to every installation that recipient
 * registered with a granted permission, through `deliver`. The composition root presents a
 * delivery to this app's own installation as a local notification; nothing is sent anywhere.
 *
 * - Recipients follow the contract: `matches.available` to the request's owner;
 *   `group.member_joined` to the members already in the group, never the rider who joined;
 *   `group.ready` to the members other than the coordinator; `chat.message_created` to the
 *   members other than the sender.
 * - Payloads hold IDs and times only, and are checked against `NotificationPayloadSchema`
 *   before delivery; a payload that fails is a bug and is not delivered.
 * - A registration whose session was revoked, or whose permission is not `granted`, gets
 *   nothing. Registrations end when their session signs out (`devices.ts`).
 */

/** Receives one payload for one installation. */
export type PushDelivery = (installationId: InstallationId, payload: NotificationPayloadDto) => void;

const LIFETIME_MS = NOTIFICATION_POLICY.maxLifetimeSeconds * 1000;

/**
 * Starts delivering notifications for `simulator`'s events until the returned function is
 * called. It survives disconnects and scenario resets, as a push service would.
 */
export function startMockPush(simulator: Simulator<MockWorld>, deliver: PushDelivery): () => void {
  let count = 0;
  // How many of each request's matches were already announced, for the world they belong to.
  let announced = new Map<string, number>();
  let announcedWorld: MockWorld | null = null;

  const send = (
    world: MockWorld,
    recipients: readonly string[],
    issuedAt: number,
    expiresAt: number,
    fields: Record<string, unknown>,
  ) => {
    for (const userId of recipients) {
      for (const device of world.pushDevices.values()) {
        if (device.userId !== userId || device.permission !== 'granted') continue;
        if (world.auth.sessions.get(device.sessionId)?.revoked !== false) continue;
        count += 1;
        const parsed = NotificationPayloadSchema.safeParse({
          id: `ntf_${count}`,
          schemaVersion: NOTIFICATION_SCHEMA_VERSION,
          issuedAt: new Date(issuedAt).toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
          ...fields,
        });
        if (parsed.success) deliver(device.installationId, parsed.data);
      }
    }
  };

  const handle = (event: DomainEventDto) => {
    const world = simulator.state;
    if (world !== announcedWorld) {
      announced = new Map();
      announcedWorld = world;
    }
    const issuedAt = Date.parse(event.occurredAt);
    const latest = issuedAt + LIFETIME_MS;
    // A group's private view stays readable for at least the hour after any live event; a
    // closed group's only until its history expires.
    const groupExpiry = (group: GroupRecord) => Math.min(latest, group.closure?.historyExpiresAt ?? latest);

    switch (event.type) {
      case 'matches.changed': {
        const ride = world.rides.get(event.payload.rideRequestId);
        const set = world.ownerMatches.get(event.payload.rideRequestId);
        if (ride === undefined || set === undefined || ride.status !== 'active') return;
        // Matches arrive in order; only those not announced yet count. One names its target,
        // several name none. A change without arrivals (a match ended) announces nothing.
        const fresh = set.matches.slice(announced.get(ride.id) ?? 0);
        announced.set(ride.id, set.matches.length);
        if (fresh.length === 0) return;
        const target = fresh.length === 1 ? { kind: fresh[0]!.target.kind, id: fresh[0]!.target.id } : null;
        send(world, [ride.userId], issuedAt, Math.min(latest, ride.expiresAt), {
          kind: 'matches.available',
          rideRequestId: ride.id,
          target,
        });
        return;
      }
      case 'group.changed': {
        const group = world.groups.get(event.payload.groupId);
        if (group === undefined) return;
        if (event.payload.reason === 'member_joined') {
          const joiner = group.members.reduce((latestMember, member) =>
            member.joinedAt > latestMember.joinedAt ? member : latestMember,
          );
          const recipients = group.members.filter((member) => member !== joiner).map((member) => member.userId);
          send(world, recipients, issuedAt, groupExpiry(group), { kind: 'group.member_joined', groupId: group.id });
        } else if (event.payload.reason === 'ready') {
          const recipients = group.members
            .map((member) => member.userId)
            .filter((userId) => userId !== group.coordinatorId);
          send(world, recipients, issuedAt, groupExpiry(group), { kind: 'group.ready', groupId: group.id });
        }
        return;
      }
      case 'chat.message.created': {
        const { message } = event.payload;
        const group = world.groups.get(message.groupId);
        if (group === undefined) return;
        const recipients = group.members
          .map((member) => member.userId)
          .filter((userId) => userId !== message.sender.id);
        send(world, recipients, issuedAt, groupExpiry(group), {
          kind: 'chat.message_created',
          groupId: group.id,
          messageId: message.id,
        });
        return;
      }
      default:
        return;
    }
  };

  return simulator.observe(handle);
}
