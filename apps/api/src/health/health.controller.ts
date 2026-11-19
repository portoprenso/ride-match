import { Controller, Get, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ApiException } from '../http/api-exception.js';

/** Operational probes only; readiness checks PostgreSQL on every request. */
@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.database.checkConnection();
    } catch {
      throw new ApiException({ code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable.' }, 503);
    }
    return { status: 'ok' };
  }
}
