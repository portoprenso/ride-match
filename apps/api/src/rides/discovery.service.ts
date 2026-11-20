import { Inject, Injectable } from '@nestjs/common';
import { NearbySnapshotSchema } from '@ride-match/contracts';
import type { NearbyQueryInput, MatchPreviewDto } from '@ride-match/contracts';
import { RideDomain } from './domain.js';
import { domainError } from './store.js';
import { publicCandidates } from './candidates.js';
import { compatible, distanceMeters } from './policy.js';

/** Coarse public discovery is authoritative but does not imply tracking, road overlap or seat reservation. */
@Injectable()
export class DiscoveryService {
  constructor(@Inject(RideDomain) private readonly domain: RideDomain) {}
  async nearby(actor: string | null, input: NearbyQueryInput) {
    return this.domain.run(async (store, now) => {
      const { southWest: sw, northEast: ne } = input.viewport;
      const coverage = await store.client.query(`SELECT 1 FROM ride_match.place_coverage
        WHERE north >= $1 AND south <= $2 AND east >= $3 AND west <= $4`, [sw.latitude, ne.latitude, sw.longitude, ne.longitude]);
      if (!coverage.rowCount) throw domainError('UNSUPPORTED_AREA', 422, 'Viewport is not supported.');
      if (input.destinationPlaceId && !(await store.client.query('SELECT 1 FROM ride_match.places WHERE id=$1', [input.destinationPlaceId])).rowCount) {
        throw domainError('VALIDATION_FAILED', 422, 'Destination is unavailable.');
      }
      const center = { latitude: (sw.latitude + ne.latitude) / 2, longitude: (sw.longitude + ne.longitude) / 2 };
      const candidates = (await publicCandidates(store, actor)).filter((item) => {
        const point = item.publicOrigin.center;
        return point.latitude >= sw.latitude && point.latitude <= ne.latitude && point.longitude >= sw.longitude && point.longitude <= ne.longitude;
      }).sort((a, b) => distanceMeters(center, a.publicOrigin.center) - distanceMeters(center, b.publicOrigin.center) || `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
      const items = candidates.slice(0, input.limit);
      const previews: MatchPreviewDto[] = [];
      if (input.destinationPlaceId) for (const item of items) {
        if (item.kind === 'group' && (item.status !== 'forming' || item.memberCount === 4)) continue;
        const level = compatible({ origin: center, destinationId: input.destinationPlaceId, departure: now.getTime() + (input.departureOffsetMinutes ?? 0) * 60000 },
          { origin: item.publicOrigin.center, destinationId: item.destination.id, departure: Date.parse(item.departureAt) });
        if (level) previews.push({ target: { kind: item.kind, id: item.id }, level, additionalMinutes: null });
      }
      return NearbySnapshotSchema.parse({ items, previews, truncated: candidates.length > items.length });
    });
  }
}
