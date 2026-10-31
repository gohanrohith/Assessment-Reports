import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Database } from './database';
@Injectable()
export class Audit {
  constructor(private readonly db: Database) {}
  write(
    action: string,
    actorId: string | null,
    targetId: string | null,
    correlationId: string,
    tenantId: string | null = null,
    details: Prisma.InputJsonValue = {},
    tx: Prisma.TransactionClient | PrismaClient = this.db,
  ) {
    return tx.$executeRaw`INSERT INTO "AuditEvent" (id, tenant_id, "actorId", action, "targetId", "correlationId", details, "createdAt") VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${actorId}::uuid, ${action}, ${targetId}, ${correlationId}, ${JSON.stringify(details)}::jsonb, now())`;
  }
}
@Global()
@Module({ providers: [Audit], exports: [Audit] })
export class AuditModule {}
