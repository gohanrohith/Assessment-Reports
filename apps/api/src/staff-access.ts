import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  ParseUUIDPipe,
  Req,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Database } from './database';
import { Audit } from './audit';
import { AuthRequest, Permission } from './security';
import { StaffAccessDto } from './dto';
const staffRoles: Role[] = ['SCHOOL_ADMIN', 'PRINCIPAL', 'CLASS_TEACHER', 'SUBJECT_TEACHER'];
@ApiTags('Staff access')
@ApiBearerAuth()
@Controller('schools/:schoolId/staff-access')
export class StaffAccessController {
  constructor(
    private readonly db: Database,
    private readonly audit: Audit,
  ) {}
  @Permission('staff:manage') @Get() list(
    @Param('schoolId', ParseUUIDPipe) tenantId: string,
    @Req() req: AuthRequest,
  ) {
    if (req.identity.active_school_id !== tenantId) throw new NotFoundException();
    return this.db.scoped(tenantId, req.identity.sub, async (tx) => {
      const rows = await tx.membership.findMany({
        where: { tenantId, role: { in: staffRoles } },
        select: {
          id: true,
          userId: true,
          role: true,
          active: true,
          user: { select: { email: true } },
        },
        orderBy: { id: 'asc' },
      });
      await this.audit.write(
        'staff.access.read',
        req.identity.sub,
        tenantId,
        req.correlationId,
        tenantId,
        {},
        tx,
      );
      return rows.map(({ user, ...row }) => ({
        ...row,
        email: user.email,
        isSelf: row.userId === req.identity.sub,
      }));
    });
  }
  @Permission('staff:manage') @Patch(':membershipId') update(
    @Param('schoolId', ParseUUIDPipe) tenantId: string,
    @Param('membershipId', ParseUUIDPipe) id: string,
    @Body() dto: StaffAccessDto,
    @Req() req: AuthRequest,
  ) {
    if (req.identity.active_school_id !== tenantId) throw new NotFoundException();
    return this.db.scoped(tenantId, req.identity.sub, async (tx) => {
      // Serialize access changes for the school, including the last-admin invariant.
      await tx.$queryRaw`SELECT tenant_id FROM "School" WHERE tenant_id=${tenantId}::uuid FOR UPDATE`;
      const actor = await tx.membership.findFirst({
        where: { tenantId, userId: req.identity.sub, active: true, role: 'SCHOOL_ADMIN' },
      });
      if (!actor) throw new ForbiddenException();
      const before = await tx.membership.findFirst({
        where: { id, tenantId, role: { in: staffRoles } },
      });
      if (!before) throw new NotFoundException();
      if (before.userId === req.identity.sub)
        throw new ConflictException('Ask another administrator to change your access');
      if (before.role !== dto.expectedRole || before.active !== dto.expectedActive)
        throw new ConflictException('Access changed. Reload staff access before saving');
      if (
        before.active &&
        before.role === 'SCHOOL_ADMIN' &&
        (!dto.active || dto.role !== 'SCHOOL_ADMIN')
      ) {
        const others = await tx.membership.count({
          where: { tenantId, role: 'SCHOOL_ADMIN', active: true, id: { not: id } },
        });
        if (!others) throw new ConflictException('A school must retain an active administrator');
      }
      const result = await tx.membership.update({
        where: { id, tenantId },
        data: { role: dto.role, active: dto.active },
        select: { id: true, userId: true, role: true, active: true },
      });
      await tx.session.updateMany({
        where: { userId: before.userId, activeSchoolId: tenantId, revoked: false },
        data: { revoked: true },
      });
      await this.audit.write(
        'staff.access.update',
        req.identity.sub,
        id,
        req.correlationId,
        tenantId,
        {
          before: { role: before.role, active: before.active },
          after: { role: result.role, active: result.active },
        },
        tx,
      );
      return result;
    });
  }
}
