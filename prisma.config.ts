import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { Pool } from 'pg';
import { MigrationAdapter } from './scripts/migration-adapter';
export default defineConfig({
  experimental: { adapter: true },
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  engine: 'js',
  adapter: async () =>
    new MigrationAdapter(new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL! })),
});
