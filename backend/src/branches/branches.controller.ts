import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchStatus, RoleName } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class BranchQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsEnum(BranchStatus)
  status?: BranchStatus;
}

@ApiTags('Branches')
@ApiBearerAuth()
@Controller({ path: 'branches', version: '1' })
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Roles(RoleName.SUPER_ADMIN, RoleName.SCHOOL_ADMIN)
  @Post()
  create(@Body() dto: CreateBranchDto, @CurrentUser() user: AuthUser) {
    return this.branchesService.create(dto, user);
  }

  @Roles(RoleName.SUPER_ADMIN, RoleName.SCHOOL_ADMIN)
  @Get()
  findAll(@Query() query: BranchQueryDto, @CurrentUser() user: AuthUser) {
    return this.branchesService.findAll(user, query);
  }

  @Roles(RoleName.SUPER_ADMIN, RoleName.SCHOOL_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.branchesService.findOne(id, user);
  }

  @Roles(RoleName.SUPER_ADMIN, RoleName.SCHOOL_ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.branchesService.update(id, dto, user);
  }
}
