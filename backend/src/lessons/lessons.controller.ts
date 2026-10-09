import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { LESSON_MAX_PAGE_UPLOADS } from './lesson-upload.constants';
import { LessonsService } from './lessons.service';
import {
  AppendChapterTextDto,
  CompileChapterDto,
  ConfirmChapterContentDto,
  ReorderChapterPagesDto,
  CreateChapterDraftDto,
  CreateChapterPasteDto,
  CreateClassSessionDto,
  CreateLessonDto,
  ExtractLessonDto,
  RegenerateKeyPointsDto,
  ScanLessonDto,
  SubjectPaceQueryDto,
  UpdateLessonDto,
} from './dto/lesson.dto';
import { LessonRecordKind } from '@prisma/client';
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

  @IsOptional()
  @IsEnum(LessonRecordKind)
  recordKind?: LessonRecordKind;

  /** When true, hide chapter-library rows that already have a class session (exam paper picker). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  forExamLectures?: boolean;
}

class ChapterListQueryDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
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
        pageText: { type: 'string' },
        pages: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['academicYearId', 'gradeId', 'sectionId', 'subjectId', 'branchId', 'date', 'pages'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('pages', LESSON_MAX_PAGE_UPLOADS, {
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

  @Roles(RoleName.TEACHER, RoleName.SCHOOL_ADMIN)
  @Get('subject-pace')
  subjectPace(@Query() query: SubjectPaceQueryDto, @CurrentUser() user: AuthUser) {
    return this.lessonsService.getSubjectPace(user, query);
  }

  @Roles(RoleName.TEACHER)
  @Get('chapters')
  listChapters(@Query() query: ChapterListQueryDto, @CurrentUser() user: AuthUser) {
    return this.lessonsService.listChapters(user, query);
  }

  @Roles(RoleName.TEACHER)
  @Post('chapters/paste')
  createChapterPaste(@Body() dto: CreateChapterPasteDto, @CurrentUser() user: AuthUser) {
    return this.lessonsService.createChapterFromPaste(dto, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('chapters/draft')
  createChapterDraft(@Body() dto: CreateChapterDraftDto, @CurrentUser() user: AuthUser) {
    return this.lessonsService.createChapterDraft(dto, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('chapters/:id/confirm-content')
  confirmChapter(
    @Param('id') id: string,
    @Body() dto: ConfirmChapterContentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.confirmChapterContent(id, dto, user);
  }

  @Roles(RoleName.TEACHER)
  @Patch('chapters/:id/complete')
  completeChapter(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.lessonsService.markChapterCompleted(id, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('chapters/:id/append-photos')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('pages', LESSON_MAX_PAGE_UPLOADS, {
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
  appendChapterPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
    @Query('uploadId') uploadId?: string,
  ) {
    return this.lessonsService.appendChapterPhotos(id, files ?? [], user, uploadId?.trim() || undefined);
  }

  @Roles(RoleName.TEACHER)
  @Get('chapters/:id/ocr-upload-progress/:uploadId')
  getChapterOcrUploadProgress(
    @Param('uploadId') uploadId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.getOcrUploadProgress(uploadId, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('chapters/:id/pages/:sourceId/refresh-ocr')
  refreshChapterPageOcr(
    @Param('id') id: string,
    @Param('sourceId') sourceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.refreshChapterPageOcrBreakdown(id, sourceId, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('chapters/:id/pages/:sourceId/replace-photo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('pages', 1, {
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
  replaceChapterPagePhoto(
    @Param('id') id: string,
    @Param('sourceId') sourceId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
    @Query('uploadId') uploadId?: string,
  ) {
    const file = files?.[0];
    if (!file) {
      throw new BadRequestException({
        code: 'PHOTO_REQUIRED',
        message: 'Choose a photo to upload',
      });
    }
    return this.lessonsService.replaceChapterPagePhoto(
      id,
      sourceId,
      file,
      user,
      uploadId?.trim() || undefined,
    );
  }

  @Roles(RoleName.TEACHER)
  @Delete('chapters/:id/pages/:sourceId')
  deleteChapterPagePhoto(
    @Param('id') id: string,
    @Param('sourceId') sourceId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.deleteChapterPagePhoto(id, sourceId, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('chapters/:id/compile')
  compileChapter(
    @Param('id') id: string,
    @Body() dto: CompileChapterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.compileChapter(id, dto, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('chapters/:id/append-text')
  appendChapterText(
    @Param('id') id: string,
    @Body() dto: AppendChapterTextDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.appendChapterText(id, dto, user);
  }

  @Roles(RoleName.TEACHER)
  @Patch('chapters/:id/page-order')
  reorderChapterPages(
    @Param('id') id: string,
    @Body() dto: ReorderChapterPagesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessonsService.reorderChapterPages(id, dto, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('class-sessions')
  createClassSession(@Body() dto: CreateClassSessionDto, @CurrentUser() user: AuthUser) {
    return this.lessonsService.createClassSession(dto, user);
  }

  @Roles(RoleName.TEACHER)
  @Post('chapters/extract')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('pages', LESSON_MAX_PAGE_UPLOADS, {
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
  extractChapter(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: ExtractLessonDto,
    @CurrentUser() user: AuthUser,
  ) {
    dto.recordKind = LessonRecordKind.CHAPTER_LIBRARY;
    return this.lessonsService.extractFromPhotos(dto, files ?? [], user);
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

  @Roles(RoleName.TEACHER)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.lessonsService.removeDraft(id, user);
  }
}
