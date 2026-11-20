import { transaction } from '../dist/database/transaction.js';
/** Test-owned TRUNCATE follows the same lock order as the now-continuous lifecycle/outbox worker. */
export async function resetDomain(pool,sql){
  await transaction(pool,async(client)=>{await client.query('SELECT pg_advisory_xact_lock(724003)');await client.query(sql);});
}
