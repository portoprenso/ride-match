import process from 'node:process';
const { fetch } = globalThis;
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readdir, writeFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApplication } from '../dist/application.js';
import { readEnvironment } from '../dist/config/environment.js';
import { DatabaseService } from '../dist/database/database.service.js';
import { createPool } from '../dist/database/pool.js';
import { runMigrations } from '../dist/database/migrations.js';

// This suite owns a new randomly named database, never the configured database.
// Local Compose's role can CREATE DATABASE; no shared/external DB is accepted.
test('real PostgreSQL migration lifecycle and readiness', async () => {
  const config = readEnvironment(process.env);
  const url = new URL(config.DATABASE_URL);
  assert.ok(config.API_APP_ENV !== 'production');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  const admin = createPool(config.DATABASE_URL);
  const databaseName = `be001_${randomUUID().replaceAll('-', '')}`;
  const directory = await mkdtemp(join(tmpdir(), 'ride-match-be001-'));
  const migrationDirectory = pathToFileURL(`${directory}/`);
  let pool;
  let app;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${databaseName}`);
    created = true;
    url.pathname = `/${databaseName}`;
    pool = createPool(url.href, 'migration');
    const results = await Promise.all([runMigrations(pool), runMigrations(pool)]);
    assert.deepEqual(results.sort(), [0, 5], 'concurrent runners apply initial migration exactly once');
    assert.equal(await runMigrations(pool), 0);
    assert.equal((await pool.query('SELECT name FROM schema_migrations')).rows[0].name, '0001_backend_foundation.sql');
    assert.equal((await pool.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'ride_match'")).rowCount, 1);

    await pool.end();
    pool = createPool(url.href, 'migration');
    assert.equal(await runMigrations(pool), 0, 'journal survives reconnect/restart');
    for (const name of await readdir(new URL('../migrations/', import.meta.url))) await copyFile(new URL(`../migrations/${name}`, import.meta.url), join(directory, name));
    await writeFile(join(directory, '0006_probe.sql'), 'CREATE TABLE ride_match.rollback_probe (id integer); SELECT missing_column;');
    await assert.rejects(runMigrations(pool, migrationDirectory));
    assert.equal((await pool.query("SELECT to_regclass('ride_match.rollback_probe') AS name")).rows[0].name, null);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count, 5);
    await writeFile(join(directory, '0006_probe.sql'), 'CREATE TABLE ride_match.rollback_probe (id integer);');
    assert.equal(await runMigrations(pool, migrationDirectory), 1);
    await writeFile(join(directory, '0001_backend_foundation.sql'), '-- changed applied file');
    await assert.rejects(runMigrations(pool, migrationDirectory), /history differs/);
    await unlink(join(directory, '0001_backend_foundation.sql'));
    await assert.rejects(runMigrations(pool, migrationDirectory), /history differs/);

    app = await createApplication({ ...config, DATABASE_URL: url.href, API_LOG_LEVEL: 'error' });
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    // The injected extra migration cannot pass readiness for this packaged API manifest.
    assert.equal((await fetch(`${base}/v1/health/live`)).status, 200);
    assert.equal((await fetch(`${base}/v1/health/ready`)).status, 503);
    await pool.query("DELETE FROM schema_migrations WHERE name='0006_probe.sql'");
    await pool.query('DROP TABLE ride_match.rollback_probe');
    const journal = (await pool.query('SELECT * FROM schema_migrations ORDER BY name DESC LIMIT 1')).rows[0];
    await pool.query('UPDATE schema_migrations SET checksum=$2 WHERE name=$1',[journal.name,'synthetic-wrong-checksum']);
    assert.equal((await fetch(`${base}/v1/health/ready`)).status,503);
    await pool.query('UPDATE schema_migrations SET checksum=$2 WHERE name=$1',[journal.name,journal.checksum]);
    for (const path of ['live', 'ready']) {
      const response = await fetch(`${base}/v1/health/${path}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.status, 'ok');
    }
    const ownedPool = app.get(DatabaseService).pool;
    await app.close();
    app = undefined;
    assert.equal(ownedPool.ended, true, 'Nest close drains database connections');
  } finally {
    if (app) await app.close();
    if (pool && !pool.ended) await pool.end();
    try {
      if (created) await admin.query(`DROP DATABASE ${databaseName}`);
    } finally {
      await admin.end();
      await rm(directory, { recursive: true, force: true });
    }
  }
});
