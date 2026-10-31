import {
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { StaffAccessController } from './staff-access';
import { Database } from './database';
import { Audit } from './audit';
import { AuthRequest, Permission } from './security';
import { SchoolDto, StatusDto } from './dto';
@ApiTags('Schools')
@ApiBearerAuth()
@Controller('schools')
export class TenantController {
  constructor(
    private readonly db: Database,
    private readonly audit: Audit,
  ) {}
  validate(dto: SchoolDto) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: dto.timezone });
    } catch {
      throw new BadRequestException('Invalid timezone');
    }
  }
  @Permission('provision') @Post() async create(@Body() dto: SchoolDto, @Req() req: AuthRequest) {
    this.validate(dto);
    const id = randomUUID();
    return this.db.scoped(id, req.identity.sub, async (tx) => {
      const school = await tx.school.create({ data: { ...dto, id } });
      await this.audit.write(
        'school.provision',
        req.identity.sub,
        id,
        req.correlationId,
        id,
        {},
        tx,
      );
      return school;
    });
  }
  @Permission('provision') @Patch(':id/status') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.db.scoped(id, req.identity.sub, async (tx) => {
      if (!(await tx.school.findFirst({ where: { id } }))) throw new NotFoundException();
      const result = await tx.school.update({ where: { id }, data: dto });
      await this.audit.write(
        'school.status',
        req.identity.sub,
        id,
        req.correlationId,
        id,
        { status: dto.status },
        tx,
      );
      return { id: result.id, status: result.status };
    });
  }
  @Permission('school:read') @Get(':id') read(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    if (req.identity.active_school_id !== id) throw new NotFoundException();
    return this.db.scoped(id, req.identity.sub, async (tx) => {
      const school = await tx.school.findFirst({ where: { id } });
      if (!school) throw new NotFoundException();
      await this.audit.write('school.read', req.identity.sub, id, req.correlationId, id, {}, tx);
      return school;
    });
  }
  @Permission('school:write') @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SchoolDto,
    @Req() req: AuthRequest,
  ) {
    this.validate(dto);
    if (req.identity.active_school_id !== id) throw new NotFoundException();
    return this.db.scoped(id, req.identity.sub, async (tx) => {
      const result = await tx.school.update({ where: { id }, data: dto });
      await this.audit.write(
        'school.update',
        req.identity.sub,
        id,
        req.correlationId,
        id,
        { fields: Object.keys(dto) },
        tx,
      );
      return result;
    });
  }
}
@Module({ controllers: [TenantController, StaffAccessController] })
export class TenantsModule {}
