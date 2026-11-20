import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { API_CONFIG } from './config/environment.js';
import type { ApiConfig } from './config/environment.js';
import { DatabaseService } from './database/database.service.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController, CurrentUserController } from './auth/auth.controller.js';
import { RequestRateGuard } from './auth/request-rate.guard.js';
import { CLOCK, OTP_PROVIDER, systemClock, createOtpProvider } from './auth/runtime.js';
import type { BackendDependencies } from './auth/runtime.js';
import { PlacesController } from './places/places.controller.js';
import { PlacesService } from './places/places.service.js';
import { HealthController } from './health/health.controller.js';

/** Composition root: server configuration is validated before provider creation. */
@Module({})
export class AppModule {
  static register(config: ApiConfig, dependencies: BackendDependencies = {}): DynamicModule {
    return {
      module: AppModule,
      providers: [{ provide: API_CONFIG, useValue: config }, DatabaseService, AuthService, PlacesService, RequestRateGuard,
        { provide: CLOCK, useValue: dependencies.clock ?? systemClock },
        { provide: OTP_PROVIDER, useValue: dependencies.otpProvider ?? createOtpProvider(config) }],
      controllers: [HealthController, AuthController, CurrentUserController, PlacesController],
    };
  }
}
