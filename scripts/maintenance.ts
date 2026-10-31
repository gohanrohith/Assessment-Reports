import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
async function main() {
  await db.rateBucket.deleteMany({ where: { resetsAt: { lt: new Date() } } });
  await db.refreshUse.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
main().finally(() => db.$disconnect());
