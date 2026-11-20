import type pg from 'pg';

/**
 * Runs one operation on one connection, committing its result or rolling back
 * a rejection. Always releases the client, discarding it after a rollback error.
 * Domain outcomes that must preserve attempt/revocation writes are returned,
 * then raised by the auth service after commit.
 */
export async function transaction<T>(pool: pg.Pool, operation: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) {
      broken = true;
      throw new AggregateError([error, rollbackError], 'Transaction rollback failed');
    }
    throw error;
  } finally { client.release(broken); }
}
