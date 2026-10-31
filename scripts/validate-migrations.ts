import 'dotenv/config';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { MigrationAdapter } from './migration-adapter';
async function main() {
  const url = process.env.MIGRATION_DATABASE_URL!;
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Migration validation requires a local disposable database');
  const pool = new Pool({ connectionString: url });
  const adapter = await new MigrationAdapter(pool).connect();
  try {
    await assert.rejects(
      adapter.executeScript('CREATE TABLE "_migration_rollback_fixture" (id integer); SELECT 1/0;'),
    );
    const result = await pool.query(
      "SELECT to_regclass('public._migration_rollback_fixture')::text AS name",
    );
    assert.equal(result.rows[0].name, null, 'Failed migration must roll back all its DDL');
    console.log('Migration rollback check passed: failed DDL left no table behind.');
  } finally {
    await adapter.dispose();
    await pool.end();
  }
}
void main();
