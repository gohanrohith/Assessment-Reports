import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError, mergeMap } from 'rxjs';
import { Audit } from './audit';
import { AuthRequest } from './security';
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: Audit) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && !req.identity)
      return next.handle();
    const log = (outcome: string) =>
      this.audit.write(
        `request.${req.method}.${outcome}`,
        req.identity?.sub ?? null,
        null,
        req.correlationId,
        null,
        { route: req.route?.path ?? 'unknown' },
      );
    return next.handle().pipe(
      mergeMap(async (value) => {
        await log('succeeded');
        return value;
      }),
      catchError(async (error) => {
        await log('failed');
        throw error;
      }),
    );
  }
}
