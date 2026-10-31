import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { randomUUID, createCipheriv, randomBytes } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import 'dotenv/config';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL! }),
});
const password = 'Browser-Security-Password-2026';
async function fixture(privileged = false) {
  const tenantId = randomUUID(),
    email = `security-${randomUUID()}@example.test`;
  await db.school.create({
    data: {
      id: tenantId,
      legalName: 'Security fixture',
      displayName: 'Security fixture',
      academicYear: '2026-2027',
      board: 'Synthetic',
      state: 'Telangana',
      address: 'Synthetic',
      contactEmail: 'security@example.test',
    },
  });
  const secret = new Secret({ size: 20 }),
    iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.MFA_ENCRYPTION_KEY!, 'hex'), iv),
    encrypted = Buffer.concat([cipher.update(secret.base32), cipher.final()]);
  const user = await db.user.create({
    data: {
      email,
      passwordHash: await hash(password, 12),
      mfaEnabled: privileged,
      mfaSecret: privileged
        ? [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(
            '.',
          )
        : null,
    },
  });
  await db.membership.create({
    data: { tenantId, userId: user.id, role: privileged ? 'SCHOOL_ADMIN' : 'SUBJECT_TEACHER' },
  });
  return { email, id: user.id, tenantId, code: new TOTP({ secret }).generate() };
}
test.beforeEach(async () => {
  await db.rateBucket.deleteMany();
});
test.afterAll(async () => {
  await db.$disconnect();
});
test('stale access is renewed without losing edited school settings', async ({ page }) => {
  const account = await fixture(true);
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Authenticator code', { exact: true }).fill(account.code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'School profile' })).toBeVisible();
  await page.getByLabel('Display name', { exact: true }).fill('Preserved unsaved settings');
  // Invalidate only the access-token version; the refresh session is still eligible.
  await db.session.updateMany({
    where: { userId: account.id, revoked: false },
    data: { version: { increment: 1 } },
  });
  let renewals = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/v1/auth/refresh')) renewals++;
  });
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('School settings saved.');
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(
    'Preserved unsaved settings',
  );
  expect(renewals).toBe(1);
  expect((await db.school.findUniqueOrThrow({ where: { id: account.tenantId } })).displayName).toBe(
    'Preserved unsaved settings',
  );
});
test('password change signs out the browser and permits login only with the new password', async ({
  page,
}) => {
  const account = await fixture();
  const replacement = 'Updated-Browser-Password-2026';
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account security' })).toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill(replacement);
  await page.getByLabel('Confirm new password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('All sessions signed out');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid credentials' })).toContainText(
    'Invalid credentials',
  );
  await page.getByLabel('Password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'School profile' })).toBeVisible();
});

test('school administrator updates staff roles and sees the audited access result', async ({
  page,
}) => {
  const account = await fixture(true),
    email = `staff-${randomUUID()}@example.test`;
  const target = await db.user.create({ data: { email, passwordHash: await hash(password, 12) } });
  const member = await db.membership.create({
    data: { tenantId: account.tenantId, userId: target.id, role: 'CLASS_TEACHER' },
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Authenticator code', { exact: true }).fill(account.code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff access', exact: true })).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: account.email + ' role', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('combobox', { name: email + ' role', exact: true })
    .selectOption('SUBJECT_TEACHER');
  await page.getByRole('checkbox', { name: email + ' active', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save access for ' + email, exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Staff access saved. Affected sessions were signed out.',
  );
  const stored = await db.membership.findUniqueOrThrow({ where: { id: member.id } });
  expect(stored.role).toBe('SUBJECT_TEACHER');
  expect(stored.active).toBe(false);
  expect(
    await db.auditEvent.count({
      where: { targetId: member.id, tenantId: account.tenantId, action: 'staff.access.update' },
    }),
  ).toBe(1);
});

test('an expired refresh session returns to sign-in instead of trapping the user in the workspace', async ({
  page,
}) => {
  const account = await fixture();
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'School profile' })).toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await db.session.updateMany({ where: { userId: account.id }, data: { expiresAt: new Date(0) } });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Session expired' })).toContainText(
    'Sign in again',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'School profile' })).toBeVisible();
  await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('');
});
