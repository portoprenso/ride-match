import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { systemClock } from './auth/runtime.js';
import type { Clock } from './auth/runtime.js';
import type { BackendDependencies } from './auth/runtime.js';
import { AppModule } from './app.module.js';
import { nestLogLevels } from './config/environment.js';
import type { ApiConfig } from './config/environment.js';
import { ApiExceptionFilter } from './http/api-exception.filter.js';
import { SuccessEnvelopeInterceptor } from './http/success-envelope.interceptor.js';
import { requestIdMiddleware } from './http/request-id.js';

/**
 * Configures HTTP before initialization, so parser errors also get request IDs.
 * Simple query parsing preserves duplicate values for later whitelisted DTO
 * decoding; no generic nested-object parser or global coercion is installed.
 */
export function configureHttp(app: NestExpressApplication, config: ApiConfig, clock: Clock = systemClock): void {
  app.disable('x-powered-by');
  // Auth responses and private reads must not enter browser/proxy caches.
  app.use((_request: unknown, response: express.Response, next: express.NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.set('query parser', 'simple');
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: '16kb' }));
  app.enableCors({ origin: config.API_ALLOWED_ORIGINS, exposedHeaders: ['X-Request-Id'] });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new SuccessEnvelopeInterceptor(clock));
}

/** Creates an unbound server; caller listens and closes it or installs signal hooks. */
export async function createApplication(config: ApiConfig, dependencies: BackendDependencies = {}): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config, dependencies), {
    bodyParser: false,
    logger: nestLogLevels(config.API_LOG_LEVEL),
    abortOnError: false,
  });
  configureHttp(app, config, dependencies.clock ?? systemClock);
  return app;
}
