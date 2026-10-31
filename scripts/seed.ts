import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.MIGRATION_DATABASE_URL!;
if (
  process.env.NODE_ENV === 'production' ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
)
  throw new Error('Seed is restricted to local development');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
async function seed() {
  const schoolIds = [
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
  ];
  for (let i = 0; i < schoolIds.length; i++)
    await db.school.upsert({
      where: { id: schoolIds[i] },
      create: {
        id: schoolIds[i],
        legalName: `Example School ${i + 1}`,
        displayName: `Example School ${i + 1}`,
        academicYear: '2026-2027',
        board: 'Configurable',
        state: 'Telangana',
        address: 'Synthetic development school',
        contactEmail: `school${i + 1}@example.test`,
      },
      update: {},
    });
  const password = randomBytes(18).toString('base64url');
  const accounts = [
    ['operator@example.test', true, 'PLATFORM_ADMIN'],
    ['admin@example.test', false, 'SCHOOL_ADMIN'],
    ['teacher@example.test', false, 'SUBJECT_TEACHER'],
  ] as const;
  let created = 0;
  for (const [email, platformAdmin, role] of accounts) {
    if (await db.user.findUnique({ where: { email } })) continue;
    const user = await db.user.create({
      data: { email, platformAdmin, passwordHash: await hash(password, 12) },
    });
    created++;
    if (!platformAdmin)
      for (const tenantId of schoolIds)
        await db.membership.create({ data: { tenantId, userId: user.id, role } });
  }
  if (created) {
    mkdirSync('.local', { recursive: true, mode: 0o700 });
    writeFileSync(
      '.local/demo-credentials.txt',
      `Development accounts: operator@example.test, admin@example.test, teacher@example.test\nPassword for newly created accounts: ${password}\nAdmin/operator require authenticator setup before login.\n`,
      { mode: 0o600 },
    );
    console.log(
      'New synthetic accounts created; credentials saved privately in .local/demo-credentials.txt.',
    );
  } else console.log('Existing demo accounts preserved.');
}
seed().finally(() => db.$disconnect());
