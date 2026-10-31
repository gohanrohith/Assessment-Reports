import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
// Out-of-band operator tool; never exposed as an HTTP self-registration endpoint.
const { NEW_USER_EMAIL, NEW_USER_PASSWORD, NEW_USER_ROLE, NEW_USER_SCHOOL_ID } = process.env;
if (
  !NEW_USER_EMAIL ||
  !NEW_USER_PASSWORD ||
  Buffer.byteLength(NEW_USER_PASSWORD) < 12 ||
  Buffer.byteLength(NEW_USER_PASSWORD) > 72 ||
  !Object.values(Role).includes(NEW_USER_ROLE as Role)
)
  throw new Error(
    'Set NEW_USER_EMAIL, NEW_USER_PASSWORD (12–72 UTF-8 bytes), NEW_USER_ROLE, and NEW_USER_SCHOOL_ID for school roles',
  );
if (
  !['PLATFORM_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'CLASS_TEACHER', 'SUBJECT_TEACHER'].includes(
    NEW_USER_ROLE!,
  )
)
  throw new Error(
    'Student, guardian and reviewer onboarding is deferred; no unverified identities',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL! }),
});
async function main() {
  const passwordHash = await hash(NEW_USER_PASSWORD!, 12);
  await db.$transaction(async (tx) => {
    if (
      NEW_USER_ROLE !== 'PLATFORM_ADMIN' &&
      (!NEW_USER_SCHOOL_ID || !(await tx.school.findUnique({ where: { id: NEW_USER_SCHOOL_ID } })))
    )
      throw new Error('Valid school required');
    const user = await tx.user.create({
      data: {
        email: NEW_USER_EMAIL!.toLowerCase(),
        passwordHash,
        platformAdmin: NEW_USER_ROLE === 'PLATFORM_ADMIN',
      },
    });
    if (NEW_USER_ROLE !== 'PLATFORM_ADMIN')
      await tx.membership.create({
        data: { userId: user.id, tenantId: NEW_USER_SCHOOL_ID!, role: NEW_USER_ROLE as Role },
      });
    await tx.auditEvent.create({
      data: {
        action: 'operator.user.provision',
        targetId: user.id,
        correlationId: randomUUID(),
        details: { role: NEW_USER_ROLE! },
      },
    });
  });
  console.log('Account created. Privileged accounts must enroll MFA before login.');
}
main().finally(() => db.$disconnect());
