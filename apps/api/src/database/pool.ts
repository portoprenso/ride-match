import { Logger } from '@nestjs/common';
import pg from 'pg';

/**
 * Creates a bounded, lazy pool shared by HTTP and the migration CLI.
 * Idle disconnects are handled to avoid uncaught EventEmitter errors. Diagnostics
 * deliberately omit driver messages, queries and connection strings.
 * Migration pools allow longer statements; HTTP probes remain bounded to 3 s.
 */
export function createPool(connectionString: string, purpose: 'http' | 'migration' = 'http'): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 1000,
    idleTimeoutMillis: 10000,
    statement_timeout: purpose === 'migration' ? 10000 : 2000,
    query_timeout: purpose === 'migration' ? 11000 : 3000,
    application_name: 'ride-match-api',
  });
  pool.on('error', () => new Logger('Database').error('database_idle_connection_failed'));
  return pool;
}
