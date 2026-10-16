import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { LibraryBooksService } from './library-books.service';

class UpdateLibraryBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  publisher?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  classLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subjectLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  editionYear?: string;
}

class GrantLibraryBookDto {
  @IsString()
  schoolId!: string;
}

class CreateLibraryBookDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  publisher?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  classLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subjectLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  editionYear?: string;
}

@ApiTags('Library books')
@ApiBearerAuth()
@Roles(RoleName.SUPER_ADMIN)
@Controller({ path: 'library-books', version: '1' })
export class LibraryBooksController {
  constructor(private readonly books: LibraryBooksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.books.listForSuperAdmin(user.id);
  }

  @Post()
  create(@Body() dto: CreateLibraryBookDto, @CurrentUser() user: AuthUser) {
    return this.books.create(user, dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.books.getForSuperAdmin(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLibraryBookDto) {
    return this.books.update(id, dto);
  }

  @Post(':id/grants')
  grant(@Param('id') id: string, @Body() dto: GrantLibraryBookDto, @CurrentUser() user: AuthUser) {
    return this.books.grant(id, dto.schoolId, user.id);
  }

  @Delete(':id/grants/:schoolId')
  revoke(@Param('id') id: string, @Param('schoolId') schoolId: string) {
    return this.books.revoke(id, schoolId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.books.remove(id);
  }
}
