import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';

/**
 * Applies ordered SQL files and their checksums in one locked transaction.
 * Concurrent runners serialize before creating/reading the journal. Any failure
 * rolls back the entire batch; edited/deleted applied migrations are rejected.
 * Files contain transactional SQL only (no BEGIN/COMMIT or concurrent indexes).
 * Callers own the pool and must close it, including after a failure.
 */
export async function runMigrations(
  pool: pg.Pool,
  directory = new URL('../../migrations/', import.meta.url),
): Promise<number> {
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  if (files.some((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name))) {
    throw new Error('Invalid migration filename');
  }
  const migrations = await Promise.all(files.map(async (name) => {
    const sql = await readFile(new URL(name, directory), 'utf8');
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query('SELECT pg_advisory_xact_lock(724001)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations ORDER BY name',
    );
    for (const [index, row] of applied.rows.entries()) {
      if (migrations[index]?.name !== row.name || migrations[index]?.checksum !== row.checksum) {
        throw new Error('Applied migration history differs from files');
      }
    }
    const pending = migrations.slice(applied.rows.length);
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [migration.name, migration.checksum]);
    }
    await client.query('COMMIT');
    return pending.length;
  } catch (error) {
    failed = true;
    // Preserve both failures without leaking their messages through the CLI.
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Migration and rollback failed');
    }
    throw error;
  } finally {
    client.release(failed);
  }
}
