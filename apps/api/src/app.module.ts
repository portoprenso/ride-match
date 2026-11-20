import { ChatService } from './chat/chat.service.js';
import { ChatController } from './chat/chat.controller.js';
import { SafetyService } from './safety/safety.service.js';
import { BlocksController, ReportsController } from './safety/safety.controller.js';
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
import { RideDomain } from './rides/domain.js';
import { RideRequestsService } from './rides/requests.service.js';
import { RideGroupsService } from './rides/groups.service.js';
import { DiscoveryService } from './rides/discovery.service.js';
import { RidesController, OwnRideController, GroupsController } from './rides/controllers.js';
import { HealthController } from './health/health.controller.js';

/** Composition root: server configuration is validated before provider creation. */
@Module({})
export class AppModule {
  static register(config: ApiConfig, dependencies: BackendDependencies = {}): DynamicModule {
    return {
      module: AppModule,
      providers: [{ provide: API_CONFIG, useValue: config }, DatabaseService, AuthService, PlacesService, RequestRateGuard, RideDomain, RideRequestsService, RideGroupsService, DiscoveryService, ChatService, SafetyService,
        { provide: CLOCK, useValue: dependencies.clock ?? systemClock },
        { provide: OTP_PROVIDER, useValue: dependencies.otpProvider ?? createOtpProvider(config) }],
      controllers: [HealthController, AuthController, CurrentUserController, PlacesController, RidesController, OwnRideController, GroupsController, ChatController, BlocksController, ReportsController],
    };
  }
}
