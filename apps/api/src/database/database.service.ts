import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { API_CONFIG } from '../config/environment.js';
import type { ApiConfig } from '../config/environment.js';
import { createPool } from './pool.js';

/**
 * Owns the process pool. Startup does not require a reachable DB so liveness
 * remains useful during an outage; readiness performs a fresh bounded query.
 * Nest shutdown hooks drain the pool on SIGINT/SIGTERM and explicit app.close().
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly pool;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.pool = createPool(config.DATABASE_URL);
  }

  /** Executes a real round trip; rejects on connection or statement timeout. */
  async checkConnection(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
