import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Database } from './database';
export interface Identity {
  sub: string;
  sid: string;
  version: number;
  active_school_id: string | null;
  purpose: string;
}
export type AuthRequest = Request & { identity: Identity; correlationId: string };
export const Public = () => SetMetadata('public', true);
export const Permission = (permission: string) => SetMetadata('permission', permission);
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: Database,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new Error();
      const claims = await this.jwt.verifyAsync<Identity>(token, {
        algorithms: ['HS256'],
        issuer: 'assessment-api',
        audience: 'assessment-web',
      });
      if (claims.purpose !== 'access') throw new Error();
      const session = await this.db.session.findUnique({ where: { id: claims.sid } });
      if (
        !session ||
        session.revoked ||
        session.userId !== claims.sub ||
        session.expiresAt <= new Date() ||
        session.version !== claims.version ||
        session.activeSchoolId !== claims.active_school_id
      )
        throw new Error();
      if (claims.active_school_id) {
        const valid = await this.db.scoped(claims.active_school_id, claims.sub, async (tx) => {
          const member = await tx.membership.findFirst({
            where: { tenantId: claims.active_school_id!, userId: claims.sub, active: true },
          });
          const school = await tx.school.findFirst({
            where: { id: claims.active_school_id!, status: 'ACTIVE' },
          });
          if (
            member &&
            ['SCHOOL_ADMIN', 'PRINCIPAL', 'REVIEWER'].includes(member.role) &&
            !session.mfaVerified
          )
            return false;
          return member && school;
        });
        if (!valid) throw new Error();
      }
      req.identity = claims;
      return true;
    } catch {
      throw new UnauthorizedException('Session invalid or expired');
    }
  }
}
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: Database,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const permission = this.reflector.getAllAndOverride<string>('permission', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const { identity } = ctx.switchToHttp().getRequest<AuthRequest>();
    if (permission === 'self') return true;
    if (permission === 'provision') {
      const user = await this.db.user.findUnique({ where: { id: identity.sub } });
      if (user?.platformAdmin && !identity.active_school_id) {
        const session = await this.db.session.findUnique({ where: { id: identity.sid } });
        if (session?.mfaVerified && user.mfaEnabled) return true;
      }
    }
    if (identity.active_school_id && ['school:read', 'school:write'].includes(permission ?? '')) {
      const member = await this.db.scoped(identity.active_school_id, identity.sub, (tx) =>
        tx.membership.findFirst({
          where: { tenantId: identity.active_school_id!, userId: identity.sub, active: true },
        }),
      );
      if (member && (permission === 'school:read' || member.role === 'SCHOOL_ADMIN')) return true;
    }
    throw new ForbiddenException('Permission denied');
  }
}
