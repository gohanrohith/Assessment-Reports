import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({ path: resolve(__dirname, '../../../.env'), quiet: true });
export function config() {
  const secret = process.env.JWT_SECRET ?? '';
  const key = process.env.MFA_ENCRYPTION_KEY ?? '';
  if (secret.length < 48 || !/^[a-f0-9]{64}$/i.test(key))
    throw new Error('Set a strong JWT_SECRET and a 32-byte hex MFA_ENCRYPTION_KEY');
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://'))
    throw new Error('Production requires HTTPS');
  return { secret, key, origin, production: process.env.NODE_ENV === 'production' };
}
