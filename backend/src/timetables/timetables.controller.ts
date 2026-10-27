import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RoleName, TimetableVersionStatus } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { TenantService } from '../common/services/tenant.service';
import { PrismaService } from '../database/prisma.service';
import { TimetableResolverService } from './timetable-resolver.service';
import { TimetableImportsService } from './timetable-imports.service';
import { TimetableVersionsService } from './timetable-versions.service';
import {
  CreateManualVersionDto,
  LegacyAdoptDto,
  PublishTimetableDto,
  UpdateTimetableVersionDto,
} from './dto/timetable.dto';

function timetableFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, accept: boolean) => void,
) {
  const mime = file.mimetype?.toLowerCase() ?? '';
  const name = file.originalname?.toLowerCase() ?? '';
  const ok =
    mime === 'text/csv' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'text/plain' ||
    mime === 'image/jpeg' ||
    mime === 'image/png' ||
    mime === 'image/webp' ||
    name.endsWith('.csv');
  cb(ok ? null : new Error('UNSUPPORTED_TIMETABLE_FORMAT'), ok);
}

@Controller({ path: 'timetables', version: '1' })
export class TimetablesController {
  constructor(
    private readonly resolver: TimetableResolverService,
    private readonly imports: TimetableImportsService,
    private readonly versions: TimetableVersionsService,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  @Post('imports')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_CLASSES')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: timetableFileFilter,
    }),
  )
  uploadImport(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('academicYearId') academicYearId?: string,
  ) {
    return this.imports.upload(user, file, academicYearId);
  }

  @Get('imports')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL, RoleName.TEACHER)
  listImports(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.imports.list(schoolId, page ? Number(page) : 1, limit ? Number(limit) : 20);
  }

  @Get('imports/:id')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL, RoleName.TEACHER)
  getImport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.imports.getImport(schoolId, id);
  }

  @Post('imports/:id/extract')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_CLASSES')
  reExtract(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.imports.reExtract(user, id);
  }

  @Post('imports/:id/discard')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_CLASSES')
  discard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.imports.discard(user, id);
  }

  @Get('versions')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL, RoleName.TEACHER)
  listVersions(
    @CurrentUser() user: AuthUser,
    @Query('sectionId') sectionId?: string,
    @Query('status') status?: TimetableVersionStatus,
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.versions.list(schoolId, sectionId, status);
  }

  @Post('versions')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_CLASSES')
  createVersion(@CurrentUser() user: AuthUser, @Body() dto: CreateManualVersionDto) {
    return this.versions.createManual(user, dto.sectionId, dto.academicYearId, dto.cloneFromVersionId);
  }

  @Get('versions/:id')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL, RoleName.TEACHER)
  getVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.versions.getVersion(schoolId, id);
  }

  @Put('versions/:id')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_CLASSES')
  updateVersion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTimetableVersionDto) {
    return this.versions.update(user, id, dto);
  }

  @Post('versions/:id/validate')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL, RoleName.TEACHER)
  validateVersion(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.versions.validateOnly(user, id);
  }

  @Post('publish')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_CLASSES')
  publish(@CurrentUser() user: AuthUser, @Body() dto: PublishTimetableDto) {
    return this.versions.publish(user, dto);
  }

  @Post('legacy/adopt')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.PRINCIPAL)
  @RequirePermission('MANAGE_CLASSES')
  adoptLegacy(@CurrentUser() user: AuthUser, @Body() dto: LegacyAdoptDto) {
    return this.versions.adoptLegacy(user, dto.sectionIds);
  }

  @Get('resolve')
  @Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PRINCIPAL)
  async resolve(
    @CurrentUser() user: AuthUser,
    @Query('sectionId') sectionId: string,
    @Query('date') date: string,
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });
    if (!year) {
      return { source: 'NONE', versionId: null, working: false, reason: 'No academic year', periods: [] };
    }
    const resolved = await this.resolver.periodsFor(schoolId, sectionId, year.id, date);
    return { ...resolved, working: resolved.periods.length > 0, reason: null };
  }
}
