import { readEnvironment } from '../config/environment.js';
import { createPool } from './pool.js';
import { runMigrations } from './migrations.js';

try {
  const config = readEnvironment(process.env);
  const pool = createPool(config.DATABASE_URL, 'migration');
  try {
    const count = await runMigrations(pool);
    console.info(`Migrations applied: ${count}`);
  } finally {
    await pool.end();
  }
} catch {
  // Driver/config errors may contain credentials or SQL. Never print them raw.
  console.error('Migration failed: check API configuration, DB availability and migration history.');
  process.exitCode = 1;
}
