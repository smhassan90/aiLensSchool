import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName, SchoolStatus } from '@prisma/client';
import { SchoolsService } from './schools.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';

class SchoolQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SchoolStatus)
  status?: SchoolStatus;
}

@ApiTags('Schools')
@ApiBearerAuth()
@Controller({ path: 'schools', version: '1' })
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Roles(RoleName.SUPER_ADMIN)
  @Get('dashboard/stats')
  dashboard() {
    return this.schoolsService.dashboardStats();
  }

  @Roles(RoleName.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateSchoolDto, @CurrentUser() user: AuthUser) {
    return this.schoolsService.createSchoolWithAdmin(dto, user);
  }

  @Roles(RoleName.SUPER_ADMIN, RoleName.SCHOOL_ADMIN)
  @Get()
  findAll(@Query() query: SchoolQueryDto, @CurrentUser() user: AuthUser) {
    if (user.roles.includes(RoleName.SCHOOL_ADMIN) && user.schoolId) {
      return this.schoolsService.findOne(user.schoolId, user).then((school) => ({
        items: [school],
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
      }));
    }
    return this.schoolsService.findAll(query);
  }

  @Roles(RoleName.SUPER_ADMIN, RoleName.SCHOOL_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.schoolsService.findOne(id, user);
  }

  @Roles(RoleName.SUPER_ADMIN, RoleName.SCHOOL_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSchoolDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.roles.includes(RoleName.SCHOOL_ADMIN) && !user.roles.includes(RoleName.SUPER_ADMIN)) {
      if (user.schoolId !== id) {
        throw new ForbiddenException({
          code: 'SCHOOL_ACCESS_DENIED',
          message: 'You can only update your own school',
        });
      }
      const { status: _status, ...safe } = dto;
      return this.schoolsService.update(id, safe, user);
    }
    return this.schoolsService.update(id, dto, user);
  }

  @Roles(RoleName.SUPER_ADMIN)
  @Post(':id/activate')
  activate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.schoolsService.setStatus(id, SchoolStatus.ACTIVE, user);
  }

  @Roles(RoleName.SUPER_ADMIN)
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.schoolsService.setStatus(id, SchoolStatus.INACTIVE, user);
  }

  @Roles(RoleName.SUPER_ADMIN)
  @Post(':id/suspend')
  suspend(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.schoolsService.setStatus(id, SchoolStatus.SUSPENDED, user);
  }
}
