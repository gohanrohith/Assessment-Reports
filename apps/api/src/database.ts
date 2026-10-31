import { PrismaPg } from '@prisma/adapter-pg';
import './config';
import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  async scoped<T>(
    tenantId: string,
    actorId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${actorId}, true)`;
      return work(tx);
    });
  }
  async memberships(userId: string) {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
      return tx.membership.findMany({
        where: { userId, active: true },
        orderBy: { tenantId: 'asc' },
      });
    });
  }
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
