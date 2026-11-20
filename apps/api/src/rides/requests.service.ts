import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  OwnRideRequestSchema, PlaceSchema,
} from '@ride-match/contracts';
import type { CreateRideRequestInput, CancelRideRequestInput } from '@ride-match/contracts';
import { API_CONFIG } from '../config/environment.js';
import type { ApiConfig } from '../config/environment.js';
import { RideDomain } from './domain.js';
import { domainError } from './store.js';
import type { RideStore, RideRow } from './store.js';
import { approximateOrigin } from './policy.js';
import { mutation } from './receipts.js';
import { refreshMatches } from './matches.js';

/** Own request lifecycle and advisory match snapshots, isolated from HTTP/auth transport. */
@Injectable()
export class RideRequestsService {
  constructor(@Inject(RideDomain) private readonly domain: RideDomain, @Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async references(actor: string) {
    return this.domain.run(async (store) => ({
      rideRequestId: (await store.client.query<{ request_id: string }>('SELECT request_id FROM ride_match.current_requests WHERE user_id=$1', [actor])).rows[0]?.request_id ?? null,
      groupId: (await store.client.query<{ group_id: string }>('SELECT group_id FROM ride_match.group_memberships WHERE user_id=$1 AND live', [actor])).rows[0]?.group_id ?? null,
    }));
  }
  async own(actor: string) {
    return this.domain.run(async (store) => {
      const row = (await store.client.query<RideRow>('SELECT r.* FROM ride_match.current_requests c JOIN ride_match.ride_requests r ON r.id=c.request_id WHERE c.user_id=$1', [actor])).rows[0];
      return row ? store.ownRide(row) : null;
    });
  }
  async publicRead(id: string, actor: string | null = null) {
    return this.domain.run(async (store) => {
      const row = await store.ride(id);
      if (!row || row.status !== 'active' || (actor && await store.relationship(actor, [row.user_id]))) throw domainError('TARGET_UNAVAILABLE', 404, 'Ride unavailable.');
      return store.publicRide(row);
    });
  }
  async create(actor: string, input: CreateRideRequestInput) {
    return this.domain.run((store, now) => mutation({ store, now, actor, operationId: input.operationId,
      operation: 'rides.create', target: '', input, secret: this.config.API_AUTH_SECRET, schema: OwnRideRequestSchema,
      perform: async () => {
        if ((await store.client.query("SELECT 1 FROM ride_match.ride_requests WHERE user_id=$1 AND status IN ('active','grouped')", [actor])).rowCount) {
          throw domainError('ACTIVE_REQUEST_EXISTS', 409, 'A live request already exists.');
        }
        if (input.origin.source === 'device') {
          const age = now.getTime() - Date.parse(input.origin.capturedAt);
          if (age > 60000 || age < -10000) throw domainError('LOCATION_STALE', 422, 'Choose a fresh pickup location.');
        }
        const { latitude, longitude } = input.origin.coordinates;
        const coverage = await store.client.query('SELECT 1 FROM ride_match.place_coverage WHERE $1 BETWEEN south AND north AND $2 BETWEEN west AND east', [latitude, longitude]);
        if (!coverage.rowCount) throw domainError('UNSUPPORTED_AREA', 422, 'Pickup area is not supported.');
        const place = (await store.client.query<{ id: string; label: string; detail: string | null; latitude: number; longitude: number }>('SELECT * FROM ride_match.places WHERE id=$1', [input.destinationPlaceId])).rows[0];
        if (!place) throw domainError('VALIDATION_FAILED', 422, 'Destination is unavailable.');
        const destination = PlaceSchema.parse({ id: place.id, label: place.label, detail: place.detail, coordinates: { latitude: place.latitude, longitude: place.longitude } });
        const id = randomUUID();
        const publicOrigin = approximateOrigin(input.origin.coordinates);
        await store.client.query(`INSERT INTO ride_match.ride_requests (id,user_id,status,destination,public_latitude,public_longitude,departure_at,created_at,expires_at,version)
          VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,1)`, [id, actor, JSON.stringify(destination), publicOrigin.center.latitude, publicOrigin.center.longitude,
          new Date(now.getTime() + input.departureOffsetMinutes * 60000), now, new Date(now.getTime() + 900000)]);
        await store.client.query('INSERT INTO ride_match.ride_origins VALUES ($1,$2,$3,$4)', [id, latitude, longitude, input.origin.source]);
        await store.client.query('INSERT INTO ride_match.current_requests VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET request_id=EXCLUDED.request_id', [actor, id]);
        await store.client.query('INSERT INTO ride_match.match_sets VALUES ($1,$2,1)', [id, createHash('sha256').update('[]').digest('hex')]);
        await store.intent('ride.changed', id, 1, now);
        await store.intent('nearby.upserted.ride', id, 1, now);
        return { result: await store.ownRide((await store.ride(id))!) };
      } }));
  }
  async cancel(actor: string, id: string, input: CancelRideRequestInput) {
    return this.domain.run((store, now) => mutation({ store, now, actor, operationId: input.operationId,
      operation: 'rides.cancel', target: id, input, secret: this.config.API_AUTH_SECRET, schema: OwnRideRequestSchema,
      perform: async () => {
        const row = await this.owned(store, id, actor);
        if (row.status === 'grouped') throw domainError('USE_LEAVE_GROUP', 409, 'Leave the group to cancel this request.');
        if (row.status === 'expired') throw domainError('RIDE_EXPIRED', 410, 'Ride request expired.');
        if (row.status !== 'active') throw domainError('INVALID_TRANSITION', 422, 'Request cannot be cancelled.');
        if (row.version !== input.expectedVersion) throw domainError('VERSION_CONFLICT', 409, 'Request changed.');
        const updated = (await store.client.query<RideRow>("UPDATE ride_match.ride_requests SET status='cancelled',version=version+1 WHERE id=$1 RETURNING *", [id])).rows[0]!;
        await store.intent('ride.changed', id, updated.version, now);
        await store.intent('nearby.removed.ride', id, updated.version, now);
        return { result: await store.ownRide(updated) };
      } }));
  }
  /** Match-set version is persisted independently and changes only when the ordered snapshot changes. */
  async matches(actor: string, id: string) {
    return this.domain.run(async (store, now) => {
      const own = await this.owned(store, id, actor);
      return refreshMatches(store, own, now);
    });
  }
  private async owned(store: RideStore, id: string, actor: string): Promise<RideRow> {
    const row = await store.ride(id);
    if (!row || row.user_id !== actor) throw domainError('FORBIDDEN', 403, 'Request ownership required.');
    return row;
  }
}
