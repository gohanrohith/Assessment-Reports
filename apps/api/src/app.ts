import 'reflect-metadata';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit-interceptor';
import { Database, DatabaseModule } from './database';
import { AuditModule } from './audit';
import { IdentityModule } from './identity';
import { TenantsModule } from './tenants';
import { AuthGuard, PermissionGuard, Public } from './security';
@Controller('health')
class HealthController {
  constructor(private readonly db: Database) {}
  @Public() @Get() async health() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
@Module({
  imports: [DatabaseModule, AuditModule, IdentityModule, TenantsModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
