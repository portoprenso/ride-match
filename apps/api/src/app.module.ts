import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { API_CONFIG } from './config/environment.js';
import type { ApiConfig } from './config/environment.js';
import { DatabaseService } from './database/database.service.js';
import { HealthController } from './health/health.controller.js';

/** Composition root: server configuration is validated before provider creation. */
@Module({})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      providers: [{ provide: API_CONFIG, useValue: config }, DatabaseService],
      controllers: [HealthController],
    };
  }
}
