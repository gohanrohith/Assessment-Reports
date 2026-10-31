import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
export class MigrationAdapter extends PrismaPg {
  constructor(private readonly migrationPool: Pool) {
    super(migrationPool);
  }
  async connect() {
    const adapter = await super.connect();
    const query = adapter.queryRaw.bind(adapter);
    // Prisma 6 WASM metadata queries return PostgreSQL `name` (OID 19),
    // which adapter-pg 6 does not decode. Cast only these catalog projections.
    adapter.queryRaw = (q) =>
      query({
        ...q,
        sql: q.sql
          .replaceAll('tbl.relname AS table_name', 'tbl.relname::text AS table_name')
          .replaceAll(
            'namespace.nspname AS table_namespace',
            'namespace.nspname::text AS table_namespace',
          ),
      });
    // adapter-pg 6 splits scripts at every semicolon, including PL/pgSQL bodies.
    // Submit the complete script via pg in one atomic transaction instead.
    adapter.executeScript = async (script) => {
      const client = await this.migrationPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(script);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
    return adapter;
  }
}
