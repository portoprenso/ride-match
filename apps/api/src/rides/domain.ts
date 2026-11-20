import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CLOCK } from '../auth/runtime.js';
import type { Clock } from '../auth/runtime.js';
import { DatabaseService } from '../database/database.service.js';
import { transaction } from '../database/transaction.js';
import { ApiException } from '../http/api-exception.js';
import { RideStore } from './store.js';
import { sweep } from './lifecycle.js';

/**
 * Local modular-monolith serialization boundary. Every rides/groups read, write
 * and expiry worker uses transaction advisory lock 724003. Database constraints
 * independently enforce one live request/group and capacity. The deliberately
 * coarse lock is a throughput limit, not a production scaling claim.
 * Expiry commits even when a requested action fails; action writes roll back to
 * a savepoint. Never call this boundary recursively from an active operation.
 */
@Injectable()
export class RideDomain implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(CLOCK) private readonly clock: Clock) {}

  async run<T>(work: (store: RideStore, now: Date) => Promise<T>): Promise<T> {
    const result = await transaction(this.database.pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(724003)');
      const store = new RideStore(client);
      const now = this.clock.now();
      await sweep(store, now);
      await client.query('SAVEPOINT domain_action');
      try { return await work(store, now); }
      catch (error) {
        if (!(error instanceof ApiException)) throw error;
        await client.query('ROLLBACK TO SAVEPOINT domain_action');
        return error;
      }
    });
    if (result instanceof ApiException) throw result;
    return result;
  }

  /** Lazy first tick preserves liveness when PostgreSQL is down at bootstrap. */
  onModuleInit(): void {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.run(() => Promise.resolve()).catch(() => {
        new Logger('RideLifecycle').error('ride_lifecycle_sweep_failed');
      }).finally(() => { this.running = undefined; });
    }, 30000);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> { clearInterval(this.timer); await this.running; }
}
