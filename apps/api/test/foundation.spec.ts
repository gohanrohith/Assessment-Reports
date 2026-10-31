import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app';
import { configure } from '../src/bootstrap';
import { Database } from '../src/database';
import { IdentityService } from '../src/identity';
import { config } from '../src/config';
config();
const owner = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL! }),
});
const password = 'Synthetic-test-password-2026';
const schoolA = randomUUID(),
  schoolB = randomUUID(),
  schoolC = randomUUID();
const suffix = randomUUID();
const schoolData = {
  legalName: 'Synthetic School',
  displayName: 'Synthetic School',
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
  academicYear: '2026-2027',
  board: 'Configurable',
  country: 'IN',
  state: 'Telangana',
  address: 'Synthetic',
  contactEmail: 'office@example.test',
  campuses: [],
};
let app: INestApplication,
  db: Database,
  identity: IdentityService,
  teacherId: string,
  adminId: string,
  operatorId: string;
let teacherToken: string, adminToken: string, operatorToken: string;
async function user(email: string, role: Role, schools: string[], platformAdmin = false) {
  const u = await owner.user.create({
    data: {
      email: (email + suffix + '@example.test').toLowerCase(),
      passwordHash: await hash(password, 12),
      platformAdmin,
    },
  });
  for (const tenantId of schools)
    await owner.membership.create({ data: { userId: u.id, tenantId, role } });
  return u.id;
}
async function clearLimits() {
  await owner.rateBucket.deleteMany();
}
async function login(name: string, code?: string) {
  return request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({
      email: name + suffix + '@example.test',
      password,
      ...(name === 'operator' ? {} : { schoolId: schoolA }),
      ...(code ? { code } : {}),
    });
}
async function enableMfa(id: string) {
  const secret = 'JBSWY3DPEHPK3PXP';
  await owner.user.update({
    where: { id },
    data: { mfaSecret: identity.encrypt(secret), mfaEnabled: true, lastTotpStep: -1 },
  });
  return identity.totp(secret).generate();
}
beforeAll(async () => {
  if (!['localhost', '127.0.0.1'].includes(new URL(process.env.MIGRATION_DATABASE_URL!).hostname))
    throw new Error('Tests require a local database');
  for (const id of [schoolA, schoolB, schoolC])
    await owner.school.create({ data: { ...schoolData, id } });
  teacherId = await user('teacher', 'SUBJECT_TEACHER', [schoolA, schoolB]);
  adminId = await user('admin', 'SCHOOL_ADMIN', [schoolA, schoolB]);
  operatorId = await user('operator', 'PLATFORM_ADMIN', [], true);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  configure(app);
  await app.init();
  db = app.get(Database);
  identity = app.get(IdentityService);
  await clearLimits();
  teacherToken = (await login('teacher')).body.accessToken;
  adminToken = (await login('admin', await enableMfa(adminId))).body.accessToken;
  operatorToken = (await login('operator', await enableMfa(operatorId))).body.accessToken;
  expect(teacherToken).toBeTruthy();
  expect(adminToken).toBeTruthy();
  expect(operatorToken).toBeTruthy();
});
afterAll(async () => {
  await app?.close();
  await owner.$disconnect();
});
beforeEach(clearLimits);
test('health verifies database and security headers', async () => {
  const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
  expect(res.body.status).toBe('ok');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['x-correlation-id']).toBeTruthy();
});
test('database application role cannot bypass RLS or own tables', async () => {
  const [role] = await db.$queryRaw<
    { rolsuper: boolean; rolbypassrls: boolean }[]
  >`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  expect(await db.school.findMany()).toEqual([]);
  const rows = await db.scoped(schoolA, teacherId, (tx) => tx.school.findMany());
  expect(rows.map((s) => s.id)).toEqual([schoolA]);
  expect(await db.school.findMany()).toEqual([]);
});
test('RLS denies cross-tenant writes and clears context on rollback', async () => {
  await expect(
    db.scoped(schoolA, teacherId, (tx) =>
      tx.school.create({ data: { ...schoolData, id: randomUUID() } }),
    ),
  ).rejects.toThrow();
  expect(await db.school.findMany()).toEqual([]);
});
test('concurrent pooled transactions remain isolated', async () => {
  await Promise.all(
    Array.from({ length: 24 }, async (_, i) => {
      const tenant = i % 2 ? schoolA : schoolB;
      const schools = await db.scoped(tenant, teacherId, (tx) => tx.school.findMany());
      expect(schools.map((s) => s.id)).toEqual([tenant]);
    }),
  );
});
test('rejects anonymous, forged, wrong-purpose and expired access', async () => {
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .expect(401);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth('forged', { type: 'bearer' })
    .expect(401);
  const jwt = app.get(IdentityService);
  expect(jwt).toBeDefined();
  const { JwtService } = await import('@nestjs/jwt');
  const signer = app.get(JwtService);
  const claims = {
    sub: teacherId,
    sid: randomUUID(),
    version: 0,
    active_school_id: schoolA,
    purpose: 'access',
  };
  for (const token of [
    await signer.signAsync(claims, { expiresIn: -1 }),
    await signer.signAsync({ ...claims, purpose: 'mfa-enroll' }),
  ])
    await request(app.getHttpServer())
      .get('/v1/schools/' + schoolA)
      .auth(token, { type: 'bearer' })
      .expect(401);
});
test('tenant ID fuzzing cannot read other schools or mutate profile', async () => {
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(teacherToken, { type: 'bearer' })
    .expect(200);
  for (const id of [schoolB, schoolC, ...Array.from({ length: 8 }, () => randomUUID())])
    await request(app.getHttpServer())
      .get('/v1/schools/' + id)
      .auth(teacherToken, { type: 'bearer' })
      .expect(404);
  await request(app.getHttpServer())
    .patch('/v1/schools/' + schoolA)
    .auth(teacherToken, { type: 'bearer' })
    .send(schoolData)
    .expect(403);
  await request(app.getHttpServer())
    .post('/v1/schools')
    .auth(adminToken, { type: 'bearer' })
    .send(schoolData)
    .expect(403);
});
test('administrator updates branding, locale, year and campuses only in active school', async () => {
  await request(app.getHttpServer())
    .patch('/v1/schools/' + schoolA)
    .auth(adminToken, { type: 'bearer' })
    .send({
      ...schoolData,
      locale: 'te-IN',
      academicYear: '2027-2028',
      displayName: 'Changed',
      campuses: ['Main'],
      logoUrl: 'https://example.test/logo.svg',
    })
    .expect(200);
  await request(app.getHttpServer())
    .patch('/v1/schools/' + schoolB)
    .auth(adminToken, { type: 'bearer' })
    .send(schoolData)
    .expect(404);
  expect((await owner.school.findUniqueOrThrow({ where: { id: schoolB } })).displayName).toBe(
    'Synthetic School',
  );
});
test('platform provisions and suspends schools without profile read privilege', async () => {
  const created = await request(app.getHttpServer())
    .post('/v1/schools')
    .auth(operatorToken, { type: 'bearer' })
    .send(schoolData)
    .expect(201);
  await request(app.getHttpServer())
    .get('/v1/schools/' + created.body.id)
    .auth(operatorToken, { type: 'bearer' })
    .expect(403);
  await request(app.getHttpServer())
    .patch('/v1/schools/' + created.body.id + '/status')
    .auth(operatorToken, { type: 'bearer' })
    .send({ status: 'SUSPENDED' })
    .expect(200);
});
test('suspended school membership is rejected on every request', async () => {
  await owner.school.update({ where: { id: schoolA }, data: { status: 'SUSPENDED' } });
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(teacherToken, { type: 'bearer' })
    .expect(401);
  await owner.school.update({ where: { id: schoolA }, data: { status: 'ACTIVE' } });
});
test('context switching invalidates old JWT and rejects unassigned schools', async () => {
  const current = (await login('teacher')).body.accessToken;
  const schools = await request(app.getHttpServer())
    .get('/v1/auth/schools')
    .auth(current, { type: 'bearer' })
    .expect(200);
  expect(schools.body).toHaveLength(2);
  await request(app.getHttpServer())
    .post('/v1/auth/context-switch')
    .auth(current, { type: 'bearer' })
    .send({ schoolId: schoolC })
    .expect(401);
  const switched = await request(app.getHttpServer())
    .post('/v1/auth/context-switch')
    .auth(current, { type: 'bearer' })
    .send({ schoolId: schoolB })
    .expect(201);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(current, { type: 'bearer' })
    .expect(401);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolB)
    .auth(switched.body.accessToken, { type: 'bearer' })
    .expect(200);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(switched.body.accessToken, { type: 'bearer' })
    .expect(404);
});
test('refresh is httpOnly, rotates, detects replay and revokes its session', async () => {
  const logged = await login('teacher');
  const cookie = logged.headers['set-cookie'][0].split(';')[0];
  expect(logged.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(logged.headers['set-cookie'][0]).toContain('SameSite=Strict');
  const refreshed = await request(app.getHttpServer())
    .post('/v1/auth/refresh')
    .set('Cookie', cookie)
    .expect(201);
  expect(refreshed.headers['set-cookie'][0]).not.toBe(logged.headers['set-cookie'][0]);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(logged.body.accessToken, { type: 'bearer' })
    .expect(401);
  await request(app.getHttpServer()).post('/v1/auth/refresh').set('Cookie', cookie).expect(401);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(refreshed.body.accessToken, { type: 'bearer' })
    .expect(401);
});
test('expired refresh and logout invalidate sessions', async () => {
  const logged = await login('teacher');
  await request(app.getHttpServer())
    .post('/v1/auth/logout')
    .auth(logged.body.accessToken, { type: 'bearer' })
    .expect(201);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(logged.body.accessToken, { type: 'bearer' })
    .expect(401);
  const next = await login('teacher');
  await owner.session.updateMany({
    where: { userId: teacherId, revoked: false },
    data: { expiresAt: new Date(0) },
  });
  await request(app.getHttpServer())
    .post('/v1/auth/refresh')
    .set('Cookie', next.headers['set-cookie'][0].split(';')[0])
    .expect(401);
});
test('privileged MFA enrollment, confirmation, replay protection and login enforcement', async () => {
  const id = await user('principal', 'PRINCIPAL', [schoolA]);
  await login('principal').then((res) => expect(res.status).toBe(401));
  const enrolled = await request(app.getHttpServer())
    .post('/v1/auth/mfa/enroll')
    .send({ email: 'principal' + suffix + '@example.test', password })
    .expect(201);
  const { TOTP, Secret } = await import('otpauth');
  const totp = new TOTP({
    secret: Secret.fromBase32(new URL(enrolled.body.otpauthUrl).searchParams.get('secret')!),
  });
  await request(app.getHttpServer())
    .post('/v1/auth/mfa/confirm')
    .send({ enrollmentToken: enrolled.body.enrollmentToken, code: totp.generate() })
    .expect(201);
  expect((await owner.user.findUniqueOrThrow({ where: { id } })).mfaEnabled).toBe(true);
  expect((await login('principal', totp.generate())).status).toBe(401);
  await owner.user.update({ where: { id }, data: { lastTotpStep: -1 } });
  expect((await login('principal', totp.generate())).status).toBe(201);
  expect((await login('principal', '000000')).status).toBe(401);
  const stored = (await owner.user.findUniqueOrThrow({ where: { id } })).mfaSecret!;
  expect(stored).not.toContain(totp.secret.base32);
});
test('append-only audit with actor, correlation and tenant; secrets absent', async () => {
  const events = await owner.auditEvent.findMany({ where: { actorId: adminId } });
  expect(
    events.some((e) => e.action === 'school.update' && e.tenantId === schoolA && e.correlationId),
  ).toBe(true);
  expect(JSON.stringify(events)).not.toContain(password);
  expect(JSON.stringify(events)).not.toContain(adminToken);
  await expect(
    owner.auditEvent.update({ where: { id: events[0].id }, data: { action: 'tamper' } }),
  ).rejects.toThrow();
  await expect(db.auditEvent.deleteMany()).rejects.toThrow();
});
test('rejects extra fields, malformed UUIDs, invalid timezone and foreign origins', async () => {
  await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: 'teacher' + suffix + '@example.test', password, role: 'PLATFORM_ADMIN' })
    .expect(400);
  await request(app.getHttpServer())
    .get('/v1/schools/not-a-uuid')
    .auth(adminToken, { type: 'bearer' })
    .expect(400);
  await request(app.getHttpServer())
    .patch('/v1/schools/' + schoolA)
    .auth(adminToken, { type: 'bearer' })
    .send({ ...schoolData, timezone: 'Imaginary/Zone' })
    .expect(400);
  await request(app.getHttpServer())
    .post('/v1/auth/refresh')
    .set('Origin', 'https://evil.example')
    .expect(403);
});
test('shared auth throttling fails closed after 60 requests', async () => {
  for (let i = 0; i < 60; i++)
    await request(app.getHttpServer()).post('/v1/auth/login').send({}).expect(400);
  await request(app.getHttpServer()).post('/v1/auth/login').send({}).expect(429);
});

test('all school roles have explicit profile permissions with privileged MFA', async () => {
  for (const role of [
    'CLASS_TEACHER',
    'SUBJECT_TEACHER',
    'STUDENT',
    'GUARDIAN',
    'PRINCIPAL',
    'REVIEWER',
  ] as const) {
    const name = 'matrix' + role;
    const id = await user(name, role, [schoolA]);
    let code: string | undefined;
    if (['PRINCIPAL', 'REVIEWER'].includes(role)) {
      expect((await login(name)).status).toBe(401);
      code = await enableMfa(id);
    }
    const logged = await login(name, code);
    expect(logged.status).toBe(201);
    await request(app.getHttpServer())
      .get('/v1/schools/' + schoolA)
      .auth(logged.body.accessToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/v1/schools/' + schoolA)
      .auth(logged.body.accessToken, { type: 'bearer' })
      .send(schoolData)
      .expect(403);
  }
});
test('a later privileged role grant cannot elevate a password-only session', async () => {
  const logged = await login('teacher');
  await owner.membership.updateMany({
    where: { userId: teacherId, tenantId: schoolA },
    data: { role: 'SCHOOL_ADMIN' },
  });
  await request(app.getHttpServer())
    .patch('/v1/schools/' + schoolA)
    .auth(logged.body.accessToken, { type: 'bearer' })
    .send(schoolData)
    .expect(401);
  await owner.membership.updateMany({
    where: { userId: teacherId, tenantId: schoolA },
    data: { role: 'SUBJECT_TEACHER' },
  });
});
test('membership revocation takes effect before access-token expiry', async () => {
  const logged = await login('teacher');
  await owner.membership.updateMany({
    where: { userId: teacherId, tenantId: schoolA },
    data: { active: false },
  });
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(logged.body.accessToken, { type: 'bearer' })
    .expect(401);
  await owner.membership.updateMany({
    where: { userId: teacherId, tenantId: schoolA },
    data: { active: true },
  });
});
test('concurrent refresh reuse revokes the session without issuing two usable secrets', async () => {
  const logged = await login('teacher');
  const cookie = logged.headers['set-cookie'][0].split(';')[0];
  const results = await Promise.all(
    [0, 1].map(() => request(app.getHttpServer()).post('/v1/auth/refresh').set('Cookie', cookie)),
  );
  expect(results.map((r) => r.status).sort()).toEqual([201, 401]);
  const issued = results.find((r) => r.status === 201)!;
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(issued.body.accessToken, { type: 'bearer' })
    .expect(401);
});
test('bcrypt byte-length guard prevents silent UTF-8 password truncation', async () => {
  await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: 'teacher' + suffix + '@example.test', password: '🔒'.repeat(30) })
    .expect(400);
});

test('password change verifies old credentials, revokes all sessions and audits without secrets', async () => {
  const name = 'passwordchange';
  const id = await user(name, 'SUBJECT_TEACHER', [schoolA]);
  const first = await login(name),
    second = await login(name);
  const endpoint = () =>
    request(app.getHttpServer())
      .post('/v1/auth/password')
      .auth(first.body.accessToken, { type: 'bearer' });
  const replacement = 'Replacement-Password-2026';
  await endpoint()
    .send({ currentPassword: 'Incorrect-password-2026', newPassword: replacement })
    .expect(401);
  await endpoint().send({ currentPassword: password, newPassword: password }).expect(400);
  await endpoint().send({ currentPassword: password, newPassword: replacement }).expect(201);
  for (const session of [first, second]) {
    await request(app.getHttpServer())
      .get('/v1/schools/' + schoolA)
      .auth(session.body.accessToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .set('Cookie', session.headers['set-cookie'][0].split(';')[0])
      .expect(401);
  }
  expect((await login(name)).status).toBe(401);
  await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: name + suffix + '@example.test', password: replacement, schoolId: schoolA })
    .expect(201);
  const events = await owner.auditEvent.findMany({
    where: { actorId: id, action: 'auth.password.change' },
  });
  expect(events).toHaveLength(1);
  expect(JSON.stringify(events)).not.toContain(replacement);
});
test('password change requires a fresh MFA code when MFA is enabled', async () => {
  const name = 'passwordmfa';
  const id = await user(name, 'PRINCIPAL', [schoolA]);
  const code = await enableMfa(id),
    logged = await login(name, code);
  const endpoint = () =>
    request(app.getHttpServer())
      .post('/v1/auth/password')
      .auth(logged.body.accessToken, { type: 'bearer' });
  const body = { currentPassword: password, newPassword: 'New-Privileged-Password-2026' };
  await endpoint().send(body).expect(401);
  await endpoint()
    .send({ ...body, code })
    .expect(401);
  const fresh = identity.totp('JBSWY3DPEHPK3PXP').generate({ timestamp: Date.now() + 30000 });
  await endpoint()
    .send({ ...body, code: fresh })
    .expect(201);
  expect((await owner.user.findUniqueOrThrow({ where: { id } })).mfaEnabled).toBe(true);
});
test('MFA setup rejects obsolete enrollment tokens and invalidates old password-only sessions', async () => {
  const name = 'mfarenew';
  await user(name, 'SUBJECT_TEACHER', [schoolA]);
  const logged = await login(name);
  const setup = () =>
    request(app.getHttpServer())
      .post('/v1/auth/mfa/enroll')
      .send({ email: name + suffix + '@example.test', password });
  const first = await setup().expect(201),
    second = await setup().expect(201);
  const { TOTP, Secret } = await import('otpauth');
  const code = (uri: string) =>
    new TOTP({ secret: Secret.fromBase32(new URL(uri).searchParams.get('secret')!) }).generate();
  await request(app.getHttpServer())
    .post('/v1/auth/mfa/confirm')
    .send({ enrollmentToken: first.body.enrollmentToken, code: code(first.body.otpauthUrl) })
    .expect(401);
  const results = await Promise.all(
    [0, 1].map(() =>
      request(app.getHttpServer())
        .post('/v1/auth/mfa/confirm')
        .send({ enrollmentToken: second.body.enrollmentToken, code: code(second.body.otpauthUrl) }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([201, 401]);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(logged.body.accessToken, { type: 'bearer' })
    .expect(401);
  await setup().expect(400);
});
test('an enrollment started before MFA confirmation cannot replace the confirmed secret', async () => {
  const name = 'mfarace';
  const id = await user(name, 'SUBJECT_TEACHER', [schoolA]);
  const setup = await request(app.getHttpServer())
    .post('/v1/auth/mfa/enroll')
    .send({ email: name + suffix + '@example.test', password })
    .expect(201);
  let ready!: () => void, release!: () => void;
  const paused = new Promise<void>((r) => {
      ready = r;
    }),
    resume = new Promise<void>((r) => {
      release = r;
    });
  const original = identity.credentials.bind(identity);
  const spy = jest.spyOn(identity, 'credentials').mockImplementationOnce(async (dto) => {
    const value = await original(dto);
    ready();
    await resume;
    return value;
  });
  try {
    const pending = request(app.getHttpServer())
      .post('/v1/auth/mfa/enroll')
      .send({ email: name + suffix + '@example.test', password })
      .then((r) => r);
    await paused;
    const { TOTP, Secret } = await import('otpauth');
    const totp = new TOTP({
      secret: Secret.fromBase32(new URL(setup.body.otpauthUrl).searchParams.get('secret')!),
    });
    await request(app.getHttpServer())
      .post('/v1/auth/mfa/confirm')
      .send({ enrollmentToken: setup.body.enrollmentToken, code: totp.generate() })
      .expect(201);
    const encrypted = (await owner.user.findUniqueOrThrow({ where: { id } })).mfaSecret;
    release();
    expect((await pending).status).toBe(400);
    expect((await owner.user.findUniqueOrThrow({ where: { id } })).mfaSecret).toBe(encrypted);
  } finally {
    release();
    spy.mockRestore();
  }
});
test('a password change prevents an in-flight old-password login from creating a session', async () => {
  const name = 'passwordrace';
  await user(name, 'SUBJECT_TEACHER', [schoolA]);
  const logged = await login(name);
  let ready!: () => void, release!: () => void;
  const paused = new Promise<void>((r) => {
      ready = r;
    }),
    resume = new Promise<void>((r) => {
      release = r;
    });
  const original = identity.credentials.bind(identity);
  const spy = jest.spyOn(identity, 'credentials').mockImplementationOnce(async (dto) => {
    const value = await original(dto);
    ready();
    await resume;
    return value;
  });
  try {
    const pending = login(name).then((r) => r);
    await paused;
    await request(app.getHttpServer())
      .post('/v1/auth/password')
      .auth(logged.body.accessToken, { type: 'bearer' })
      .send({ currentPassword: password, newPassword: 'New-Race-Password-2026' })
      .expect(201);
    release();
    expect((await pending).status).toBe(401);
  } finally {
    release();
    spy.mockRestore();
  }
});
test('a password-only session cannot switch into a newly granted privileged school context', async () => {
  const name = 'switchmfa';
  const id = await user(name, 'SUBJECT_TEACHER', [schoolA, schoolB]);
  const logged = await login(name);
  await owner.membership.updateMany({
    where: { tenantId: schoolB, userId: id },
    data: { role: 'PRINCIPAL' },
  });
  await request(app.getHttpServer())
    .post('/v1/auth/context-switch')
    .auth(logged.body.accessToken, { type: 'bearer' })
    .send({ schoolId: schoolB })
    .expect(401);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(logged.body.accessToken, { type: 'bearer' })
    .expect(200);
});

test('staff access lists only the active school and excludes authentication secrets', async () => {
  const rows = await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA + '/staff-access')
    .auth(adminToken, { type: 'bearer' })
    .expect(200);
  expect(
    rows.body.some(
      (row: { userId: string; isSelf: boolean }) => row.userId === adminId && row.isSelf,
    ),
  ).toBe(true);
  expect(JSON.stringify(rows.body)).not.toContain('passwordHash');
  expect(JSON.stringify(rows.body)).not.toContain('mfaSecret');
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolB + '/staff-access')
    .auth(adminToken, { type: 'bearer' })
    .expect(404);
  await user('staffviewer', 'SUBJECT_TEACHER', [schoolA]);
  const viewer = (await login('staffviewer')).body.accessToken;
  for (const token of [viewer, operatorToken])
    await request(app.getHttpServer())
      .get('/v1/schools/' + schoolA + '/staff-access')
      .auth(token, { type: 'bearer' })
      .expect(403);
});
test('staff access changes invalidate only affected-school sessions and include before/after audit', async () => {
  const name = 'stafftarget';
  const id = await user(name, 'CLASS_TEACHER', [schoolA, schoolB]);
  const first = await login(name),
    second = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: name + suffix + '@example.test', password, schoolId: schoolB })
      .expect(201);
  const membership = await owner.membership.findUniqueOrThrow({
    where: { tenantId_userId: { tenantId: schoolA, userId: id } },
  });
  const endpoint = '/v1/schools/' + schoolA + '/staff-access/' + membership.id;
  await request(app.getHttpServer())
    .patch(endpoint)
    .auth(adminToken, { type: 'bearer' })
    .send({
      role: 'SUBJECT_TEACHER',
      active: false,
      expectedRole: 'CLASS_TEACHER',
      expectedActive: true,
    })
    .expect(200);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolA)
    .auth(first.body.accessToken, { type: 'bearer' })
    .expect(401);
  await request(app.getHttpServer())
    .get('/v1/schools/' + schoolB)
    .auth(second.body.accessToken, { type: 'bearer' })
    .expect(200);
  const untouched = await owner.membership.findUniqueOrThrow({
    where: { tenantId_userId: { tenantId: schoolB, userId: id } },
  });
  expect(untouched.role).toBe('CLASS_TEACHER');
  expect(untouched.active).toBe(true);
  const events = await owner.auditEvent.findMany({
    where: { tenantId: schoolA, targetId: membership.id, action: 'staff.access.update' },
  });
  expect(events).toHaveLength(1);
  expect(events[0].details).toEqual({
    before: { role: 'CLASS_TEACHER', active: true },
    after: { role: 'SUBJECT_TEACHER', active: false },
  });
  await request(app.getHttpServer())
    .patch(endpoint)
    .auth(adminToken, { type: 'bearer' })
    .send({
      role: 'SUBJECT_TEACHER',
      active: true,
      expectedRole: 'SUBJECT_TEACHER',
      expectedActive: false,
    })
    .expect(200);
  expect((await login(name)).status).toBe(201);
});
test('staff access denies cross-tenant object IDs, role escalation and self-lockout', async () => {
  const id = await user('staffforeign', 'CLASS_TEACHER', [schoolB]);
  const foreign = await owner.membership.findUniqueOrThrow({
    where: { tenantId_userId: { tenantId: schoolB, userId: id } },
  });
  const self = await owner.membership.findUniqueOrThrow({
    where: { tenantId_userId: { tenantId: schoolA, userId: adminId } },
  });
  const body = {
    role: 'SUBJECT_TEACHER',
    active: false,
    expectedRole: 'CLASS_TEACHER',
    expectedActive: true,
  };
  for (const membershipId of [foreign.id, ...Array.from({ length: 5 }, () => randomUUID())])
    await request(app.getHttpServer())
      .patch('/v1/schools/' + schoolA + '/staff-access/' + membershipId)
      .auth(adminToken, { type: 'bearer' })
      .send(body)
      .expect(404);
  await request(app.getHttpServer())
    .patch('/v1/schools/' + schoolA + '/staff-access/' + self.id)
    .auth(adminToken, { type: 'bearer' })
    .send({ ...body, expectedRole: 'SCHOOL_ADMIN' })
    .expect(409);
  await request(app.getHttpServer())
    .patch('/v1/schools/' + schoolA + '/staff-access/' + self.id)
    .auth(adminToken, { type: 'bearer' })
    .send({ ...body, role: 'PLATFORM_ADMIN' })
    .expect(400);
});
test('concurrent staff changes reject stale edits instead of silently overwriting', async () => {
  const id = await user('staffconflict', 'CLASS_TEACHER', [schoolA]);
  const membership = await owner.membership.findUniqueOrThrow({
    where: { tenantId_userId: { tenantId: schoolA, userId: id } },
  });
  const results = await Promise.all(
    ['SUBJECT_TEACHER', 'PRINCIPAL'].map((role) =>
      request(app.getHttpServer())
        .patch('/v1/schools/' + schoolA + '/staff-access/' + membership.id)
        .auth(adminToken, { type: 'bearer' })
        .send({ role, active: true, expectedRole: 'CLASS_TEACHER', expectedActive: true }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const events = await owner.auditEvent.count({
    where: { tenantId: schoolA, targetId: membership.id, action: 'staff.access.update' },
  });
  expect(events).toBe(1);
});
