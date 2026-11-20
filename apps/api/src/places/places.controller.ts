import { Controller, Get, Headers, Inject, Query, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { RequestRateGuard } from '../auth/request-rate.guard.js';
import { parsePlaceQuery } from './search-query.js';
import { PlacesService } from './places.service.js';

/** Anonymous search remains available; supplied credentials must be valid. */
@Controller('places')
@UseGuards(RequestRateGuard)
export class PlacesController {
  constructor(@Inject(PlacesService) private readonly places: PlacesService, @Inject(AuthService) private readonly auth: AuthService) {}
  @Get('search')
  async search(@Query() query: Record<string, unknown>, @Headers('authorization') authorization: string | undefined) {
    const input = parsePlaceQuery(query);
    await this.auth.authenticate(authorization, true);
    return this.places.search(input);
  }
}
