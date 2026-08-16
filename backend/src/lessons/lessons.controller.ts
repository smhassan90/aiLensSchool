import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { LessonStatus, RoleName } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { LessonsService } from './lessons.service';
import {
  CreateLessonDto,
  ExtractLessonDto,
  RegenerateKeyPointsDto,
  ScanLessonDto,
  UpdateLessonDto,
} from './dto/lesson.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto } from '../common/dto/pagination.dto';

class LessonListQueryDto extends PaginationDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;
}

const IMAGE_MIME = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

@ApiTags('Lessons')
@ApiBearerAuth()
@Controller({ path: 'lessons', version: '1' })
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Roles(RoleName.TEACHER)
  @Post()
  create(@Body() dto: CreateLessonDto, @CurrentUser() user: AuthUser) {
    return this.lessonsService.createManual(dto, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('extract')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        academicYearId: { type: 'string' },
        gradeId: { type: 'string' },
        sectionId: { type: 'string' },
        subjectId: { type: 'string' },
        branchId: { type: 'string' },
        date: { type: 'string' },
        teacherNotes: { type: 'string' },
        pageFrom: { type: 'string' },
        pageTo: { type: 'string' },
        pages: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['academicYearId', 'gradeId', 'sectionId', 'subjectId', 'branchId', 'date', 'pages'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('pages', 12, {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed =
          IMAGE_MIME.test(file.mimetype) ||
          (!file.mimetype && IMAGE_NAME.test(file.originalname)) ||
          IMAGE_NAME.test(file.originalname);
        if (!allowed) {
          cb(
            new BadRequestException({
              code: 'INVALID_IMAGE',
              message: 'Only JPEG, PNG, WebP, or HEIC photos are allowed',
            }),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  extract(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: ExtractLessonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.extractFromPhotos(dto, files ?? [], user);
  }

  @Roles(RoleName.TEACHER)
  @Post('scan')
  scan(@Body() dto: ScanLessonDto, @CurrentUser() user: AuthUser) {
    return this.lessonsService.scan(dto, user);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN, RoleName.PARENT)
  @Get()
  findAll(@Query() query: LessonListQueryDto, @CurrentUser() user: AuthUser) {
    return this.lessonsService.findAll(user, query);
  }

  @Roles(RoleName.TEACHER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.updateLesson(id, dto, user);
  }

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN, RoleName.PARENT)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.lessonsService.findOne(id, user);
  }

  @Roles(RoleName.TEACHER)
  @Post(':id/key-points/regenerate')
  regenerateKeyPoints(
    @Param('id') id: string,
    @Body() dto: RegenerateKeyPointsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.regenerateKeyPoints(id, dto, user);
  }

  @Roles(RoleName.TEACHER)
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.lessonsService.confirm(id, user);
  }
}
