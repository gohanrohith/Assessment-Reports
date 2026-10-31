import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { MigrationAdapter } from './migration-adapter';
async function main() {
  const url = process.env.MIGRATION_DATABASE_URL!;
  if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Prisma validation requires a local disposable database');
  const schema = 'foundation_probe_' + randomUUID().replaceAll('-', '');
  assert(/^[a-z_0-9]+$/.test(schema));
  const folder = resolve('.local/prisma-validation', schema);
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    folder + '/schema.prisma',
    readFileSync('tests/prisma-validation/schema.prisma.template', 'utf8').replaceAll(
      'SCHEMA_NAME',
      schema,
    ),
  );
  writeFileSync(
    folder + '/assertions.ts',
    readFileSync('tests/prisma-validation/assertions.ts.template', 'utf8'),
  );
  const env = { ...process.env, PROBE_CLIENT_OUTPUT: folder + '/client' };
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'generate', '--schema', folder + '/schema.prisma'],
    { env, stdio: 'inherit' },
  );
  execFileSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--esModuleInterop',
      '--module',
      'commonjs',
      '--target',
      'ES2022',
      folder + '/assertions.ts',
    ],
    { env, stdio: 'inherit' },
  );
  const pool = new Pool({ connectionString: url });
  let created = false;
  const adapter = await new MigrationAdapter(pool).connect();
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await adapter.executeScript(`CREATE TABLE "${schema}"."ProbeResult" (
   id uuid PRIMARY KEY,tenant_id uuid NOT NULL,"studentKey" text NOT NULL,"componentKey" text NOT NULL,
   marks numeric(12,4),maximum numeric(12,4) NOT NULL CHECK(maximum>0),weight numeric(12,4) NOT NULL CHECK(weight>=0),status text NOT NULL CHECK(status IN ('COMPLETE','ABSENT','EXEMPT','INCOMPLETE')),
   contribution numeric(20,8) GENERATED ALWAYS AS (CASE WHEN status='COMPLETE' THEN marks/maximum*weight WHEN status='ABSENT' THEN 0 ELSE NULL END) STORED,
   "eligibleWeight" numeric(12,4) GENERATED ALWAYS AS (CASE WHEN status='EXEMPT' THEN 0 ELSE weight END) STORED,
   CHECK(marks IS NULL OR (marks>=0 AND marks<=maximum))
  );
  CREATE INDEX ON "${schema}"."ProbeResult"(tenant_id);
  ALTER TABLE "${schema}"."ProbeResult" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "${schema}"."ProbeResult" FORCE ROW LEVEL SECURITY;
  CREATE POLICY scope ON "${schema}"."ProbeResult" USING(tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid);
  GRANT USAGE ON SCHEMA "${schema}" TO assessment_app;
  GRANT SELECT,INSERT,UPDATE ON "${schema}"."ProbeResult" TO assessment_app;`);
    execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', folder + '/assertions.ts'], {
      env,
      stdio: 'inherit',
    });
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT count(*) FROM "${schema}"."ProbeResult"`);
      await assert.rejects(
        adapter.executeScript(
          `SET LOCAL lock_timeout='200ms'; ALTER TABLE "${schema}"."ProbeResult" ADD COLUMN "lockProbe" text;`,
        ),
      );
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
    const columns = await pool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3',
      [schema, 'ProbeResult', 'lockProbe'],
    );
    assert.equal(columns.rowCount, 0);
    const before = await pool.query(
      `SELECT pg_relation_filenode('"${schema}"."ProbeResult"') AS node`,
    );
    const started = performance.now();
    await adapter.executeScript(
      `SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='2s'; ALTER TABLE "${schema}"."ProbeResult" ADD COLUMN "lockProbe" text;`,
    );
    const elapsed = Math.round(performance.now() - started);
    assert(elapsed < 2000);
    const after = await pool.query(
      `SELECT pg_relation_filenode('"${schema}"."ProbeResult"') AS node`,
    );
    assert.equal(before.rows[0].node, after.rows[0].node);
    console.log(
      `Migration contention fails within lock timeout and rolls back; nullable-column migration completed in ${elapsed}ms without rewriting the table.`,
    );
  } finally {
    if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adapter.dispose();
    await pool.end();
    rmSync(folder, { recursive: true, force: true });
  }
}
void main();
