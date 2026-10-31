import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { compare, hash } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import { Database } from './database';
import { Audit } from './audit';
import { config } from './config';
import { LoginDto, MfaConfirmDto, SwitchDto, PasswordChangeDto } from './dto';
import { AuthRequest, Permission, Public } from './security';
const privileged = ['SCHOOL_ADMIN', 'PRINCIPAL', 'REVIEWER'];
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
@Injectable()
export class IdentityService {
  constructor(
    private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly audit: Audit,
  ) {}
  encrypt(value: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', Buffer.from(config().key, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      encrypted.toString('hex'),
    ].join('.');
  }
  decrypt(value: string) {
    const [iv, tag, data] = value.split('.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(config().key, 'hex'),
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString(
      'utf8',
    );
  }
  totp(secret: string) {
    return new TOTP({
      issuer: 'Academic Passport',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
  }
  async lockUser(tx: Prisma.TransactionClient, userId: string) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
  }
  async verifyMfa(
    userId: string,
    encrypted: string,
    code: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const delta = this.totp(this.decrypt(encrypted)).validate({ token: code, window: 1 });
    if (delta === null) throw new UnauthorizedException('Invalid credentials or MFA code');
    const step = BigInt(Math.floor(Date.now() / 30000) + delta);
    const changed = await tx.user.updateMany({
      where: { id: userId, mfaSecret: encrypted, lastTotpStep: { lt: step } },
      data: { lastTotpStep: step },
    });
    if (changed.count !== 1) throw new UnauthorizedException('MFA code already used');
  }
  async credentials(dto: LoginDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // A valid constant bcrypt hash keeps unknown-user password verification expensive.
    const valid = await compare(
      dto.password,
      user?.passwordHash ?? '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW',
    );
    if (!user || !valid) throw new UnauthorizedException('Invalid credentials or MFA code');
    return user;
  }
  async login(dto: LoginDto, cid: string) {
    let user;
    try {
      user = await this.credentials(dto);
    } catch (e) {
      await this.audit.write('auth.login.denied', null, null, cid);
      throw e;
    }
    const memberships = await this.db.memberships(user.id);
    const needsMfa = user.platformAdmin || memberships.some((m) => privileged.includes(m.role));
    if (needsMfa && !user.mfaEnabled) throw new UnauthorizedException('MFA enrollment required');
    if (user.mfaEnabled) {
      if (!dto.code || !user.mfaSecret)
        throw new UnauthorizedException('Invalid credentials or MFA code');
    }
    const schoolId = dto.schoolId ?? (user.platformAdmin ? null : memberships[0]?.tenantId);
    if (!schoolId && !user.platformAdmin)
      throw new UnauthorizedException('No active school membership');
    if (schoolId) await this.checkSchool(user.id, schoolId);
    const refresh = randomBytes(48).toString('base64url');
    const session = await this.db.$transaction(async (tx) => {
      // Serialize credential changes, MFA setup and session creation for this identity.
      await this.lockUser(tx, user.id);
      const live = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (
        live.passwordHash !== user.passwordHash ||
        live.mfaEnabled !== user.mfaEnabled ||
        live.mfaSecret !== user.mfaSecret ||
        live.platformAdmin !== user.platformAdmin
      )
        throw new UnauthorizedException('Credentials changed; sign in again');
      if (live.mfaEnabled) {
        await this.verifyMfa(live.id, live.mfaSecret!, dto.code!, tx);
        await this.audit.write('auth.mfa.verify', live.id, live.id, cid, null, {}, tx);
      }
      const session = await tx.session.create({
        data: {
          userId: user.id,
          mfaVerified: user.mfaEnabled,
          activeSchoolId: schoolId,
          refreshHash: digest(refresh),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      await this.audit.write('auth.login', user.id, session.id, cid, null, {}, tx);
      return session;
    });
    return this.tokens(session, refresh);
  }
  async checkSchool(userId: string, schoolId: string) {
    const allowed = await this.db.scoped(schoolId, userId, async (tx) => {
      const membership = await tx.membership.findFirst({
        where: { tenantId: schoolId, userId, active: true },
      });
      const school = await tx.school.findFirst({ where: { id: schoolId, status: 'ACTIVE' } });
      return membership && school;
    });
    if (!allowed) throw new UnauthorizedException('School unavailable');
  }
  async tokens(
    session: { id: string; userId: string; version: number; activeSchoolId: string | null },
    refresh: string,
  ) {
    return {
      accessToken: await this.jwt.signAsync(
        {
          sub: session.userId,
          sid: session.id,
          version: session.version,
          active_school_id: session.activeSchoolId,
          purpose: 'access',
        },
        { expiresIn: '15m' },
      ),
      expiresIn: 900 as const,
      active_school_id: session.activeSchoolId,
      refresh,
    };
  }
  async refresh(token: string | undefined, cid: string) {
    if (!token || token.length > 256) throw new UnauthorizedException();
    const hash = digest(token),
      replacement = randomBytes(48).toString('base64url');
    const result = await this.db.$transaction(async (tx) => {
      const session = await tx.session.findUnique({ where: { refreshHash: hash } });
      if (!session) {
        const used = await tx.refreshUse.findUnique({ where: { hash } });
        if (used) {
          await tx.session.updateMany({ where: { id: used.sessionId }, data: { revoked: true } });
          await this.audit.write('auth.refresh.replay', null, used.sessionId, cid, null, {}, tx);
        }
        return null;
      }
      if (session.revoked || session.expiresAt <= new Date()) return null;
      const updated = await tx.session.updateMany({
        where: { id: session.id, refreshHash: hash, revoked: false },
        data: { refreshHash: digest(replacement), version: { increment: 1 } },
      });
      if (!updated.count) {
        await tx.session.updateMany({ where: { id: session.id }, data: { revoked: true } });
        return null;
      }
      await tx.refreshUse.create({
        data: { hash, sessionId: session.id, expiresAt: session.expiresAt },
      });
      await this.audit.write('auth.refresh', session.userId, session.id, cid, null, {}, tx);
      return { ...session, version: session.version + 1 };
    });
    if (!result) throw new UnauthorizedException('Refresh invalid or reused');
    if (result.activeSchoolId) await this.checkSchool(result.userId, result.activeSchoolId);
    return this.tokens(result, replacement);
  }
  async enroll(dto: LoginDto, cid: string) {
    const user = await this.credentials(dto);
    if (user.mfaEnabled) throw new BadRequestException('MFA already enabled');
    const secret = new Secret({ size: 20 }).base32;
    const encrypted = this.encrypt(secret);
    await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, user.id);
      const changed = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash, mfaEnabled: false },
        data: { mfaSecret: encrypted },
      });
      if (changed.count !== 1)
        throw new BadRequestException('MFA already enabled or credentials changed');
      await this.audit.write('auth.mfa.enroll', user.id, user.id, cid, null, {}, tx);
    });
    return {
      otpauthUrl: this.totp(secret).toString(),
      enrollmentToken: await this.jwt.signAsync(
        { sub: user.id, purpose: 'mfa-enroll', binding: digest(encrypted) },
        { expiresIn: '5m' },
      ),
    };
  }
  async confirm(dto: MfaConfirmDto, cid: string) {
    let claim: { sub: string; purpose: string; binding: string };
    try {
      claim = await this.jwt.verifyAsync(dto.enrollmentToken, {
        algorithms: ['HS256'],
        issuer: 'assessment-api',
        audience: 'assessment-web',
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (claim.purpose !== 'mfa-enroll') throw new UnauthorizedException();
    await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, claim.sub);
      const user = await tx.user.findUnique({ where: { id: claim.sub } });
      if (!user?.mfaSecret || user.mfaEnabled || digest(user.mfaSecret) !== claim.binding)
        throw new UnauthorizedException();
      await this.verifyMfa(user.id, user.mfaSecret, dto.code, tx);
      await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
      await tx.session.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true },
      });
      await this.audit.write('auth.mfa.confirm', user.id, user.id, cid, null, {}, tx);
    });
    return { enabled: true };
  }
  async contexts(userId: string) {
    const memberships = await this.db.memberships(userId);
    const schools = await Promise.all(
      memberships.map((m) =>
        this.db.scoped(m.tenantId, userId, async (tx) => {
          const s = await tx.school.findFirst({ where: { id: m.tenantId, status: 'ACTIVE' } });
          return s ? { id: s.id, displayName: s.displayName, role: m.role } : null;
        }),
      ),
    );
    return schools.filter((s) => s !== null);
  }
  async changePassword(req: AuthRequest, dto: PasswordChangeDto) {
    const user = await this.db.user.findUnique({ where: { id: req.identity.sub } });
    if (!user || !(await compare(dto.currentPassword, user.passwordHash)))
      throw new UnauthorizedException('Current password or MFA code invalid');
    if (await compare(dto.newPassword, user.passwordHash))
      throw new BadRequestException('Choose a different password');
    const passwordHash = await hash(dto.newPassword, 12);
    await this.db.$transaction(async (tx) => {
      await this.lockUser(tx, user.id);
      const live = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const session = await tx.session.findFirst({
        where: {
          id: req.identity.sid,
          userId: user.id,
          version: req.identity.version,
          revoked: false,
          expiresAt: { gt: new Date() },
        },
      });
      if (!session || live.passwordHash !== user.passwordHash)
        throw new UnauthorizedException('Credentials changed; sign in again');
      if (live.mfaEnabled) {
        if (!live.mfaSecret || !dto.code)
          throw new UnauthorizedException('Current password or MFA code invalid');
        await this.verifyMfa(live.id, live.mfaSecret, dto.code, tx);
      }
      await tx.user.update({ where: { id: live.id }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: live.id, revoked: false },
        data: { revoked: true },
      });
      await this.audit.write(
        'auth.password.change',
        live.id,
        live.id,
        req.correlationId,
        null,
        { sessionsRevoked: true },
        tx,
      );
    });
    return { loggedOut: true };
  }
  async switchSchool(req: AuthRequest, schoolId: string) {
    await this.checkSchool(req.identity.sub, schoolId);
    const session = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${schoolId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${req.identity.sub}, true)`;
      const target = await tx.membership.findFirst({
        where: { tenantId: schoolId, userId: req.identity.sub, active: true },
      });
      const existing = await tx.session.findUnique({ where: { id: req.identity.sid } });
      if (!target || !existing || (privileged.includes(target.role) && !existing.mfaVerified))
        throw new UnauthorizedException('Sign in with MFA before switching to this school');
      const changed = await tx.session.updateMany({
        where: { id: req.identity.sid, version: req.identity.version, revoked: false },
        data: { activeSchoolId: schoolId, version: { increment: 1 } },
      });
      if (!changed.count) throw new UnauthorizedException();
      await this.audit.write(
        'auth.context-switch',
        req.identity.sub,
        schoolId,
        req.correlationId,
        null,
        {},
        tx,
      );
      return tx.session.findUniqueOrThrow({ where: { id: req.identity.sid } });
    });
    const tokens = await this.tokens(session, '');
    const { refresh: _refresh, ...body } = tokens;
    return body;
  }
}
@ApiTags('Identity')
@Controller('auth')
export class IdentityController {
  constructor(
    private readonly service: IdentityService,
    private readonly db: Database,
    private readonly audit: Audit,
  ) {}
  cookie(res: Response, refresh: string) {
    res.cookie('refresh', refresh, {
      httpOnly: true,
      secure: config().production,
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 86400000,
    });
  }
  send(res: Response, result: Awaited<ReturnType<IdentityService['login']>>) {
    const { refresh, ...body } = result;
    this.cookie(res, refresh);
    return body;
  }
  @Public() @Post('login') async login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.send(res, await this.service.login(dto, req.correlationId));
  }
  @Public() @Post('refresh') async refresh(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.send(res, await this.service.refresh(req.cookies?.refresh, req.correlationId));
  }
  @Public() @Post('mfa/enroll') enroll(@Body() dto: LoginDto, @Req() req: AuthRequest) {
    return this.service.enroll(dto, req.correlationId);
  }
  @Public() @Post('mfa/confirm') confirm(@Body() dto: MfaConfirmDto, @Req() req: AuthRequest) {
    return this.service.confirm(dto, req.correlationId);
  }
  @ApiBearerAuth() @Permission('self') @Get('schools') contexts(@Req() req: AuthRequest) {
    return this.service.contexts(req.identity.sub);
  }
  @ApiBearerAuth() @Permission('self') @Post('context-switch') switchSchool(
    @Body() dto: SwitchDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.switchSchool(req, dto.schoolId);
  }
  @ApiBearerAuth() @Permission('self') @Post('password') async changePassword(
    @Body() dto: PasswordChangeDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.changePassword(req, dto);
    res.clearCookie('refresh', {
      path: '/v1/auth',
      httpOnly: true,
      secure: config().production,
      sameSite: 'strict',
    });
    return result;
  }
  @ApiBearerAuth() @Permission('self') @Post('logout') async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.session.update({ where: { id: req.identity.sid }, data: { revoked: true } });
      await this.audit.write(
        'auth.logout',
        req.identity.sub,
        req.identity.sid,
        req.correlationId,
        null,
        {},
        tx,
      );
    });
    res.clearCookie('refresh', {
      path: '/v1/auth',
      httpOnly: true,
      secure: config().production,
      sameSite: 'strict',
    });
    return { loggedOut: true };
  }
}
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: config().secret,
        signOptions: { algorithm: 'HS256', issuer: 'assessment-api', audience: 'assessment-web' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [IdentityService],
  controllers: [IdentityController],
  exports: [JwtModule, IdentityService],
})
export class IdentityModule {}
