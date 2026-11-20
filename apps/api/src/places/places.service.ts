import { Inject, Injectable } from '@nestjs/common';
import { PlaceSearchResultsSchema } from '@ride-match/contracts';
import type { PlaceSearchResultsDto, SearchPlacesInput } from '@ride-match/contracts';
import { DatabaseService } from '../database/database.service.js';
import { ApiException } from '../http/api-exception.js';

type PlaceRow = { id: string; label: string; detail: string | null; latitude: number; longitude: number };

/** Searches only server-owned public landmarks; distances are straight-line estimates, never routes. */
@Injectable()
export class PlacesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async search(input: SearchPlacesInput): Promise<PlaceSearchResultsDto> {
    const { latitude, longitude } = input.area.center;
    const coverage = await this.database.pool.query(`SELECT 1 FROM ride_match.place_coverage
      WHERE $1 BETWEEN south AND north AND $2 BETWEEN west AND east LIMIT 1`, [latitude, longitude]);
    if (!coverage.rowCount) throw new ApiException({ code: 'UNSUPPORTED_AREA', message: 'Search area is not supported.' }, 422);
    const rows = await this.database.pool.query<PlaceRow>('SELECT id,label,detail,latitude,longitude FROM ride_match.places');
    const query = input.query?.toLocaleLowerCase('en');
    const radians = (value: number) => value * Math.PI / 180;
    const distance = (place: PlaceRow) => {
      const a = Math.sin(radians(place.latitude - latitude) / 2) ** 2 +
        Math.cos(radians(latitude)) * Math.cos(radians(place.latitude)) * Math.sin(radians(place.longitude - longitude) / 2) ** 2;
      return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
    };
    const places = rows.rows.map((place) => ({ place, distance: distance(place) }))
      .filter(({ place, distance }) => distance <= input.area.radiusMeters &&
        (!query || `${place.label} ${place.detail ?? ''}`.toLocaleLowerCase('en').includes(query)))
      .sort((a, b) => {
        const rank = (place: PlaceRow) => query && place.label.toLocaleLowerCase('en').startsWith(query) ? 0 : 1;
        return rank(a.place) - rank(b.place) || a.distance - b.distance || a.place.id.localeCompare(b.place.id);
      })
      .slice(0, input.limit).map(({ place }) => ({
        id: place.id, label: place.label, detail: place.detail,
        coordinates: { latitude: place.latitude, longitude: place.longitude },
      }));
    return PlaceSearchResultsSchema.parse(places);
  }
}
