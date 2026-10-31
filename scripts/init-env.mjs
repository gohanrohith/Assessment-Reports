import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  const template = readFileSync('.env.example', 'utf8')
    .replace('JWT_SECRET=', 'JWT_SECRET=' + randomBytes(48).toString('hex'))
    .replace('MFA_ENCRYPTION_KEY=', 'MFA_ENCRYPTION_KEY=' + randomBytes(32).toString('hex'));
  writeFileSync('.env', template, { mode: 0o600 });
  console.log('Created local .env with generated secrets.');
} else console.log('Preserved existing .env.');
