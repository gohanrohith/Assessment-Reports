import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL! }),
});
let email: string, schoolA: string, schoolB: string, userId: string;
const password = 'Browser-synthetic-password';
test.beforeAll(async () => {
  [schoolA, schoolB] = [randomUUID(), randomUUID()].sort();
  email = `browser-${randomUUID()}@example.test`;
  for (const [i, id] of [schoolA, schoolB].entries())
    await db.school.create({
      data: {
        id,
        legalName: `Browser School ${i + 1}`,
        displayName: `Browser School ${i + 1}`,
        academicYear: '2026-2027',
        board: 'Synthetic',
        state: 'Telangana',
        address: 'Synthetic',
        contactEmail: 'office@example.test',
      },
    });
  const user = await db.user.create({ data: { email, passwordHash: await hash(password, 12) } });
  userId = user.id;
  for (const tenantId of [schoolA, schoolB])
    await db.membership.create({ data: { tenantId, userId, role: 'SUBJECT_TEACHER' } });
  await db.rateBucket.deleteMany();
});
test.afterAll(async () => db.$disconnect());
test('keyboard accessible login and visual baseline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('foundation-sign-in.png', { animations: 'disabled' });
  await page.getByLabel('Email', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
});
test('login, school switching, session restoration and logout', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'School profile' })).toBeVisible();
  const select = page.getByRole('combobox', { name: 'Active school' });
  await expect(select).toHaveValue(schoolA);
  await select.selectOption(schoolB);
  await expect(select).toHaveValue(schoolB);
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Browser School 2');
  await expect(page.getByLabel('Display name', { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Active school' })).toHaveValue(schoolB);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});
test('unsaved profile edits require confirmation before context switch', async ({ page }) => {
  // Granting a privileged role requires a fresh MFA-authenticated session.
  const { TOTP, Secret } = await import('otpauth');
  const secret = new Secret({ size: 20 });
  const { createCipheriv, randomBytes } = await import('node:crypto');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.MFA_ENCRYPTION_KEY!, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(secret.base32, 'utf8'), cipher.final()]);
  await db.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaSecret: [
        iv.toString('hex'),
        cipher.getAuthTag().toString('hex'),
        encrypted.toString('hex'),
      ].join('.'),
    },
  });
  await db.membership.updateMany({ where: { userId }, data: { role: 'SCHOOL_ADMIN' } });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Authenticator code').fill(new TOTP({ secret }).generate());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'School profile' })).toBeVisible();
  await page.getByLabel('Display name', { exact: true }).fill('Unsaved');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('combobox', { name: 'Active school' }).selectOption(schoolB);
  await expect(page.getByRole('combobox', { name: 'Active school' })).toHaveValue(schoolA);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('combobox', { name: 'Active school' }).selectOption(schoolB);
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Browser School 2');
});
