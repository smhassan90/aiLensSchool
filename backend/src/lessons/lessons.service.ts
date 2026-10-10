import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIRequestStatus,
  ChapterProgressStatus,
  ClassSessionType,
  LessonRecordKind,
  LessonSourceType,
  LessonStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { MemoryCacheService } from '../common/services/memory-cache.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { ChapterCompileService } from '../ai/services/chapter-compile.service';
import { LessonProcessingService } from '../ai/services/lesson-processing.service';
import {
  joinCompiledChapter,
  splitCompiledChapter,
} from '../ai/schemas/chapter-compile.schema';
import { ParentsService } from '../parents/parents.service';
import {
  resolveHeadTeacherSectionIds,
  teacherHeadsSection,
} from '../head-teachers/head-teacher-sections';
import { LESSON_MAX_PAGE_UPLOADS } from './lesson-upload.constants';
import { PageOcrService } from './page-ocr.service';
import { deriveKeyPointsFromLesson, formatOcrLesson } from './lesson-text-formatter';
import { coerceLessonDisplayText } from './lesson-display-text';
import {
  chapterSourceIdsWithClassSessions,
  examLectureRecordWhere,
  examLectureTeachableStatusWhere,
} from './exam-lecture-filter';
import {
  AppendChapterTextDto,
  CompileChapterDto,
  ConfirmChapterContentDto,
  CreateChapterDraftDto,
  CreateChapterPasteDto,
  ReorderChapterPagesDto,
  CreateClassSessionDto,
  CreateLessonDto,
  ExtractLessonDto,
  HomeworkSessionMode,
  LessonQueryDto,
  RegenerateKeyPointsDto,
  ScanLessonDto,
  UpdateLessonDto,
} from './dto/lesson.dto';
import { DocumentsService } from '../documents/documents.service';
import { HomeworkService } from '../homework/homework.service';
import { TeacherGradeStyleService } from '../common/services/teacher-grade-style.service';
import { applyKeyPointStyle } from './teacher-content-style';
import { LessonImageInput } from '../ai/providers/ai.provider';
import {
  compactTextLength,
  countArabicScriptChars,
  countLatinLetters,
  englishOnlyFromMixedOcr,
  isFakeExtractText,
  isGarbledRtlOcr,
  isPoorLessonOcr,
  isUsableLessonOcr,
  longestRealLessonText,
  looksLikeMangledRtlOcr,
  looksLikeRealLessonText,
} from '../common/extract-quality';
import { looksLikeGarbledLatinOcr } from '../common/garbled-latin-ocr';
import {
  assembleChapterLessonFromPageTexts,
  intelligentMergePageOcrTranscripts,
} from './merge-page-ocr-with-ai';
import { mergePaddleAndTesseractPageOcr } from './merge-paddle-tesseract-ocr';
import { OcrUploadProgressService } from './ocr-upload-progress.service';
import { ocrLanguagesForSubject } from './page-ocr.service';
import { isServerlessRuntime, readEnv } from '../common/env';
import { FilesService } from '../files/files.service';
import {
  filterCompiledLessonText,
  filterPageTextForLessonAssembly,
  isPagePhotoTextReadable,
  pageOcrAcceptThreshold,
  englishPageTranscriptLooksIncomplete,
  looksLikePoemOrReadingPage,
  mergeEnglishPageVisionWithOcr,
  pageHasStructuredLessonContent,
  pickBetterPageTranscript,
  preferEnglishLessonPageTranscript,
  scorePageOcrQuality,
  pageTextNeedsVisionRetry,
} from './page-text-sanitize';
import { repairCompiledChapterFromSource } from './chapter-compile-repair';
import {
  prepareLessonPagePhoto,
  prepareLessonPagePhotoForVision,
  prepareOrientedVariant,
} from './page-image-prep';

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly lessonProcessing: LessonProcessingService,
    private readonly chapterCompile: ChapterCompileService,
    private readonly config: ConfigService,
    private readonly parentsService: ParentsService,
    private readonly pageOcr: PageOcrService,
    private readonly gradeStyle: TeacherGradeStyleService,
    private readonly cache: MemoryCacheService,
    private readonly filesService: FilesService,
    private readonly documentsService: DocumentsService,
    private readonly homeworkService: HomeworkService,
    private readonly ocrProgress: OcrUploadProgressService,
  ) {}

  private patchOcrUploadProgress(
    uploadId: string | undefined,
    lessonId: string,
    patch: Partial<import('./ocr-upload-progress.service').OcrUploadProgressSnapshot>,
  ) {
    if (!uploadId) return;
    const prev = this.ocrProgress.get(uploadId);
    if (!prev) {
      this.ocrProgress.start(uploadId, lessonId);
    }
    this.ocrProgress.patch(uploadId, patch);
  }

  getOcrUploadProgress(uploadId: string, user: AuthUser) {
    const snap = this.ocrProgress.get(uploadId);
    if (!snap) {
      return { uploadId, lessonId: '', phase: 'queued' as const, message: 'No active OCR job', paddle: 'pending' as const, tesseract: 'pending' as const, merge: 'pending' as const, updatedAt: Date.now() };
    }
    this.tenant.requireSchoolId(user);
    return snap;
  }

  private async requireTeacherProfile(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new ForbiddenException({
        code: 'TEACHER_PROFILE_REQUIRED',
        message: 'Teacher profile required',
      });
    }
    return profile;
  }

  private async assertTeacherAssignment(input: {
    schoolId: string;
    userId: string;
    teacherId: string;
    sectionId: string;
    subjectId: string;
    academicYearId: string;
  }) {
    const assignment = await this.prisma.classSubject.findFirst({
      where: {
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        academicYearId: input.academicYearId,
        OR: [{ teacherId: input.teacherId }, { assistantTeacherId: input.teacherId }],
      },
    });
    if (assignment) return assignment;

    // Class teachers can extract for any subject in their section.
    const section = await this.prisma.section.findFirst({
      where: { id: input.sectionId, classTeacherId: input.teacherId },
      select: { id: true },
    });
    if (section) return section;

    const headsSection = await teacherHeadsSection(
      this.prisma,
      input.schoolId,
      input.userId,
      input.sectionId,
    );
    if (headsSection) {
      const classRow = await this.prisma.classSubject.findFirst({
        where: {
          sectionId: input.sectionId,
          subjectId: input.subjectId,
          academicYearId: input.academicYearId,
        },
      });
      if (classRow) return classRow;
    }

    throw new ForbiddenException({
      code: 'CLASS_SUBJECT_NOT_ASSIGNED',
      message: 'You are not assigned to this class/subject. Pick a class from My classes.',
    });
  }

  private parseOptionalInt(value?: string) {
    if (!value || value.trim() === '') return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toLessonImages(files: Express.Multer.File[]): LessonImageInput[] {
    return files.slice(0, 5).map((file) => {
      const name = file.originalname?.toLowerCase() ?? '';
      let mime = file.mimetype?.toLowerCase() || '';
      if (!mime.startsWith('image/')) {
        if (name.endsWith('.png')) mime = 'image/png';
        else if (name.endsWith('.webp')) mime = 'image/webp';
        else mime = 'image/jpeg';
      }
      return { buffer: file.buffer, mimeType: mime, filename: file.originalname ?? 'page.jpg' };
    });
  }

  private structureFromPageText(
    ocrText: string,
    subjectName: string,
    pageFrom?: number,
    pageTo?: number,
    teacherNotes?: string,
  ) {
    const formatted = formatOcrLesson(ocrText, subjectName);
    return {
      chapterName: formatted.chapterName,
      topicName: formatted.topicName,
      summary: formatted.summary,
      concepts: formatted.concepts,
      pageFrom,
      pageTo,
      teacherNotesSuggestion: teacherNotes,
    };
  }

  private assemblePageTexts(
    sources?: Array<{
      type?: LessonSourceType;
      ocrText?: string | null;
      pageFrom?: number | null;
    }>,
  ) {
    if (!sources?.length) return '';
    const images = sources
      .filter((s) => s.type === LessonSourceType.TEXTBOOK_IMAGE)
      .sort((a, b) => (a.pageFrom ?? 0) - (b.pageFrom ?? 0));
    const pageTexts = images
      .map((s) => s.ocrText?.trim())
      .filter((t): t is string => Boolean(t));
    if (!pageTexts.length) return '';
    return pageTexts
      .map((t) => filterPageTextForLessonAssembly(coerceLessonDisplayText(t)))
      .filter((t) => t.trim().length > 0)
      .join('\n\n');
  }

  private chapterDraftFromSources(
    sources?: Array<{
      type?: LessonSourceType;
      ocrText?: string | null;
      manualText?: string | null;
    }>,
  ) {
    const manual = sources?.find((s) => s.type === LessonSourceType.MANUAL_TEXT);
    const manualText = manual?.manualText?.trim() || manual?.ocrText?.trim();
    if (manualText) return coerceLessonDisplayText(manualText);
    return this.assemblePageTexts(sources);
  }

  private extractedTextFromSources(
    sources?: Array<{
      type?: LessonSourceType;
      ocrText?: string | null;
      manualText?: string | null;
      pageFrom?: number | null;
      fileAssetId?: string | null;
    }>,
  ) {
    if (!sources?.length) return '';
    const pageJoined = this.assemblePageTexts(sources);
    if (pageJoined) return pageJoined;
    const manual = sources.find((s) => s.type === LessonSourceType.MANUAL_TEXT);
    const manualText = manual?.manualText?.trim() || manual?.ocrText?.trim();
    if (manualText) return coerceLessonDisplayText(manualText);
    return (
      sources
        .map((source) => {
          const raw = source.ocrText?.trim() || source.manualText?.trim() || '';
          return raw ? coerceLessonDisplayText(raw) : '';
        })
        .filter(Boolean)
        .join('\n\n') ?? ''
    );
  }

  private mapPageSources(
    sources: Array<{
      id: string;
      type: LessonSourceType;
      pageFrom?: number | null;
      ocrText?: string | null;
      paddleOcrText?: string | null;
      tesseractOcrText?: string | null;
      mergedOcrText?: string | null;
      fileAsset?: { url: string; originalFilename: string | null } | null;
    }>,
  ) {
    return sources
      .filter((s) => s.type === LessonSourceType.TEXTBOOK_IMAGE && s.fileAsset?.url)
      .sort((a, b) => (a.pageFrom ?? 0) - (b.pageFrom ?? 0))
      .map((s) => {
        const raw = s.ocrText?.trim() ? coerceLessonDisplayText(s.ocrText) : '';
        const fetchedText = raw ? filterPageTextForLessonAssembly(raw) : '';
        const textForAcceptance = fetchedText.trim() || raw;
        const textQualityPercent = raw ? scorePageOcrQuality(raw) : 0;
        const paddleRaw = s.paddleOcrText?.trim() ?? '';
        const tessRaw = s.tesseractOcrText?.trim() ?? '';
        const mergedRaw = s.mergedOcrText?.trim() ?? '';
        const mergedPreview = mergedRaw
          ? coerceLessonDisplayText(mergedRaw)
          : fetchedText.trim()
            ? fetchedText
            : '';
        return {
          id: s.id,
          pageOrder: s.pageFrom ?? 0,
          url: s.fileAsset!.url,
          label: s.fileAsset!.originalFilename ?? 'Page photo',
          fetchedText,
          /** Exact PaddleOCR output from DB — no lesson cleanup or vision merge. */
          paddleOcrText: paddleRaw,
          /** Exact Tesseract output from DB. */
          tesseractOcrText: tessRaw,
          mergedOcrText: mergedPreview,
          ocrPaddleReady: Boolean(paddleRaw),
          ocrTesseractReady: Boolean(tessRaw),
          ocrMergedReady: Boolean(mergedRaw),
          textQualityPercent,
          textAccepted: Boolean(textForAcceptance) && isPagePhotoTextReadable(textForAcceptance),
        };
      });
  }

  private presentLesson<T extends { aiSummary?: string | null; sources?: unknown }>(lesson: T) {
    const sources = lesson.sources as
      | Array<{
          id: string;
          type: LessonSourceType;
          ocrText?: string | null;
          manualText?: string | null;
          pageFrom?: number | null;
          fileAssetId?: string | null;
          fileAsset?: { url: string; originalFilename: string | null } | null;
        }>
      | undefined;
    const pageText = this.assemblePageTexts(sources);
    const draftText = this.chapterDraftFromSources(sources);
    const compiledFull = lesson.aiSummary ? coerceLessonDisplayText(lesson.aiSummary) : '';
    const compiledParts = compiledFull ? splitCompiledChapter(compiledFull) : null;
    return {
      ...lesson,
      aiSummary: compiledFull || lesson.aiSummary,
      chapterPageText: pageText,
      chapterDraftText: draftText || pageText,
      chapterCompiledText: compiledFull || undefined,
      chapterCompiledBody: compiledParts?.lessonBody,
      chapterCompiledExercises: compiledParts?.exercises,
      extractedText: compiledFull || draftText || pageText,
      pageSources: sources ? this.mapPageSources(sources) : [],
      chapterLessonText: sources
        ? assembleChapterLessonFromPageTexts(
            sources
              .filter((s) => s.type === LessonSourceType.TEXTBOOK_IMAGE)
              .sort((a, b) => (a.pageFrom ?? 0) - (b.pageFrom ?? 0))
              .map((s) => {
                const row = s as {
                  mergedOcrText?: string | null;
                  ocrText?: string | null;
                };
                return (row.mergedOcrText?.trim() || row.ocrText?.trim() || '').trim();
              })
              .filter(Boolean),
          )
        : '',
    };
  }

  private async presentLessonWithStyle<
    T extends {
      teacherId: string;
      gradeId: string;
      sources?: Array<{ ocrText?: string | null; manualText?: string | null }>;
    },
  >(lesson: T) {
    const gradeStyle = await this.gradeStyle.get(lesson.teacherId, lesson.gradeId);
    return {
      ...this.presentLesson(lesson),
      gradeStyle,
    };
  }

  private async loadPresented(id: string) {
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: {
        sources: { include: { fileAsset: { select: { url: true, originalFilename: true } } } },
        concepts: true,
        subject: true,
        section: true,
        grade: true,
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    return this.presentLessonWithStyle(lesson);
  }

  private async requireOwnedChapterLesson(id: string, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: {
        sources: {
          include: {
            fileAsset: {
              select: { url: true, originalFilename: true, storageKey: true, mimeType: true },
            },
          },
        },
        subject: true,
      },
    });
    if (!lesson || lesson.recordKind !== LessonRecordKind.CHAPTER_LIBRARY) {
      throw new NotFoundException({ code: 'CHAPTER_NOT_FOUND', message: 'Chapter not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);
    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({ code: 'LESSON_OWNER_REQUIRED', message: 'Not your chapter' });
    }
    return lesson;
  }

  private async refreshWeakChapterPages(lessonId: string, user: AuthUser) {
    const lesson = await this.requireOwnedChapterLesson(lessonId, user);
    const grade = await this.prisma.grade.findUnique({ where: { id: lesson.gradeId } });
    if (!grade || !this.visionAvailable()) return;

    const images = lesson.sources
      .filter((s) => s.type === LessonSourceType.TEXTBOOK_IMAGE && s.fileAsset?.storageKey)
      .sort((a, b) => (a.pageFrom ?? 0) - (b.pageFrom ?? 0));

    for (const source of images) {
      const current = source.ocrText?.trim() ?? '';
      if (!pageTextNeedsVisionRetry(current)) continue;
      try {
        const buffer = await this.filesService.readBufferForAsset(source.fileAsset!);
        const raw = {
          buffer,
          mimetype: source.fileAsset!.mimeType ?? 'image/jpeg',
          originalname: source.fileAsset!.originalFilename ?? 'page.jpg',
          size: buffer.length,
        } as Express.Multer.File;
        const prepared = await prepareLessonPagePhoto(raw);
        const forVision = await prepareLessonPagePhotoForVision(raw);
        const file = {
          ...raw,
          buffer: prepared.buffer,
          mimetype: prepared.mimeType,
          originalname: prepared.originalname,
          size: prepared.size,
        } as Express.Multer.File;
        const visionFile = {
          ...raw,
          buffer: forVision.buffer,
          mimetype: forVision.mimeType,
          originalname: forVision.originalname,
          size: forVision.size,
        } as Express.Multer.File;
        const retried = await this.transcribeTextbookPhoto(
          file,
          lesson.subject,
          grade,
          lesson.schoolId,
          user.id,
          { forceMainColumnVision: true, visionFile },
        );
        if (retried.trim()) {
          await this.prisma.lessonSource.update({
            where: { id: source.id },
            data: { ocrText: retried },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Page re-read failed for source ${source.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async upsertChapterManualText(
    tx: Prisma.TransactionClient,
    lessonId: string,
    sources: Array<{ id: string; type: LessonSourceType }>,
    combinedText: string,
  ) {
    const manual = sources.find((s) => s.type === LessonSourceType.MANUAL_TEXT);
    const normalized = coerceLessonDisplayText(combinedText);
    if (manual) {
      await tx.lessonSource.update({
        where: { id: manual.id },
        data: { ocrText: normalized, manualText: normalized },
      });
    } else {
      await tx.lessonSource.create({
        data: {
          lessonId,
          type: LessonSourceType.MANUAL_TEXT,
          ocrText: normalized,
          manualText: normalized,
        },
      });
    }
  }

  private unclearPagePhotoMessage(filename?: string): string {
    const label = filename?.trim() ? `"${filename.trim()}"` : 'This page';
    return `${label} is not clear enough to read. Re-upload a clearer photo: hold the phone straight above the page, use bright even light, keep the full page flat and in focus.`;
  }

  private visionAvailable(): boolean {
    return Boolean(
      readEnv('OPENAI_API_KEY') ||
        readEnv('CURSOR_API_KEY') ||
        this.config.get<string>('OPENAI_API_KEY')?.trim() ||
        this.config.get<string>('CURSOR_API_KEY')?.trim(),
    );
  }

  /**
   * Teachers rotate pages upright in the portal before upload.
   * Skip the old multi-angle Tesseract search (~4 rotations × 2 channels ≈ 50s+).
   * Only apply EXIF upright + prep buffers; OCR engines run once afterward.
   */
  private async pickBestOrientedPagePhoto(
    file: Express.Multer.File,
    subject: { name: string },
  ): Promise<{
    ocrFile: Express.Multer.File;
    visionFile: Express.Multer.File;
    ocrText: string;
    degrees: number;
  }> {
    void subject;
    const variant = await prepareOrientedVariant(file, 0);
    const ocrFile = {
      ...file,
      buffer: variant.ocr.buffer,
      mimetype: variant.ocr.mimeType,
      originalname: variant.ocr.originalname,
      size: variant.ocr.size,
    } as Express.Multer.File;
    const visionFile = {
      ...file,
      buffer: variant.vision.buffer,
      mimetype: variant.vision.mimeType,
      originalname: variant.vision.originalname,
      size: variant.vision.size,
    } as Express.Multer.File;
    return {
      ocrFile,
      visionFile,
      ocrText: '',
      degrees: 0,
    };
  }

  private assemblyFilterOptions(subject: { name: string }) {
    return {
      keepArabicScript: ocrLanguagesForSubject(subject.name) !== 'eng',
    };
  }

  /**
   * Rule merge (coverage-aware Paddle/Tesseract). Used as the sync baseline;
   * English reading pages also get AI/vision fill via finalizeChapterPageOcrMerge.
   */
  private ruleMergeChapterPageOcr(
    paddle: string,
    tesseract: string,
    orientOcrText: string,
    subject: { name: string },
  ): { text: string; merged: string } {
    const filterOpts = this.assemblyFilterOptions(subject);
    const mergedRaw = mergePaddleAndTesseractPageOcr(paddle, tesseract);
    let merged = filterPageTextForLessonAssembly(mergedRaw, filterOpts);
    if (looksLikeGarbledLatinOcr(merged)) {
      const paddleClean = (paddle ?? '').trim();
      const tessClean = (tesseract ?? '').trim();
      const fallback = pickBetterPageTranscript(
        looksLikeGarbledLatinOcr(paddleClean) ? '' : paddleClean,
        looksLikeGarbledLatinOcr(tessClean) ? '' : tessClean,
      );
      if (fallback.trim()) {
        merged = filterPageTextForLessonAssembly(fallback, filterOpts);
      }
    }
    const englishPrimary = ocrLanguagesForSubject(subject.name) === 'eng';
    const orientHint =
      looksLikeGarbledLatinOcr(orientOcrText) ? '' : (orientOcrText ?? '').trim();
    const lessonSource = englishPrimary
      ? preferEnglishLessonPageTranscript(merged, orientHint)
      : pickBetterPageTranscript(merged, orientHint);
    const text = filterPageTextForLessonAssembly(lessonSource, filterOpts);
    if (text.trim() || merged.trim()) {
      return { text, merged };
    }
    if (isPagePhotoTextReadable(orientOcrText)) {
      return {
        text: filterPageTextForLessonAssembly(orientOcrText, filterOpts),
        merged,
      };
    }
    return { text: '', merged };
  }

  /**
   * Portal upload finalize: coverage-aware rule merge, then AI merge (and vision
   * fill when English reading OCR is still incomplete). Same path for append/replace/refresh.
   */
  private async finalizeChapterPageOcrMerge(
    paddle: string,
    tesseract: string,
    orientOcrText: string,
    subject: { name: string },
    options?: {
      visionFile?: Express.Multer.File;
      gradeName?: string;
      schoolId?: string;
      userId?: string;
    },
  ): Promise<{ text: string; merged: string; usedAi: boolean }> {
    const filterOpts = this.assemblyFilterOptions(subject);
    const englishPrimary = ocrLanguagesForSubject(subject.name) === 'eng';
    const rule = this.ruleMergeChapterPageOcr(paddle, tesseract, orientOcrText, subject);

    const wantsAiFill =
      englishPrimary &&
      (looksLikePoemOrReadingPage(paddle) ||
        looksLikePoemOrReadingPage(tesseract) ||
        looksLikePoemOrReadingPage(rule.merged) ||
        englishPageTranscriptLooksIncomplete(rule.merged) ||
        englishPageTranscriptLooksIncomplete(rule.text));

    // Vision on every page is slow; default off. Set OCR_MERGE_VISION=1 to enable.
    let visionText = '';
    if (
      wantsAiFill &&
      readEnv('OCR_MERGE_VISION') === '1' &&
      options?.visionFile &&
      options.gradeName &&
      options.schoolId &&
      options.userId &&
      this.visionAvailable() &&
      (englishPageTranscriptLooksIncomplete(rule.merged) ||
        englishPageTranscriptLooksIncomplete(rule.text) ||
        pageTextNeedsVisionRetry(rule.merged))
    ) {
      try {
        visionText = (
          await this.transcribeTextbookPhoto(
            options.visionFile,
            subject,
            { name: options.gradeName },
            options.schoolId,
            options.userId,
            { visionFile: options.visionFile },
          )
        ).trim();
      } catch (error) {
        this.logger.warn(
          `Vision fill for OCR merge skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const skipAi = readEnv('OCR_AI_MERGE') === '0' || !wantsAiFill;
    const { merged: aiMerged, usedAi } = await intelligentMergePageOcrTranscripts({
      paddle,
      tesseract,
      orientHint: looksLikeGarbledLatinOcr(orientOcrText) ? '' : orientOcrText,
      visionText: visionText || undefined,
      subjectName: subject.name,
      skipAi,
    });

    let merged = filterPageTextForLessonAssembly(aiMerged || rule.merged, filterOpts);
    if (!merged.trim()) merged = rule.merged;
    if (visionText) {
      merged = mergeEnglishPageVisionWithOcr(visionText, merged);
      merged = filterPageTextForLessonAssembly(merged, filterOpts);
    }

    const orientHint =
      looksLikeGarbledLatinOcr(orientOcrText) ? '' : (orientOcrText ?? '').trim();
    const lessonSource = englishPrimary
      ? preferEnglishLessonPageTranscript(merged, orientHint)
      : pickBetterPageTranscript(merged, orientHint);
    const text = filterPageTextForLessonAssembly(lessonSource, filterOpts);
    if (text.trim() || merged.trim()) {
      return { text: text || merged, merged, usedAi: usedAi || Boolean(visionText) };
    }
    return { text: rule.text, merged: rule.merged, usedAi: false };
  }

  private async persistChapterPageEngineOcr(
    sourceId: string,
    paddle: string,
    tesseract: string,
    orientOcrText: string,
    subject: { name: string },
    uploadId?: string,
    lessonId?: string,
    finalizeOpts?: {
      visionFile?: Express.Multer.File;
      gradeName?: string;
      schoolId?: string;
      userId?: string;
    },
  ): Promise<void> {
    if (uploadId && lessonId) {
      this.patchOcrUploadProgress(uploadId, lessonId, {
        phase: 'merging',
        merge: 'running',
        message: 'Merging PaddleOCR and Tesseract (AI fill when needed)…',
      });
    }
    const { text, merged, usedAi } = await this.finalizeChapterPageOcrMerge(
      paddle,
      tesseract,
      orientOcrText,
      subject,
      finalizeOpts,
    );
    await this.prisma.lessonSource.update({
      where: { id: sourceId },
      data: {
        ocrText: text.trim() || null,
        mergedOcrText: merged.trim() || null,
      },
    });
    if (uploadId && lessonId) {
      this.patchOcrUploadProgress(uploadId, lessonId, {
        merge: 'done',
        message: usedAi
          ? 'AI-assisted merge complete. Page text saved.'
          : 'Merge complete. Page text saved.',
      });
    }
  }

  /**
   * Prepare + read a page. Tries alternate rotations when the first pass is unreadable —
   * phones often capture textbook pages sideways; a blind landscape→portrait turn
   * used to make OCR fail with mirrored junk.
   */
  private async prepareAndTranscribePagePhoto(
    file: Express.Multer.File,
    subject: { name: string },
    grade: { name: string },
    schoolId: string,
    userId: string,
  ): Promise<{
    text: string;
    readyFile: Express.Multer.File;
    ocrEngines?: { paddle: string; tesseract: string; merged: string };
  }> {
    const orient = await this.pickBestOrientedPagePhoto(file, subject);
    const [{ paddle, tesseract }] = await this.pageOcr.readPageOcrEnginesParallel(
      [orient.ocrFile],
      { subjectName: subject.name },
    );
    const { text, merged } = await this.finalizeChapterPageOcrMerge(
      paddle,
      tesseract,
      orient.ocrText,
      subject,
      {
        visionFile: orient.visionFile,
        gradeName: grade.name,
        schoolId,
        userId,
      },
    );
    return {
      text,
      readyFile: orient.ocrFile,
      ocrEngines: { paddle, tesseract, merged },
    };
  }

  /** OCR + vision for a single textbook photo (used when appending chapter pages one at a time). */
  private async transcribeTextbookPhoto(
    file: Express.Multer.File,
    subject: { name: string },
    grade: { name: string },
    schoolId: string,
    userId: string,
    options?: {
      forceMainColumnVision?: boolean;
      forceTintedPageVision?: boolean;
      /** Color upright photo for vision — greyscale OCR prep often truncates poem lines. */
      visionFile?: Express.Multer.File;
    },
  ): Promise<string> {
    const expectsArabicScript = ocrLanguagesForSubject(subject.name) !== 'eng';
    const canVision = this.visionAvailable();
    const visionImages = this.toLessonImages([options?.visionFile ?? file]);

    if (options?.forceTintedPageVision && canVision) {
      const tintedPrompt = [
        `Transcribe this ${subject.name} textbook page (${grade.name}) for the teacher's lesson library.`,
        'The page may have a colored or parchment background, a large illustration, and decorative borders — ignore border art and the picture itself.',
        'Copy every unit header, pre-reading question, red story/poem title, author line (with years), and EVERY stanza or paragraph line below the illustration through the bottom of the page.',
        'Do not stop at the title. After "Reading text" / the story title you MUST copy all poem lines verbatim (for example lines that begin with King Bruce / I sought / And climbed). Keep English as English. Keep Urdu/Arabic in Unicode script.',
      ].join(' ');
      try {
        const polished = await this.lessonProcessing.process({
          schoolId,
          userId,
          sourceText: tintedPrompt,
          subjectName: subject.name,
          gradeName: grade.name,
          images: visionImages,
        });
        const cleaned = filterPageTextForLessonAssembly(coerceLessonDisplayText(polished.summary));
        if (cleaned.trim().length >= 40 && !isFakeExtractText(cleaned)) {
          const [ocrForMerge] = await this.pageOcr.readPageTexts([file], {
            subjectName: subject.name,
          });
          const merged = mergeEnglishPageVisionWithOcr(cleaned, ocrForMerge ?? '');
          if (
            merged.trim().length >= 40 &&
            !isFakeExtractText(merged) &&
            !englishPageTranscriptLooksIncomplete(merged)
          ) {
            return merged;
          }
          // Incomplete vision (title only) — keep going so OCR / another pass can fill the poem.
        }
      } catch (error) {
        this.logger.warn(
          `Tinted-page vision failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (options?.forceMainColumnVision && canVision) {
      const mainColumnPrompt = [
        `Transcribe ONLY the main reading passage and primary headings on this ${subject.name} textbook page (${grade.name}).`,
        'SKIP: sidebars, "jumbled words" activities, footers, page numbers, mirrored or reversed text, answer keys, and decorative fonts.',
        'Keep real lesson/story paragraphs in correct reading order. Keep Urdu/Arabic in Unicode script.',
      ].join(' ');
      try {
        const polished = await this.lessonProcessing.process({
          schoolId,
          userId,
          sourceText: mainColumnPrompt,
          subjectName: subject.name,
          gradeName: grade.name,
          images: visionImages,
        });
        const cleaned = filterPageTextForLessonAssembly(coerceLessonDisplayText(polished.summary));
        if (cleaned.trim().length >= 40 && !isFakeExtractText(cleaned)) {
          return cleaned;
        }
      } catch (error) {
        this.logger.warn(
          `Main-column vision retry failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const [tesseractText] = await this.pageOcr.readPageTexts([file], { subjectName: subject.name });
    const resolvedOcr = (tesseractText ?? '').trim();
    const ocrGarbled = isPoorLessonOcr(resolvedOcr, { expectArabicScript: expectsArabicScript });
    const usableOcr = isUsableLessonOcr(resolvedOcr, {
      expectArabicScript: expectsArabicScript,
    });
    const needsPhotoVision = expectsArabicScript || isGarbledRtlOcr(resolvedOcr) || ocrGarbled;
    const usePhotoVision = canVision && (needsPhotoVision || !usableOcr);
    const local = this.structureFromPageText(
      usableOcr ? resolvedOcr : `${subject.name} lesson`,
      subject.name,
    );
    const ocrThin =
      isFakeExtractText(resolvedOcr) ||
      ocrGarbled ||
      (usePhotoVision && !usableOcr) ||
      (needsPhotoVision && canVision && !usableOcr);

    if (needsPhotoVision && !canVision && (ocrGarbled || isFakeExtractText(resolvedOcr))) {
      throw new BadRequestException({
        code: 'PHOTO_VISION_REQUIRED',
        message:
          'This page needs AI photo reading. Set CURSOR_API_KEY or OPENAI_API_KEY on the backend, then try again.',
      });
    }

    const ocrAlreadyReadable =
      Boolean(resolvedOcr.trim()) &&
      (isPagePhotoTextReadable(resolvedOcr) ||
        isPagePhotoTextReadable(filterPageTextForLessonAssembly(resolvedOcr)));
    const ocrHasReadingBody =
      Boolean(resolvedOcr.trim()) && !englishPageTranscriptLooksIncomplete(resolvedOcr);
    const visionOpts = { visionFile: options?.visionFile };

    let summary: string;
    // Prefer readable OCR that already includes the poem/body. Only force vision when OCR
    // is incomplete (title/questions only) or unusable — vision on greyscale often truncates.
    if (
      canVision &&
      !expectsArabicScript &&
      !options?.forceTintedPageVision &&
      (!ocrAlreadyReadable || !ocrHasReadingBody) &&
      (pageHasStructuredLessonContent(resolvedOcr) || !resolvedOcr.trim()) &&
      (scorePageOcrQuality(resolvedOcr) >= 40 || !resolvedOcr.trim())
    ) {
      try {
        const retried = await this.transcribeTextbookPhoto(file, subject, grade, schoolId, userId, {
          forceTintedPageVision: true,
          ...visionOpts,
        });
        const merged = mergeEnglishPageVisionWithOcr(retried, resolvedOcr);
        if (
          merged.trim().length >= 40 &&
          !isFakeExtractText(merged) &&
          !englishPageTranscriptLooksIncomplete(merged)
        ) {
          return merged;
        }
        if (ocrHasReadingBody && merged.trim().length >= 40 && !isFakeExtractText(merged)) {
          return mergeEnglishPageVisionWithOcr(merged, resolvedOcr);
        }
      } catch (error) {
        this.logger.warn(
          `Structured-page vision enhance failed, using OCR: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (
      ((usableOcr && !ocrThin && !needsPhotoVision) || ocrAlreadyReadable) &&
      ocrHasReadingBody
    ) {
      summary = resolvedOcr;
    } else if ((usableOcr && !ocrThin && !needsPhotoVision) || ocrAlreadyReadable) {
      summary = resolvedOcr;
    } else {
      const visionTranscribePrompt = expectsArabicScript
        ? `Transcribe the attached ${subject.name} textbook page photo for ${grade.name}. Copy every heading, paragraph, number, and activity instruction accurately. Keep English as English. Keep every Urdu/Arabic line in original Unicode script (not Latin letters).`
        : [
            `Transcribe this ${subject.name} textbook page (${grade.name}).`,
            'The page may have a colored background, red headings, a large illustration, and decorative borders — ignore border art and the picture.',
            'Copy headers, pre-reading questions, titles, author lines, and every poem/story line through the bottom of the page (below the picture). Do not stop at the title.',
          ].join(' ');
      try {
        const polished = await this.lessonProcessing.process({
          schoolId,
          userId,
          sourceText: usePhotoVision || !usableOcr ? visionTranscribePrompt : resolvedOcr,
          subjectName: subject.name,
          gradeName: grade.name,
          images: canVision && usePhotoVision ? visionImages : undefined,
        });
        summary = !expectsArabicScript
          ? mergeEnglishPageVisionWithOcr(polished.summary, resolvedOcr)
          : polished.summary;
      } catch (error) {
        const englishFallback = englishOnlyFromMixedOcr(resolvedOcr);
        if (compactTextLength(englishFallback) > 140) {
          summary = englishFallback;
        } else if (usableOcr && !ocrThin) {
          summary = resolvedOcr;
        } else {
          throw error;
        }
      }
    }

    if (
      !expectsArabicScript &&
      englishPageTranscriptLooksIncomplete(summary) &&
      ocrHasReadingBody
    ) {
      summary = mergeEnglishPageVisionWithOcr(summary, resolvedOcr);
    }

    if (isGarbledRtlOcr(summary) || looksLikeMangledRtlOcr(summary)) {
      const englishFallback = englishOnlyFromMixedOcr(longestRealLessonText(resolvedOcr, summary));
      if (compactTextLength(englishFallback) > 140) {
        summary = englishFallback;
      }
    }
    if (usableOcr && !isUsableLessonOcr(summary, { expectArabicScript: expectsArabicScript })) {
      summary = resolvedOcr;
    }
    const cannotReadPage =
      !usableOcr &&
      !ocrAlreadyReadable &&
      (ocrGarbled || isFakeExtractText(resolvedOcr) || usePhotoVision);
    if (cannotReadPage || isFakeExtractText(summary)) {
      const ocrSalvage = englishOnlyFromMixedOcr(resolvedOcr);
      if (ocrAlreadyReadable) {
        summary = resolvedOcr;
      } else if (
        compactTextLength(ocrSalvage) > 140 &&
        (isPagePhotoTextReadable(ocrSalvage) || isPagePhotoTextReadable(resolvedOcr))
      ) {
        summary = ocrSalvage;
      }
    }
    const polishedLooksReal =
      usableOcr ||
      ocrAlreadyReadable ||
      isUsableLessonOcr(summary, { expectArabicScript: expectsArabicScript }) ||
      (looksLikeRealLessonText(summary) &&
        !isPoorLessonOcr(summary, { expectArabicScript: expectsArabicScript }));
    if (cannotReadPage && !polishedLooksReal) {
      throw new BadRequestException({
        code: 'PAGE_TEXT_UNREADABLE',
        message:
          'Could not read this page clearly. Try a sharper photo with the full page flat and well lit.',
      });
    }
    if (isFakeExtractText(summary)) {
      if (ocrAlreadyReadable) {
        summary = resolvedOcr;
      } else {
        throw new BadRequestException({
          code: 'PAGE_TEXT_UNREADABLE',
          message: 'Could not read this page clearly. Try again with a clearer photo.',
        });
      }
    }
    let final = coerceLessonDisplayText(
      longestRealLessonText(
        usableOcr || ocrAlreadyReadable ? resolvedOcr : undefined,
        polishedLooksReal ? summary : undefined,
      ),
    );
    final = filterPageTextForLessonAssembly(final);
    if (
      englishPageTranscriptLooksIncomplete(final) &&
      ocrHasReadingBody &&
      !isPoorLessonOcr(resolvedOcr, { expectArabicScript: false })
    ) {
      const ocrKept = filterPageTextForLessonAssembly(resolvedOcr);
      final =
        ocrKept.trim() && !englishPageTranscriptLooksIncomplete(ocrKept)
          ? ocrKept
          : resolvedOcr;
    }
    if (
      !ocrAlreadyReadable &&
      pageTextNeedsVisionRetry(final) &&
      canVision &&
      !options?.forceMainColumnVision &&
      !options?.forceTintedPageVision
    ) {
      try {
        const retried = await this.transcribeTextbookPhoto(file, subject, grade, schoolId, userId, {
          forceTintedPageVision: !expectsArabicScript,
          forceMainColumnVision: expectsArabicScript,
          ...visionOpts,
        });
        if (retried.trim().length >= 40) {
          final = mergeEnglishPageVisionWithOcr(retried, resolvedOcr);
        }
      } catch (error) {
        this.logger.warn(
          `Vision retry after weak OCR failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (
      englishPageTranscriptLooksIncomplete(final) &&
      ocrHasReadingBody &&
      !isPoorLessonOcr(resolvedOcr, { expectArabicScript: false })
    ) {
      final = mergeEnglishPageVisionWithOcr(final, resolvedOcr);
    }
    if (!isPagePhotoTextReadable(final)) {
      if (ocrAlreadyReadable) {
        const ocrFinal = filterPageTextForLessonAssembly(resolvedOcr) || resolvedOcr;
        if (isPagePhotoTextReadable(ocrFinal) || isPagePhotoTextReadable(resolvedOcr)) {
          return isPagePhotoTextReadable(ocrFinal) ? ocrFinal : resolvedOcr;
        }
      }
      const quality = scorePageOcrQuality(final);
      const need = pageOcrAcceptThreshold(final);
      if (canVision && !options?.forceTintedPageVision) {
        try {
          const retried = await this.transcribeTextbookPhoto(file, subject, grade, schoolId, userId, {
            forceTintedPageVision: true,
            ...visionOpts,
          });
          const merged = mergeEnglishPageVisionWithOcr(retried, resolvedOcr);
          if (isPagePhotoTextReadable(merged) && !englishPageTranscriptLooksIncomplete(merged)) {
            return merged;
          }
          if (merged.trim().length > final.trim().length) {
            final = merged;
          }
        } catch (error) {
          this.logger.warn(
            `Tinted vision clarity retry failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      if (!isPagePhotoTextReadable(final)) {
        if (isPagePhotoTextReadable(resolvedOcr)) {
          return resolvedOcr;
        }
        const qualityAfter = scorePageOcrQuality(final);
        throw new BadRequestException({
          code: 'PAGE_PHOTO_UNCLEAR',
          message:
            qualityAfter > 0 && qualityAfter < need
              ? `Only about ${qualityAfter}% of this page was read clearly (need at least ${need}%). ${this.unclearPagePhotoMessage(file.originalname)}`
              : this.unclearPagePhotoMessage(file.originalname),
        });
      }
    }
    return final;
  }

  async appendChapterPhotos(
    id: string,
    files: Express.Multer.File[],
    user: AuthUser,
    uploadId?: string,
  ) {
    if (!files?.length) {
      throw new BadRequestException({
        code: 'PHOTOS_REQUIRED',
        message: 'Upload at least one photo',
      });
    }
    if (files.length > LESSON_MAX_PAGE_UPLOADS) {
      throw new BadRequestException({
        code: 'TOO_MANY_PHOTOS',
        message: `You can add up to ${LESSON_MAX_PAGE_UPLOADS} photos in one upload. Add more in another batch if needed.`,
      });
    }
    const lesson = await this.requireOwnedChapterLesson(id, user);
    const schoolId = lesson.schoolId;
    const grade = await this.prisma.grade.findUnique({ where: { id: lesson.gradeId } });
    if (!grade) {
      throw new BadRequestException({
        code: 'CLASS_NOT_FOUND',
        message: 'Grade was not found for this chapter',
      });
    }
    const existingImages = lesson.sources.filter((s) => s.type === LessonSourceType.TEXTBOOK_IMAGE);
    const startPage =
      existingImages.reduce((max, s) => Math.max(max, s.pageFrom ?? 0), 0) + 1;

    if (uploadId) {
      this.ocrProgress.start(uploadId, id, files[0]?.originalname);
    }

    const finalizeJobs: Promise<void>[] = [];

    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (uploadId && index > 0) {
          this.patchOcrUploadProgress(uploadId, id, {
            phase: 'next_page',
            fileName: file.originalname,
            pageLabel: `Page ${startPage + index}`,
            message: `Starting next image (${file.originalname ?? 'photo'})…`,
            paddle: 'pending',
            tesseract: 'pending',
            merge: 'pending',
          });
        }

        if (uploadId) {
          this.patchOcrUploadProgress(uploadId, id, {
            phase: 'orienting',
            fileName: file.originalname,
            pageLabel: `Page ${startPage + index}`,
            message: 'Preparing page photo…',
            paddle: 'pending',
            tesseract: 'pending',
            merge: 'pending',
          });
        }

        let orient: {
          ocrFile: Express.Multer.File;
          visionFile: Express.Multer.File;
          ocrText: string;
          degrees: number;
        };
        try {
          orient = await this.pickBestOrientedPagePhoto(file, lesson.subject);
        } catch (error) {
          if (uploadId) {
            this.patchOcrUploadProgress(uploadId, id, {
              phase: 'error',
              message: this.unclearPagePhotoMessage(file.originalname),
            });
          }
          if (error instanceof BadRequestException) {
            throw error;
          }
          throw new BadRequestException({
            code: 'PAGE_PHOTO_UNCLEAR',
            message: this.unclearPagePhotoMessage(file.originalname),
          });
        }

        if (uploadId) {
          this.patchOcrUploadProgress(uploadId, id, {
            phase: 'engines',
            message: 'PaddleOCR and Tesseract reading this page in parallel…',
            paddle: 'running',
            tesseract: 'running',
          });
        }

        let paddle: string;
        let tesseract: string;
        try {
          [{ paddle, tesseract }] = await this.pageOcr.readPageOcrEnginesParallel(
            [orient.ocrFile],
            {
              subjectName: lesson.subject.name,
              onEngineProgress: (engine, status) => {
                if (!uploadId) return;
                const label =
                  engine === 'paddle'
                    ? status === 'running'
                      ? 'PaddleOCR is fetching text…'
                      : 'PaddleOCR finished.'
                    : status === 'running'
                      ? 'Tesseract is fetching text…'
                      : 'Tesseract finished.';
                this.patchOcrUploadProgress(uploadId, id, {
                  phase: engine === 'paddle' ? 'paddle' : 'tesseract',
                  [engine]: status === 'skipped' ? 'skipped' : status === 'running' ? 'running' : 'done',
                  message: label,
                });
              },
            },
          );
        } catch (error) {
          if (uploadId) {
            this.patchOcrUploadProgress(uploadId, id, {
              phase: 'error',
              message: 'OCR engines failed on this page.',
            });
          }
          if (error instanceof BadRequestException) {
            throw error;
          }
          throw new BadRequestException({
            code: 'PAGE_PHOTO_UNCLEAR',
            message: this.unclearPagePhotoMessage(file.originalname),
          });
        }

        if (uploadId) {
          this.patchOcrUploadProgress(uploadId, id, {
            phase: 'saving',
            paddle: paddle.trim() ? 'done' : 'skipped',
            tesseract: tesseract.trim() ? 'done' : 'skipped',
            message: 'Saving Paddle and Tesseract text to the database…',
          });
        }

        const asset = await this.filesService.saveSchoolUpload(
          schoolId,
          user.id,
          orient.ocrFile,
          'lesson-pages',
        );
        const source = await this.prisma.lessonSource.create({
          data: {
            lessonId: id,
            type: LessonSourceType.TEXTBOOK_IMAGE,
            fileAssetId: asset.id,
            pageFrom: startPage + index,
            paddleOcrText: paddle.trim() || null,
            tesseractOcrText: tesseract.trim() || null,
          },
        });

        if (uploadId) {
          this.patchOcrUploadProgress(uploadId, id, {
            message: 'Engine text saved. Merge running in the background…',
            merge: 'running',
          });
        }

        finalizeJobs.push(
          this.persistChapterPageEngineOcr(
            source.id,
            paddle,
            tesseract,
            orient.ocrText,
            lesson.subject,
            uploadId,
            id,
            {
              visionFile: orient.visionFile,
              gradeName: grade.name,
              schoolId,
              userId: user.id,
            },
          ),
        );
      }

      await Promise.all(finalizeJobs);
    } catch (error) {
      if (uploadId) {
        this.patchOcrUploadProgress(uploadId, id, {
          phase: 'error',
          message: error instanceof BadRequestException ? error.message : 'Page OCR failed.',
        });
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({
        code: 'PAGE_PHOTO_UNCLEAR',
        message: 'One or more page photos could not be read clearly. Re-upload the failed pages.',
      });
    }

    await this.prisma.dailyLesson.update({
      where: { id },
      data: {
        contentConfirmed: false,
        status: LessonStatus.READY_FOR_REVIEW,
      },
    });

    if (uploadId) {
      this.patchOcrUploadProgress(uploadId, id, {
        phase: 'done',
        paddle: 'done',
        tesseract: 'done',
        merge: 'done',
        message: 'All steps complete for this upload.',
      });
    }

    return this.loadPresented(id);
  }

  async replaceChapterPagePhoto(
    lessonId: string,
    sourceId: string,
    file: Express.Multer.File,
    user: AuthUser,
    uploadId?: string,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'PHOTO_REQUIRED',
        message: 'Choose a photo to upload',
      });
    }
    const lesson = await this.requireOwnedChapterLesson(lessonId, user);
    const source = lesson.sources.find(
      (s) => s.id === sourceId && s.type === LessonSourceType.TEXTBOOK_IMAGE,
    );
    if (!source) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: 'Page photo not found' });
    }
    const grade = await this.prisma.grade.findUnique({ where: { id: lesson.gradeId } });
    if (!grade) {
      throw new BadRequestException({
        code: 'CLASS_NOT_FOUND',
        message: 'Grade was not found for this chapter',
      });
    }
    if (uploadId) {
      this.ocrProgress.start(uploadId, lessonId, file.originalname);
    }
    if (uploadId) {
      this.patchOcrUploadProgress(uploadId, lessonId, {
        phase: 'orienting',
        message: 'Preparing page photo…',
      });
    }
    let orient: {
      ocrFile: Express.Multer.File;
      visionFile: Express.Multer.File;
      ocrText: string;
      degrees: number;
    };
    try {
      orient = await this.pickBestOrientedPagePhoto(file, lesson.subject);
    } catch (error) {
      if (uploadId) {
        this.patchOcrUploadProgress(uploadId, lessonId, {
          phase: 'error',
          message: this.unclearPagePhotoMessage(file.originalname),
        });
      }
      throw error;
    }
    if (uploadId) {
      this.patchOcrUploadProgress(uploadId, lessonId, {
        phase: 'engines',
        message: 'PaddleOCR and Tesseract reading in parallel…',
        paddle: 'running',
        tesseract: 'running',
      });
    }
    const [{ paddle, tesseract }] = await this.pageOcr.readPageOcrEnginesParallel(
      [orient.ocrFile],
      {
        subjectName: lesson.subject.name,
        onEngineProgress: (engine, status) => {
          if (!uploadId) return;
          this.patchOcrUploadProgress(uploadId, lessonId, {
            phase: engine === 'paddle' ? 'paddle' : 'tesseract',
            [engine]: status === 'skipped' ? 'skipped' : status === 'running' ? 'running' : 'done',
            message:
              engine === 'paddle'
                ? status === 'running'
                  ? 'PaddleOCR is fetching text…'
                  : 'PaddleOCR finished.'
                : status === 'running'
                  ? 'Tesseract is fetching text…'
                  : 'Tesseract finished.',
          });
        },
      },
    );
    const { text, merged } = await this.finalizeChapterPageOcrMerge(
      paddle,
      tesseract,
      orient.ocrText,
      lesson.subject,
      {
        visionFile: orient.visionFile,
        gradeName: grade.name,
        schoolId: lesson.schoolId,
        userId: user.id,
      },
    );
    const asset = await this.filesService.saveSchoolUpload(
      lesson.schoolId,
      user.id,
      orient.ocrFile,
      'lesson-pages',
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.lessonSource.update({
        where: { id: sourceId },
        data: {
          fileAssetId: asset.id,
          ocrText: text.trim() || null,
          paddleOcrText: paddle.trim() || null,
          tesseractOcrText: tesseract.trim() || null,
          mergedOcrText: merged.trim() || null,
        },
      });
      await tx.dailyLesson.update({
        where: { id: lessonId },
        data: {
          contentConfirmed: false,
          status: LessonStatus.READY_FOR_REVIEW,
        },
      });
    });
    if (uploadId) {
      this.patchOcrUploadProgress(uploadId, lessonId, {
        phase: 'done',
        paddle: 'done',
        tesseract: 'done',
        merge: 'done',
        message: 'Re-upload complete.',
      });
    }
    return this.loadPresented(lessonId);
  }

  /** Re-run Paddle + Tesseract on the stored page image (legacy pages or missing breakdown). */
  async refreshChapterPageOcrBreakdown(
    lessonId: string,
    sourceId: string,
    user: AuthUser,
    uploadId?: string,
  ) {
    const lesson = await this.requireOwnedChapterLesson(lessonId, user);
    const source = lesson.sources.find(
      (s) => s.id === sourceId && s.type === LessonSourceType.TEXTBOOK_IMAGE,
    );
    if (!source?.fileAsset?.storageKey) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: 'Page photo not found' });
    }
    const grade = await this.prisma.grade.findUnique({ where: { id: lesson.gradeId } });
    if (!grade) {
      throw new BadRequestException({
        code: 'CLASS_NOT_FOUND',
        message: 'Grade was not found for this chapter',
      });
    }
    const buffer = await this.filesService.readBufferForAsset(source.fileAsset);
    const raw = {
      buffer,
      mimetype: source.fileAsset.mimeType ?? 'image/jpeg',
      originalname: source.fileAsset.originalFilename ?? 'page.jpg',
      size: buffer.length,
    } as Express.Multer.File;

    let orient: {
      ocrFile: Express.Multer.File;
      visionFile: Express.Multer.File;
      ocrText: string;
      degrees: number;
    };
    try {
      orient = await this.pickBestOrientedPagePhoto(raw, lesson.subject);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({
        code: 'PAGE_PHOTO_UNCLEAR',
        message: this.unclearPagePhotoMessage(source.fileAsset.originalFilename ?? undefined),
      });
    }

    const [{ paddle, tesseract }] = await this.pageOcr.readPageOcrEnginesParallel(
      [orient.ocrFile],
      { subjectName: lesson.subject.name },
    );

    await this.prisma.lessonSource.update({
      where: { id: sourceId },
      data: {
        paddleOcrText: paddle.trim() || null,
        tesseractOcrText: tesseract.trim() || null,
      },
    });

    await this.persistChapterPageEngineOcr(
      sourceId,
      paddle,
      tesseract,
      orient.ocrText,
      lesson.subject,
      uploadId,
      lessonId,
      {
        visionFile: orient.visionFile,
        gradeName: grade.name,
        schoolId: lesson.schoolId,
        userId: user.id,
      },
    );

    await this.prisma.dailyLesson.update({
      where: { id: lessonId },
      data: {
        contentConfirmed: false,
        status: LessonStatus.READY_FOR_REVIEW,
      },
    });

    return this.loadPresented(lessonId);
  }

  async deleteChapterPagePhoto(lessonId: string, sourceId: string, user: AuthUser) {
    const lesson = await this.requireOwnedChapterLesson(lessonId, user);
    const source = lesson.sources.find(
      (s) => s.id === sourceId && s.type === LessonSourceType.TEXTBOOK_IMAGE,
    );
    if (!source) {
      throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: 'Page photo not found' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonSource.delete({ where: { id: sourceId } });
      const remaining = await tx.lessonSource.findMany({
        where: { lessonId, type: LessonSourceType.TEXTBOOK_IMAGE },
        orderBy: { pageFrom: 'asc' },
      });
      for (let index = 0; index < remaining.length; index++) {
        await tx.lessonSource.update({
          where: { id: remaining[index].id },
          data: { pageFrom: index + 1 },
        });
      }
      await tx.dailyLesson.update({
        where: { id: lessonId },
        data: {
          contentConfirmed: false,
          status: LessonStatus.READY_FOR_REVIEW,
        },
      });
    });

    return this.loadPresented(lessonId);
  }

  async appendChapterText(id: string, dto: AppendChapterTextDto, user: AuthUser) {
    const lesson = await this.requireOwnedChapterLesson(id, user);
    const addition = coerceLessonDisplayText(dto.text.trim());
    const existingText = this.extractedTextFromSources(lesson.sources);
    const combinedText = existingText ? `${existingText}\n\n${addition}` : addition;

    await this.prisma.$transaction(async (tx) => {
      await this.upsertChapterManualText(tx, id, lesson.sources, combinedText);
      await tx.dailyLesson.update({
        where: { id },
        data: {
          aiSummary: combinedText,
          contentConfirmed: false,
          status: LessonStatus.READY_FOR_REVIEW,
        },
      });
    });

    return this.loadPresented(id);
  }

  async reorderChapterPages(id: string, dto: ReorderChapterPagesDto, user: AuthUser) {
    const lesson = await this.requireOwnedChapterLesson(id, user);
    const images = lesson.sources
      .filter((s) => s.type === LessonSourceType.TEXTBOOK_IMAGE)
      .sort((a, b) => (a.pageFrom ?? 0) - (b.pageFrom ?? 0));
    if (!images.length) {
      throw new BadRequestException({
        code: 'NO_PAGE_PHOTOS',
        message: 'This chapter has no page photos to reorder',
      });
    }
    const expected = new Set(images.map((s) => s.id));
    if (dto.sourceIds.length !== images.length || dto.sourceIds.some((sid) => !expected.has(sid))) {
      throw new BadRequestException({
        code: 'INVALID_PAGE_ORDER',
        message: 'Provide every page photo id in the new order',
      });
    }
    const byId = new Map(images.map((s) => [s.id, s]));
    const ordered = dto.sourceIds.map((sid) => byId.get(sid)!);
    await this.prisma.$transaction(async (tx) => {
      for (let index = 0; index < ordered.length; index++) {
        await tx.lessonSource.update({
          where: { id: ordered[index].id },
          data: { pageFrom: index + 1 },
        });
      }
    });

    return this.loadPresented(id);
  }

  async compileChapter(id: string, dto: CompileChapterDto, user: AuthUser) {
    const lesson = await this.requireOwnedChapterLesson(id, user);
    const grade = await this.prisma.grade.findUnique({ where: { id: lesson.gradeId } });
    if (!grade) {
      throw new BadRequestException({
        code: 'CLASS_NOT_FOUND',
        message: 'Grade was not found for this chapter',
      });
    }

    await this.refreshWeakChapterPages(id, user);
    const refreshed = await this.requireOwnedChapterLesson(id, user);

    const assembled = this.assemblePageTexts(refreshed.sources);
    const rawCandidate =
      dto.sourceText?.trim() || this.chapterDraftFromSources(refreshed.sources) || assembled;
    // Strip any accidental JSON blobs, then light-filter (poem pages keep stanzas).
    const compileSource = filterPageTextForLessonAssembly(
      coerceLessonDisplayText(rawCandidate),
    ).trim();
    if (!compileSource) {
      throw new BadRequestException({
        code: 'CONTENT_REQUIRED',
        message: 'Read page text first, then compile the lesson',
      });
    }

    const compiled = await this.chapterCompile.compile({
      schoolId: lesson.schoolId,
      userId: user.id,
      sourceText: compileSource,
      subjectName: lesson.subject.name,
      gradeName: grade.name,
      instruction: dto.instruction?.trim(),
    });

    const repaired = repairCompiledChapterFromSource(
      compileSource,
      compiled.lessonBody,
      compiled.exercises,
    );
    const lessonBody = filterCompiledLessonText(repaired.lessonBody);
    const exercises = filterCompiledLessonText(repaired.exercises);
    const fullText = joinCompiledChapter(lessonBody, exercises);
    const concepts = compiled.concepts?.length
      ? compiled.concepts
      : deriveKeyPointsFromLesson(lessonBody);

    await this.prisma.$transaction(async (tx) => {
      const refreshed = await tx.lessonSource.findMany({ where: { lessonId: id } });
      await this.upsertChapterManualText(tx, id, refreshed, coerceLessonDisplayText(compileSource));
      await tx.dailyLesson.update({
        where: { id },
        data: {
          aiSummary: coerceLessonDisplayText(fullText),
          chapterName: compiled.chapterName?.trim() || lesson.chapterName,
          topicName: compiled.topicName?.trim() ?? lesson.topicName,
          contentConfirmed: false,
          status: LessonStatus.READY_FOR_REVIEW,
        },
      });
      await tx.lessonConcept.deleteMany({ where: { lessonId: id } });
      if (concepts.length) {
        await tx.lessonConcept.createMany({
          data: concepts.map((name) => ({ lessonId: id, name })),
        });
      }
    });

    const presented = await this.loadPresented(id);
    return {
      ...presented,
      compile: {
        lessonBody,
        exercises,
        fullText: coerceLessonDisplayText(fullText),
        chapterName: compiled.chapterName,
        topicName: compiled.topicName,
        concepts,
      },
    };
  }

  async extractFromPhotos(dto: ExtractLessonDto, files: Express.Multer.File[], user: AuthUser) {
    if (!files?.length) {
      throw new BadRequestException({
        code: 'PHOTOS_REQUIRED',
        message: 'Upload at least one photo of the pages taught today',
      });
    }
    if (!dto?.academicYearId || !dto.gradeId || !dto.sectionId || !dto.subjectId || !dto.branchId || !dto.date) {
      throw new BadRequestException({
        code: 'CLASS_REQUIRED',
        message: 'Select a class and date before extracting the lesson',
      });
    }

    const lessonDate = new Date(dto.date);
    if (Number.isNaN(lessonDate.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'Lesson date is invalid',
      });
    }

    try {
      return await this.saveExtractedLesson(dto, files, user, lessonDate);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(
        `Lesson extract failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException({
        code: 'LESSON_EXTRACT_FAILED',
        message: error instanceof Error ? error.message : 'Could not extract lesson from photos',
      });
    }
  }

  private async saveExtractedLesson(
    dto: ExtractLessonDto,
    files: Express.Multer.File[],
    user: AuthUser,
    lessonDate: Date,
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    await this.assertTeacherAssignment({
      schoolId,
      userId: user.id,
      teacherId: teacher.id,
      sectionId: dto.sectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
    });

    const [subject, grade] = await Promise.all([
      this.prisma.subject.findUnique({ where: { id: dto.subjectId } }),
      this.prisma.grade.findUnique({ where: { id: dto.gradeId } }),
    ]);
    if (!subject || !grade) {
      throw new BadRequestException({
        code: 'CLASS_NOT_FOUND',
        message: 'Subject or grade was not found',
      });
    }

    const pageFrom = this.parseOptionalInt(dto.pageFrom);
    const pageTo = this.parseOptionalInt(dto.pageTo);
    const teacherNotes = dto.teacherNotes?.trim() || undefined;
    const canVision = Boolean(
      readEnv('OPENAI_API_KEY') ||
        readEnv('CURSOR_API_KEY') ||
        this.config.get<string>('OPENAI_API_KEY')?.trim() ||
        this.config.get<string>('CURSOR_API_KEY')?.trim(),
    );
    const uploadedText = dto.pageText?.trim() ?? '';
    const expectsArabicScript = ocrLanguagesForSubject(subject.name) !== 'eng';
    const uploadedLooksUsable = isUsableLessonOcr(uploadedText, {
      expectArabicScript: expectsArabicScript,
    });
    const uploadedMangledRtl = isGarbledRtlOcr(uploadedText);
    const uploadedPoor = isPoorLessonOcr(uploadedText, { expectArabicScript: expectsArabicScript });
    // Skip local Tesseract when script/OCR quality is poor and vision can transcribe the photo.
    const preferVisionOcr = (expectsArabicScript || uploadedMangledRtl || uploadedPoor) && canVision;
    const ocrText = uploadedLooksUsable
      ? uploadedText
      : preferVisionOcr
        ? ''
        : await this.pageOcr.readPages(files, { subjectName: subject.name });
    // English OCR often mangles Urdu quotes. If vision is available, skip the slow
    // Urdu Tesseract retry and go straight to photo reading.
    let resolvedOcr = ocrText;
    if (
      expectsArabicScript &&
      !preferVisionOcr &&
      files.length &&
      (isPoorLessonOcr(resolvedOcr, { expectArabicScript: expectsArabicScript }) ||
        (/Qur['’]?an|Hadith|ترجمہ|سورۃ/i.test(resolvedOcr) &&
          countArabicScriptChars(resolvedOcr) < 20))
    ) {
      if (canVision) {
        this.logger.warn(`Skipping Urdu OCR retry — using vision for ${subject.name}`);
      } else {
        this.logger.warn(`Retrying OCR with Urdu/Arabic packs for ${subject.name}`);
        const urduPass = await this.pageOcr.readPages(files, { subjectName: 'Urdu' });
        if (isUsableLessonOcr(urduPass, { expectArabicScript: true }) && !isGarbledRtlOcr(urduPass)) {
          resolvedOcr = urduPass;
        } else {
          this.logger.warn('Urdu OCR still garbled — vision key required for Urdu quotes');
        }
      }
    }
    if (isServerlessRuntime() && isFakeExtractText(resolvedOcr) && !canVision) {
      throw new BadRequestException({
        code: 'PHOTO_VISION_REQUIRED',
        message:
          'Hosted photo extract needs an AI key (OPENAI_API_KEY or CURSOR_API_KEY) on the backend Vercel project.',
      });
    }
    const images = this.toLessonImages(files);
    const ocrGarbled = isPoorLessonOcr(resolvedOcr, { expectArabicScript: expectsArabicScript });
    const usableOcr = isUsableLessonOcr(resolvedOcr, {
      expectArabicScript: expectsArabicScript,
    });
    const ocrMissingScript =
      expectsArabicScript &&
      looksLikeRealLessonText(resolvedOcr) &&
      !ARABIC_SCRIPT_RE.test(resolvedOcr);
    const needsPhotoVision = expectsArabicScript || uploadedMangledRtl || ocrGarbled;
    // Colorful layouts: use vision when OCR is weak — not when Tesseract already read the page well.
    const usePhotoVision =
      canVision && files.length > 0 && (needsPhotoVision || !usableOcr);
    const ocrThin =
      isFakeExtractText(resolvedOcr) ||
      ocrMissingScript ||
      ocrGarbled ||
      (usePhotoVision && !usableOcr) ||
      (needsPhotoVision && canVision && !usableOcr);
    if (usePhotoVision || ocrGarbled || (needsPhotoVision && canVision && !uploadedLooksUsable)) {
      this.logger.warn(
        `Using vision transcription for ${subject.name} (photoUpload=${usePhotoVision}, poorOcr=${ocrGarbled}, arabicSubject=${expectsArabicScript})`,
      );
    }
    if (
      needsPhotoVision &&
      !canVision &&
      (ocrGarbled || ocrMissingScript || isFakeExtractText(resolvedOcr))
    ) {
      throw new BadRequestException({
        code: 'PHOTO_VISION_REQUIRED',
        message:
          'This page needs AI photo reading (English, Math, Urdu, or Arabic). Set CURSOR_API_KEY or OPENAI_API_KEY on the backend, then try again.',
      });
    }
    const local = this.structureFromPageText(
      usableOcr ? resolvedOcr : `${subject.name} lesson`,
      subject.name,
      pageFrom,
      pageTo,
      teacherNotes,
    );
    // English (or already-usable) OCR: trust the page text and skip a full AI polish round-trip.
    // Still run AI when vision is required (Urdu/Arabic/mixed) or OCR is thin/garbled.
    let polished;
    let usedEnglishFallback = false;
    const canTrustLocalOcr = usableOcr && !ocrThin && !needsPhotoVision;
    if (canTrustLocalOcr) {
      polished = {
        chapterName: local.chapterName,
        topicName: local.topicName,
        summary: resolvedOcr,
        concepts: local.concepts.length ? local.concepts : deriveKeyPointsFromLesson(resolvedOcr),
        teacherNotesSuggestion: local.teacherNotesSuggestion,
      };
    } else {
      const visionTranscribePrompt = `Transcribe the attached ${subject.name} textbook page photo(s) for ${grade.name}. Copy every heading, paragraph, number, and activity instruction accurately. Keep English as English. Keep every Urdu/Arabic line in original Unicode script (not Latin letters). Preserve Quran/Hadith quotations and citations.`;
      try {
        polished = await this.lessonProcessing.process({
          schoolId,
          userId: user.id,
          sourceText:
            usePhotoVision || !usableOcr ? visionTranscribePrompt : resolvedOcr,
          subjectName: subject.name,
          gradeName: grade.name,
          images: canVision && usePhotoVision ? images : undefined,
        });
      } catch (error) {
        const englishFallback = englishOnlyFromMixedOcr(resolvedOcr);
        if (compactTextLength(englishFallback) > 140) {
          this.logger.warn(
            `Vision failed (${error instanceof Error ? error.message : String(error)}); using English OCR fallback`,
          );
          usedEnglishFallback = true;
          polished = {
            chapterName: local.chapterName,
            topicName: local.topicName,
            summary: englishFallback,
            concepts: deriveKeyPointsFromLesson(englishFallback),
            teacherNotesSuggestion: undefined,
          };
        } else if (ocrThin) {
          throw error;
        } else {
          this.logger.warn(
            `Lesson AI polish failed, using page text: ${error instanceof Error ? error.message : String(error)}`,
          );
          polished = {
            chapterName: local.chapterName,
            topicName: local.topicName,
            summary: ocrGarbled || ocrMissingScript ? local.summary : resolvedOcr,
            concepts: local.concepts,
            teacherNotesSuggestion: local.teacherNotesSuggestion,
          };
        }
      }
    }
    // Vision sometimes "succeeds" with Latin junk for Urdu quotes — strip to English.
    if (
      !usedEnglishFallback &&
      (isGarbledRtlOcr(polished.summary) || looksLikeMangledRtlOcr(polished.summary))
    ) {
      const englishFallback = englishOnlyFromMixedOcr(
        longestRealLessonText(resolvedOcr, polished.summary),
      );
      if (compactTextLength(englishFallback) > 140) {
        usedEnglishFallback = true;
        polished = {
          ...polished,
          summary: englishFallback,
          concepts: deriveKeyPointsFromLesson(englishFallback),
          teacherNotesSuggestion: undefined,
        };
      }
    }
    if (
      !usedEnglishFallback &&
      usableOcr &&
      !isUsableLessonOcr(polished.summary, { expectArabicScript: expectsArabicScript })
    ) {
      polished = {
        ...polished,
        summary: resolvedOcr,
        concepts:
          polished.concepts.length > 0
            ? polished.concepts
            : local.concepts.length
              ? local.concepts
              : deriveKeyPointsFromLesson(resolvedOcr),
      };
    }
    if (!usedEnglishFallback) {
      const polishUsable = isUsableLessonOcr(polished.summary, {
        expectArabicScript: expectsArabicScript,
      });
      if (!polishUsable) {
        const salvaged = englishOnlyFromMixedOcr(
          longestRealLessonText(resolvedOcr, polished.summary),
        );
        if (compactTextLength(salvaged) > 140) {
          usedEnglishFallback = true;
          polished = {
            ...polished,
            summary: salvaged,
            concepts: deriveKeyPointsFromLesson(salvaged),
            teacherNotesSuggestion: undefined,
          };
        }
      }
    }
    const polishedLooksReal =
      usedEnglishFallback ||
      usableOcr ||
      isUsableLessonOcr(polished.summary, { expectArabicScript: expectsArabicScript }) ||
      (looksLikeRealLessonText(polished.summary) &&
        needsPhotoVision &&
        ARABIC_SCRIPT_RE.test(polished.summary) &&
        !isPoorLessonOcr(polished.summary, { expectArabicScript: expectsArabicScript })) ||
      (needsPhotoVision &&
        looksLikeRealLessonText(polished.summary) &&
        !isPoorLessonOcr(polished.summary, { expectArabicScript: expectsArabicScript }));
    const cannotReadPage =
      !usableOcr &&
      (ocrGarbled || ocrMissingScript || isFakeExtractText(resolvedOcr) || usePhotoVision);
    if (cannotReadPage && !polishedLooksReal) {
      throw new BadRequestException({
        code: 'PAGE_TEXT_UNREADABLE',
        message:
          'Could not read this page clearly. Try a sharper photo with the full page flat and well lit.',
      });
    }
    if (isFakeExtractText(polished.summary)) {
      throw new BadRequestException({
        code: 'PAGE_TEXT_UNREADABLE',
        message:
          'AI returned instructions instead of page text. Try again — photo reading can take up to a few minutes.',
      });
    }
    const summary = usedEnglishFallback
      ? polished.summary
      : longestRealLessonText(
          isUsableLessonOcr(resolvedOcr, { expectArabicScript: expectsArabicScript })
            ? resolvedOcr
            : undefined,
          isUsableLessonOcr(local.summary, { expectArabicScript: expectsArabicScript })
            ? local.summary
            : undefined,
          polishedLooksReal ? polished.summary : undefined,
        );
    const conceptsRaw =
      polishedLooksReal && polished.concepts.length
        ? polished.concepts
        : local.concepts.length
          ? local.concepts
          : deriveKeyPointsFromLesson(summary);
    const concepts = conceptsRaw.filter(
      (c) =>
        !looksLikeMangledRtlOcr(c) &&
        countLatinLetters(c) >= 20 &&
        !/[)(@£€«»#].*[)(@£€«»#]/.test(c),
    );
    const output = {
      ...local,
      chapterName: polishedLooksReal ? polished.chapterName || local.chapterName : local.chapterName,
      topicName: polishedLooksReal ? polished.topicName || local.topicName : local.topicName,
      summary,
      concepts: concepts.length
        ? concepts
        : deriveKeyPointsFromLesson(summary).filter((c) => countLatinLetters(c) >= 20),
      teacherNotesSuggestion: undefined,
    };
    const savedStyle = await this.gradeStyle.get(teacher.id, dto.gradeId);
    if (savedStyle?.keyPointStyle) {
      output.concepts = applyKeyPointStyle(output.concepts, savedStyle.keyPointStyle);
    }
    const extractedText = coerceLessonDisplayText(output.summary);
    const rawOcrArchive = (resolvedOcr ?? '').trim();
    const perPageTexts =
      !uploadedLooksUsable && !preferVisionOcr
        ? await this.pageOcr.readPageTexts(files, { subjectName: subject.name })
        : files.map(() => '');
    const pageAssets = await Promise.all(
      files.map((file) => this.filesService.saveSchoolUpload(schoolId, user.id, file, 'lesson-pages')),
    );
    const sourceCreates = [
      ...pageAssets.map((asset, index) => ({
        type: LessonSourceType.TEXTBOOK_IMAGE,
        fileAssetId: asset.id,
        pageFrom: index + 1,
        ocrText: perPageTexts[index]?.trim() || null,
      })),
      ...(rawOcrArchive || extractedText
        ? [
            {
              type: LessonSourceType.MANUAL_TEXT,
              ocrText: rawOcrArchive || extractedText,
              manualText: extractedText,
              pageFrom: output.pageFrom ?? pageFrom,
              pageTo: output.pageTo ?? pageTo,
            },
          ]
        : []),
    ];

    const recordKind = dto.recordKind ?? LessonRecordKind.CLASS_SESSION;
    const lesson = await this.prisma.dailyLesson.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherId: teacher.id,
        createdById: user.id,
        date: lessonDate,
        chapterName: output.chapterName,
        topicName: output.topicName,
        teacherNotes: teacherNotes,
        aiSummary: extractedText,
        pageFrom: output.pageFrom ?? pageFrom,
        pageTo: output.pageTo ?? pageTo,
        status: LessonStatus.READY_FOR_REVIEW,
        recordKind,
        contentConfirmed: false,
        chapterProgress:
          recordKind === LessonRecordKind.CHAPTER_LIBRARY ? ChapterProgressStatus.IN_PROGRESS : null,
        sources: sourceCreates.length ? { create: sourceCreates } : undefined,
        concepts: output.concepts.length
          ? { create: output.concepts.map((name) => ({ name })) }
          : undefined,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'LESSON_EXTRACTED_FROM_PHOTOS',
      entityType: 'DailyLesson',
      entityId: lesson.id,
    });

    this.cache.invalidatePrefix(`teacher:summary:${user.id}`);
    this.cache.invalidatePrefix(`teacher:coach:${user.id}`);

    return this.loadPresented(lesson.id);
  }

  async updateLesson(id: string, dto: UpdateLessonDto, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: { sources: true },
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);
    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({
        code: 'LESSON_OWNER_REQUIRED',
        message: 'Only the assigned lesson teacher can update this lesson',
      });
    }
    const libraryEdit =
      lesson.recordKind === LessonRecordKind.CHAPTER_LIBRARY &&
      (dto.extractedText !== undefined ||
        dto.chapterDraftText !== undefined ||
        dto.chapterName !== undefined ||
        dto.topicName !== undefined);
    if (lesson.status === LessonStatus.CONFIRMED && !libraryEdit) {
      throw new BadRequestException({
        code: 'LESSON_ALREADY_CONFIRMED',
        message: 'Confirmed lessons cannot be edited',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyLesson.update({
        where: { id },
        data: {
          chapterName: dto.chapterName,
          topicName: dto.topicName,
          teacherNotes: dto.teacherNotes,
          aiSummary: dto.aiSummary,
          pageFrom: dto.pageFrom,
          pageTo: dto.pageTo,
        },
      });

      if (dto.extractedText !== undefined) {
        const normalizedCompiled = coerceLessonDisplayText(dto.extractedText);
        await tx.dailyLesson.update({
          where: { id },
          data: { aiSummary: normalizedCompiled },
        });
      }

      if (dto.chapterDraftText !== undefined) {
        const refreshed = await tx.lessonSource.findMany({ where: { lessonId: id } });
        await this.upsertChapterManualText(
          tx,
          id,
          refreshed,
          coerceLessonDisplayText(dto.chapterDraftText),
        );
      }

      if (dto.concepts) {
        await tx.lessonConcept.deleteMany({ where: { lessonId: id } });
        const names = dto.concepts.map((name) => name.trim()).filter(Boolean);
        if (names.length) {
          await tx.lessonConcept.createMany({
            data: names.map((name) => ({ lessonId: id, name })),
          });
        }
      }
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: lesson.schoolId,
      branchId: lesson.branchId,
      action: 'LESSON_UPDATED',
      entityType: 'DailyLesson',
      entityId: id,
    });

    return this.loadPresented(id);
  }

  async regenerateKeyPoints(id: string, dto: RegenerateKeyPointsDto, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: { sources: true, concepts: true, subject: true, grade: true },
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);
    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({
        code: 'LESSON_OWNER_REQUIRED',
        message: 'Only the assigned lesson teacher can update this lesson',
      });
    }
    if (lesson.status === LessonStatus.CONFIRMED) {
      throw new BadRequestException({
        code: 'LESSON_ALREADY_CONFIRMED',
        message: 'Confirmed lessons cannot be edited',
      });
    }

    const extractedText = this.extractedTextFromSources(lesson.sources);
    const saved = await this.gradeStyle.get(teacher.id, lesson.gradeId);
    const instruction = dto.instruction?.trim() || saved?.keyPointStyle || undefined;
    if (dto.instruction?.trim()) {
      await this.gradeStyle.remember({
        teacherId: teacher.id,
        gradeId: lesson.gradeId,
        schoolId: lesson.schoolId,
        keyPointStyle: dto.instruction,
      });
    }

    const current = lesson.concepts.map((concept) => concept.name);
    const localConcepts = current.length
      ? current
      : this.structureFromPageText(extractedText, lesson.subject.name).concepts;
    let concepts = applyKeyPointStyle(localConcepts, instruction);

    // Skip a full lesson AI pass when local key points are already solid and the teacher
    // did not ask for a custom format — keeps regenerate snappy without inventing content.
    const needsAi =
      extractedText.trim().length > 20 &&
      (Boolean(instruction?.trim()) || localConcepts.length < 4);
    if (needsAi) {
      const clipped =
        extractedText.length > 3500 ? `${extractedText.slice(0, 3500)}\n…` : extractedText;
      const polished = await this.lessonProcessing.process({
        schoolId: lesson.schoolId,
        userId: user.id,
        sourceText: [
          'Write key points only. Do not write a lesson summary.',
          instruction
            ? `Teacher instruction: ${instruction}. Follow that format exactly (for example bullet points if they asked for bullets).`
            : '',
          '',
          clipped,
        ]
          .filter((line) => line !== '')
          .join('\n'),
        subjectName: lesson.subject.name,
        gradeName: lesson.grade.name,
      });
      const looksReal =
        polished.concepts.length > 0 &&
        !polished.concepts.some((name) => /main idea from the photographed pages/i.test(name));
      if (looksReal) {
        concepts = applyKeyPointStyle(polished.concepts, instruction);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lessonConcept.deleteMany({ where: { lessonId: id } });
      if (concepts.length) {
        await tx.lessonConcept.createMany({
          data: concepts.map((name) => ({ lessonId: id, name })),
        });
      }
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: lesson.schoolId,
      branchId: lesson.branchId,
      action: 'LESSON_KEY_POINTS_REGENERATED',
      entityType: 'DailyLesson',
      entityId: id,
    });

    return this.loadPresented(id);
  }

  async createManual(dto: CreateLessonDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    await this.assertTeacherAssignment({
      schoolId,
      userId: user.id,
      teacherId: teacher.id,
      sectionId: dto.sectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
    });

    const lesson = await this.prisma.dailyLesson.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherId: teacher.id,
        createdById: user.id,
        date: new Date(dto.date),
        chapterName: dto.chapterName,
        topicName: dto.topicName,
        teacherNotes: dto.teacherNotes,
        pageFrom: dto.pageFrom,
        pageTo: dto.pageTo,
        status: LessonStatus.DRAFT,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'LESSON_CREATED',
      entityType: 'DailyLesson',
      entityId: lesson.id,
    });

    return lesson;
  }

  async scan(dto: ScanLessonDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    await this.assertTeacherAssignment({
      schoolId,
      userId: user.id,
      teacherId: teacher.id,
      sectionId: dto.sectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
    });

    if (!dto.manualText && !dto.fileAssetId) {
      throw new BadRequestException({
        code: 'SOURCE_REQUIRED',
        message: 'Provide manualText or fileAssetId for scan',
      });
    }

    const lesson = await this.prisma.dailyLesson.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherId: teacher.id,
        createdById: user.id,
        date: new Date(dto.date),
        pageFrom: dto.pageFrom,
        pageTo: dto.pageTo,
        status: LessonStatus.PROCESSING,
        sources: {
          create: {
            type: dto.sourceType,
            manualText: dto.manualText,
            fileAssetId: dto.fileAssetId,
            pageFrom: dto.pageFrom,
            pageTo: dto.pageTo,
          },
        },
      },
      include: { sources: true },
    });

    await this.prisma.aIJob.create({
      data: {
        lessonId: lesson.id,
        queueName: 'lesson-processing',
        status: AIRequestStatus.PENDING,
        payload: { lessonId: lesson.id },
      },
    });

    // Always process inline for now (no dedicated worker). Safe when Redis/queues are disabled on Vercel.
    void this.processLessonAsync(lesson.id).catch((err: unknown) => {
      this.logger.error(
        `Lesson async processing failed for ${lesson.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'LESSON_SCAN_STARTED',
      entityType: 'DailyLesson',
      entityId: lesson.id,
    });

    return lesson;
  }

  async processLessonAsync(lessonId: string) {
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id: lessonId },
      include: {
        sources: true,
        subject: true,
        grade: true,
      },
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }

    const sourceText =
      lesson.sources.map((s) => s.manualText || s.ocrText || '').filter(Boolean).join('\n') ||
      'No source text provided';

    try {
      const output = await this.lessonProcessing.process({
        schoolId: lesson.schoolId,
        userId: lesson.createdById,
        sourceText,
        subjectName: lesson.subject.name,
        gradeName: lesson.grade.name,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.dailyLesson.update({
          where: { id: lessonId },
          data: {
            chapterName: output.chapterName ?? lesson.chapterName,
            topicName: output.topicName ?? lesson.topicName,
            aiSummary: coerceLessonDisplayText(output.summary),
            pageFrom: output.pageFrom ?? lesson.pageFrom,
            pageTo: output.pageTo ?? lesson.pageTo,
            teacherNotes: lesson.teacherNotes,
            status: LessonStatus.READY_FOR_REVIEW,
          },
        });

        if (output.concepts.length) {
          await tx.lessonConcept.createMany({
            data: output.concepts.map((name) => ({ lessonId, name })),
          });
        }

        await tx.aIJob.updateMany({
          where: { lessonId, status: AIRequestStatus.PENDING },
          data: {
            status: AIRequestStatus.COMPLETED,
            result: output as unknown as Prisma.InputJsonValue,
          },
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Processing failed';
      await this.prisma.dailyLesson.update({
        where: { id: lessonId },
        data: { status: LessonStatus.DRAFT },
      });
      await this.prisma.aIJob.updateMany({
        where: { lessonId, status: AIRequestStatus.PENDING },
        data: { status: AIRequestStatus.FAILED, error: message },
      });
      throw error;
    }

    return this.loadPresented(lessonId);
  }

  async confirm(id: string, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({ where: { id } });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);

    await this.assertTeacherAssignment({
      schoolId: lesson.schoolId,
      userId: user.id,
      teacherId: teacher.id,
      sectionId: lesson.sectionId,
      subjectId: lesson.subjectId,
      academicYearId: lesson.academicYearId,
    });

    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({
        code: 'LESSON_OWNER_REQUIRED',
        message: 'Only the assigned lesson teacher can confirm',
      });
    }

    if (
      lesson.status !== LessonStatus.DRAFT &&
      lesson.status !== LessonStatus.READY_FOR_REVIEW
    ) {
      throw new BadRequestException({
        code: 'INVALID_LESSON_STATUS',
        message: 'Lesson cannot be confirmed in current status',
      });
    }

    await this.prisma.dailyLesson.update({
      where: { id },
      data: {
        status: LessonStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: lesson.schoolId,
      branchId: lesson.branchId,
      action: 'LESSON_CONFIRMED',
      entityType: 'DailyLesson',
      entityId: id,
    });

    return this.loadPresented(id);
  }

  async removeDraft(id: string, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({ where: { id } });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);

    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({
        code: 'LESSON_OWNER_REQUIRED',
        message: 'Only the assigned lesson teacher can delete this lesson',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.homework.updateMany({ where: { lessonId: id }, data: { lessonId: null } });
      await tx.aIJob.updateMany({ where: { lessonId: id }, data: { lessonId: null } });
      await tx.dailyLesson.delete({ where: { id } });
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId: lesson.schoolId,
      branchId: lesson.branchId,
      action: 'LESSON_DELETED',
      entityType: 'DailyLesson',
      entityId: id,
    });

    this.cache.invalidatePrefix(`teacher:summary:${user.id}`);
    this.cache.invalidatePrefix(`teacher:coach:${user.id}`);

    return { id, deleted: true };
  }

  async findAll(user: AuthUser, query: PaginationDto & LessonQueryDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (this.tenant.isParent(user) && !this.tenant.isSchoolAdmin(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent lesson list',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
      const enrollment = await this.parentsService.getActiveEnrollment(user.id, query.studentId);
      if (!enrollment) {
        return paginate([], 0, page, limit);
      }
      const where: Prisma.DailyLessonWhereInput = {
        schoolId,
        sectionId: enrollment.sectionId,
        status: LessonStatus.CONFIRMED,
        recordKind: LessonRecordKind.CLASS_SESSION,
        ...(query.date ? { date: new Date(query.date) } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      };
      const [items, total] = await pageQuery(
        (skip, take) =>
          this.prisma.dailyLesson.findMany({
            where,
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            skip,
            take,
            select: {
              id: true,
              date: true,
              status: true,
              topicName: true,
              chapterName: true,
              sectionId: true,
              subjectId: true,
              gradeId: true,
              teacherId: true,
              subject: { select: { id: true, name: true } },
              section: {
                select: { id: true, name: true, grade: { select: { id: true, name: true } } },
              },
              grade: { select: { id: true, name: true } },
              teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
            },
          }),
        () => this.prisma.dailyLesson.count({ where }),
        page,
        limit,
      );
      return paginate(items, total, page, limit);
    }

    let teacherFilter: Prisma.DailyLessonWhereInput = {};
    if (this.tenant.isTeacher(user) && !this.tenant.isSchoolAdmin(user)) {
      const teacher = await this.requireTeacherProfile(user.id);
      const headSectionIds = await resolveHeadTeacherSectionIds(
        this.prisma,
        schoolId,
        user.id,
      );
      const headsThisClass =
        query.sectionId && headSectionIds.includes(query.sectionId);
      if (headsThisClass && query.subjectId) {
        // Head teacher may build exam papers from any completed lectures in the class/subject.
        teacherFilter = {};
      } else {
        teacherFilter = { teacherId: teacher.id };
      }
    }

    let examLectureScope: Prisma.DailyLessonWhereInput | undefined;
    let examStatusScope: Prisma.DailyLessonWhereInput | undefined;
    if (query.forExamLectures && query.sectionId && query.subjectId) {
      const scope = {
        schoolId,
        sectionId: query.sectionId,
        subjectId: query.subjectId,
        ...teacherFilter,
      };
      const chapterIdsWithSessions = await chapterSourceIdsWithClassSessions(this.prisma, scope);
      examLectureScope = examLectureRecordWhere(chapterIdsWithSessions);
      examStatusScope = examLectureTeachableStatusWhere();
    }

    const where: Prisma.DailyLessonWhereInput = {
      schoolId,
      ...teacherFilter,
      ...(examStatusScope ?? (query.status ? { status: query.status } : {})),
      ...(examLectureScope
        ? examLectureScope
        : query.recordKind
          ? { recordKind: query.recordKind }
          : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.date ? { date: new Date(query.date) } : {}),
    };

    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.dailyLesson.findMany({
          where,
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          skip,
          take,
          select: {
            id: true,
            date: true,
            status: true,
            recordKind: true,
            sessionType: true,
            contentConfirmed: true,
            chapterProgress: true,
            chapterSourceId: true,
            parentSummary: true,
            topicName: true,
            chapterName: true,
            sectionId: true,
            subjectId: true,
            gradeId: true,
            teacherId: true,
            subject: { select: { id: true, name: true } },
            section: {
              select: { id: true, name: true, grade: { select: { id: true, name: true } } },
            },
            grade: { select: { id: true, name: true } },
            teacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
          },
        }),
      () => this.prisma.dailyLesson.count({ where }),
      page,
      limit,
    );

    return paginate(items, total, page, limit);
  }

  async listChapters(
    user: AuthUser,
    query: { sectionId?: string; subjectId?: string; limit?: number },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    const limit = Math.min(query.limit ?? 50, 100);
    const items = await this.prisma.dailyLesson.findMany({
      where: {
        schoolId,
        teacherId: teacher.id,
        recordKind: LessonRecordKind.CHAPTER_LIBRARY,
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: limit,
      include: {
        subject: { select: { id: true, name: true } },
        section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
        grade: { select: { id: true, name: true } },
        sources: { select: { ocrText: true, manualText: true } },
      },
    });
    return items.map((row) => this.presentLesson(row));
  }

  async createChapterDraft(dto: CreateChapterDraftDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    await this.assertTeacherAssignment({
      schoolId,
      userId: user.id,
      teacherId: teacher.id,
      sectionId: dto.sectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
    });
    const chapterName = dto.chapterName?.trim() || 'New chapter';
    const lesson = await this.prisma.dailyLesson.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherId: teacher.id,
        createdById: user.id,
        date: new Date(),
        chapterName,
        topicName: dto.topicName?.trim(),
        aiSummary: '',
        status: LessonStatus.READY_FOR_REVIEW,
        recordKind: LessonRecordKind.CHAPTER_LIBRARY,
        contentConfirmed: false,
        chapterProgress: ChapterProgressStatus.IN_PROGRESS,
      },
    });
    return this.loadPresented(lesson.id);
  }

  async createChapterFromPaste(dto: CreateChapterPasteDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    await this.assertTeacherAssignment({
      schoolId,
      userId: user.id,
      teacherId: teacher.id,
      sectionId: dto.sectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
    });
    const text = coerceLessonDisplayText(dto.contentText.trim());
    if (!text) {
      throw new BadRequestException({
        code: 'CONTENT_REQUIRED',
        message: 'Paste the chapter text before saving',
      });
    }
    const lesson = await this.prisma.dailyLesson.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherId: teacher.id,
        createdById: user.id,
        date: new Date(),
        chapterName: dto.chapterName.trim(),
        topicName: dto.topicName?.trim(),
        aiSummary: text,
        status: LessonStatus.READY_FOR_REVIEW,
        recordKind: LessonRecordKind.CHAPTER_LIBRARY,
        contentConfirmed: false,
        chapterProgress: ChapterProgressStatus.IN_PROGRESS,
        sources: {
          create: {
            type: LessonSourceType.MANUAL_TEXT,
            manualText: text,
            ocrText: text,
          },
        },
      },
    });
    return this.loadPresented(lesson.id);
  }

  async confirmChapterContent(id: string, dto: ConfirmChapterContentDto, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: { sources: true },
    });
    if (!lesson || lesson.recordKind !== LessonRecordKind.CHAPTER_LIBRARY) {
      throw new NotFoundException({ code: 'CHAPTER_NOT_FOUND', message: 'Chapter not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);
    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({ code: 'LESSON_OWNER_REQUIRED', message: 'Not your chapter' });
    }
    const contentText =
      dto.contentText !== undefined ? coerceLessonDisplayText(dto.contentText) : undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.dailyLesson.update({
        where: { id },
        data: {
          chapterName: dto.chapterName?.trim() || lesson.chapterName,
          topicName: dto.topicName?.trim() ?? lesson.topicName,
          aiSummary: contentText ?? lesson.aiSummary,
          contentConfirmed: true,
          status: LessonStatus.CONFIRMED,
          chapterProgress: ChapterProgressStatus.COMPLETED,
          confirmedAt: new Date(),
        },
      });
      if (contentText !== undefined) {
        const source = lesson.sources[0];
        if (source) {
          await tx.lessonSource.update({
            where: { id: source.id },
            data: { ocrText: contentText, manualText: contentText },
          });
        }
      }
    });
    return this.loadPresented(id);
  }

  async markChapterCompleted(id: string, user: AuthUser) {
    const teacher = await this.requireTeacherProfile(user.id);
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: { sources: true },
    });
    if (!lesson || lesson.recordKind !== LessonRecordKind.CHAPTER_LIBRARY) {
      throw new NotFoundException({ code: 'CHAPTER_NOT_FOUND', message: 'Chapter not found' });
    }
    if (lesson.teacherId !== teacher.id) {
      throw new ForbiddenException({ code: 'LESSON_OWNER_REQUIRED', message: 'Not your chapter' });
    }
    const body =
      coerceLessonDisplayText(lesson.aiSummary ?? '') ||
      this.assemblePageTexts(lesson.sources);
    const hasTeachableContent = body.trim().length >= 48;
    await this.prisma.dailyLesson.update({
      where: { id },
      data: {
        chapterProgress: ChapterProgressStatus.COMPLETED,
        ...(hasTeachableContent
          ? {
              contentConfirmed: true,
              status: LessonStatus.CONFIRMED,
              confirmedAt: lesson.confirmedAt ?? new Date(),
            }
          : {}),
      },
    });
    return this.loadPresented(id);
  }

  async createClassSession(dto: CreateClassSessionDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.requireTeacherProfile(user.id);
    await this.assertTeacherAssignment({
      schoolId,
      userId: user.id,
      teacherId: teacher.id,
      sectionId: dto.sectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
    });

    const sessionDate = new Date(dto.date);
    if (Number.isNaN(sessionDate.getTime())) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'Invalid class date' });
    }

    let chapterSource: { id: string; chapterName: string | null; topicName: string | null } | null =
      null;
    if (dto.sessionType === ClassSessionType.REVISION) {
      const ids = (dto.revisionChapterIds ?? []).filter(Boolean);
      if (!ids.length) {
        throw new BadRequestException({
          code: 'REVISION_CHAPTERS_REQUIRED',
          message: 'Select at least one chapter for revision',
        });
      }
      const chapters = await this.prisma.dailyLesson.findMany({
        where: {
          id: { in: ids },
          schoolId,
          teacherId: teacher.id,
          recordKind: LessonRecordKind.CHAPTER_LIBRARY,
          contentConfirmed: true,
        },
      });
      if (chapters.length !== ids.length) {
        throw new BadRequestException({
          code: 'INVALID_REVISION_CHAPTERS',
          message: 'One or more chapters are missing or not confirmed',
        });
      }
    } else {
      if (!dto.chapterSourceId) {
        throw new BadRequestException({
          code: 'CHAPTER_REQUIRED',
          message: 'Select the chapter for this class',
        });
      }
      chapterSource = await this.prisma.dailyLesson.findFirst({
        where: {
          id: dto.chapterSourceId,
          schoolId,
          teacherId: teacher.id,
          recordKind: LessonRecordKind.CHAPTER_LIBRARY,
          contentConfirmed: true,
        },
        select: { id: true, chapterName: true, topicName: true },
      });
      if (!chapterSource) {
        throw new BadRequestException({
          code: 'CHAPTER_NOT_READY',
          message: 'Chapter content must be confirmed before logging class',
        });
      }
    }

    const parentSummary =
      dto.parentSummary?.trim() ||
      (dto.sessionType === ClassSessionType.REVISION
        ? `Revision — ${(dto.revisionChapterIds ?? []).length} chapter(s)`
        : dto.sessionType === ClassSessionType.CONTINUATION
          ? `Continued ${chapterSource?.chapterName ?? 'chapter'}`
          : `New lesson — ${chapterSource?.chapterName ?? 'chapter'}`);

    const session = await this.prisma.dailyLesson.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        teacherId: teacher.id,
        createdById: user.id,
        date: sessionDate,
        chapterName: chapterSource?.chapterName,
        topicName: chapterSource?.topicName,
        recordKind: LessonRecordKind.CLASS_SESSION,
        sessionType: dto.sessionType,
        chapterSourceId: chapterSource?.id,
        revisionChapterIds:
          dto.sessionType === ClassSessionType.REVISION
            ? (dto.revisionChapterIds as Prisma.InputJsonValue)
            : undefined,
        parentSummary,
        teacherNotes: parentSummary,
        aiSummary: parentSummary,
        status: LessonStatus.CONFIRMED,
        confirmedAt: new Date(),
        contentConfirmed: true,
      },
    });

    if (dto.homeworkMode === HomeworkSessionMode.PLAIN) {
      const text = dto.homeworkText?.trim();
      if (!text) {
        throw new BadRequestException({
          code: 'HOMEWORK_TEXT_REQUIRED',
          message: 'Write homework instructions or choose no homework',
        });
      }
      const due =
        dto.homeworkDueDate ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const title = chapterSource?.chapterName ?? chapterSource?.topicName ?? 'Homework';
      await this.homeworkService.create(
        {
          academicYearId: dto.academicYearId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          branchId: dto.branchId,
          title,
          description: text,
          dueDate: due,
          lessonId: session.id,
        },
        user,
      );
    } else if (dto.homeworkMode === HomeworkSessionMode.AI) {
      if (!chapterSource?.id) {
        throw new BadRequestException({
          code: 'CHAPTER_REQUIRED_FOR_AI_HW',
          message: 'AI homework needs a chapter source',
        });
      }
      const due =
        dto.homeworkDueDate ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const title = dto.homeworkTitle?.trim();
      const description = dto.homeworkDescription?.trim();
      if (title && description) {
        await this.homeworkService.create(
          {
            academicYearId: dto.academicYearId,
            sectionId: dto.sectionId,
            subjectId: dto.subjectId,
            branchId: dto.branchId,
            title,
            description,
            answerKey: dto.homeworkAnswerKey?.trim() || undefined,
            questionsJson: dto.homeworkQuestionsJson as unknown[] | undefined,
            dueDate: due,
            lessonId: session.id,
          },
          user,
        );
      } else {
        const preview = await this.documentsService.previewHomework(
          {
            lessonId: chapterSource.id,
            dueDate: dto.homeworkDueDate,
            instruction: dto.homeworkInstruction,
          },
          user,
        );
        await this.homeworkService.create(
          {
            academicYearId: preview.academicYearId,
            sectionId: preview.sectionId,
            subjectId: preview.subjectId,
            branchId: preview.branchId,
            title: preview.title,
            description: preview.description,
            answerKey: preview.answerKey,
            questionsJson: preview.questionsJson,
            dueDate: preview.dueDate,
            lessonId: session.id,
          },
          user,
        );
      }
    }

    this.cache.invalidatePrefix(`teacher:summary:${user.id}`);
    return this.loadPresented(session.id);
  }

  async getSubjectPace(
    user: AuthUser,
    query: { sectionId: string; subjectId: string; teacherId?: string; academicYearId?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    let periodLabel = 'All logged class days';
    let dateRange: Prisma.DateTimeFilter | undefined;
    if (query.academicYearId) {
      const year = await this.prisma.academicYear.findFirst({
        where: { id: query.academicYearId, schoolId },
        select: { name: true, startDate: true, endDate: true },
      });
      if (year) {
        periodLabel = year.name;
        dateRange = { gte: year.startDate, lte: year.endDate };
      }
    }

    let teacherId = query.teacherId;
    if (this.tenant.isTeacher(user) && !this.tenant.isSchoolAdmin(user)) {
      const teacher = await this.requireTeacherProfile(user.id);
      if (teacherId && teacherId !== teacher.id) {
        const headIds = await resolveHeadTeacherSectionIds(this.prisma, schoolId, user.id);
        if (!headIds.includes(query.sectionId)) {
          throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Cannot view other teachers' });
        }
      } else {
        teacherId = teacher.id;
      }
    }

    const sessions = await this.prisma.dailyLesson.findMany({
      where: {
        schoolId,
        sectionId: query.sectionId,
        subjectId: query.subjectId,
        recordKind: LessonRecordKind.CLASS_SESSION,
        status: LessonStatus.CONFIRMED,
        ...(dateRange ? { date: dateRange } : {}),
        ...(teacherId ? { teacherId } : {}),
      },
      select: {
        sessionType: true,
        revisionChapterIds: true,
        chapterSource: { select: { id: true, chapterName: true, topicName: true } },
      },
    });

    const revisionIds = new Set<string>();
    for (const row of sessions) {
      if (row.sessionType === ClassSessionType.REVISION && Array.isArray(row.revisionChapterIds)) {
        for (const id of row.revisionChapterIds as string[]) {
          if (id) revisionIds.add(id);
        }
      }
    }
    const revisionChapters = revisionIds.size
      ? await this.prisma.dailyLesson.findMany({
          where: { id: { in: [...revisionIds] }, schoolId },
          select: { id: true, chapterName: true, topicName: true },
        })
      : [];
    const chapterLabelById = new Map(
      revisionChapters.map((ch) => [
        ch.id,
        ch.chapterName || ch.topicName || 'Chapter',
      ]),
    );

    type Slice = { label: string; days: number; chapterIds: string[] };
    const buckets = new Map<string, Slice>();
    const bump = (label: string, amount: number, chapterId?: string) => {
      const key = chapterId ?? label.toLowerCase();
      const existing = buckets.get(key) ?? { label, days: 0, chapterIds: [] };
      existing.days += amount;
      if (chapterId && !existing.chapterIds.includes(chapterId)) {
        existing.chapterIds.push(chapterId);
      }
      buckets.set(key, existing);
    };

    let sessionCount = 0;
    for (const row of sessions) {
      sessionCount += 1;
      if (row.sessionType === ClassSessionType.REVISION) {
        const ids = Array.isArray(row.revisionChapterIds)
          ? (row.revisionChapterIds as string[]).filter(Boolean)
          : [];
        if (!ids.length) continue;
        const share = 1 / ids.length;
        for (const id of ids) {
          const label = chapterLabelById.get(id) ?? 'Chapter';
          bump(label, share, id);
        }
      } else {
        const label =
          row.chapterSource?.chapterName ||
          row.chapterSource?.topicName ||
          'Unlabeled chapter';
        bump(label, 1, row.chapterSource?.id);
      }
    }

    const sliceRows = Array.from(buckets.values())
      .map((s) => ({ ...s, days: Math.round(s.days * 10) / 10 }))
      .sort((a, b) => b.days - a.days);

    const metaIds = [
      ...new Set(sliceRows.flatMap((s) => s.chapterIds).filter((id): id is string => Boolean(id))),
    ];
    const metaRows = metaIds.length
      ? await this.prisma.dailyLesson.findMany({
          where: { id: { in: metaIds }, schoolId },
          select: {
            id: true,
            chapterName: true,
            topicName: true,
            chapterProgress: true,
            aiSummary: true,
            pageFrom: true,
            pageTo: true,
            date: true,
            sources: { select: { ocrText: true, manualText: true } },
          },
        })
      : [];
    const metaById = new Map(
      metaRows.map((row) => {
        const text =
          row.sources
            .map((s) => s.ocrText?.trim() || s.manualText?.trim() || '')
            .filter(Boolean)
            .join('\n\n') ||
          row.aiSummary?.trim() ||
          '';
        const preview = coerceLessonDisplayText(text).replace(/\s+/g, ' ').trim();
        return [
          row.id,
          {
            chapterName: row.chapterName,
            topicName: row.topicName,
            chapterProgress: row.chapterProgress,
            pageFrom: row.pageFrom,
            pageTo: row.pageTo,
            addedDate: row.date.toISOString().slice(0, 10),
            contentPreview:
              preview.length > 220 ? `${preview.slice(0, 217).trim()}…` : preview || null,
          },
        ];
      }),
    );

    const slices = sliceRows.map((s) => {
      const chapterId = s.chapterIds[0] ?? null;
      const meta = chapterId ? metaById.get(chapterId) : undefined;
      return {
        ...s,
        chapterId,
        topicName: meta?.topicName ?? null,
        chapterName: meta?.chapterName ?? s.label,
        chapterProgress: meta?.chapterProgress ?? null,
        contentPreview: meta?.contentPreview ?? null,
        pageFrom: meta?.pageFrom ?? null,
        pageTo: meta?.pageTo ?? null,
        addedDate: meta?.addedDate ?? null,
      };
    });

    const totalDays = Math.round(sessionCount * 10) / 10;
    return { periodLabel, totalDays, slices };
  }

  async findOne(id: string, user: AuthUser) {
    const lesson = await this.prisma.dailyLesson.findUnique({
      where: { id },
      include: {
        sources: { include: { fileAsset: { select: { url: true, originalFilename: true } } } },
        concepts: true,
        subject: true,
        section: true,
        grade: true,
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    const owned = this.tenant.assertOwnedOrThrow(user, lesson, 'LESSON_NOT_FOUND');
    if (this.tenant.isParent(user) && !this.tenant.isSchoolAdmin(user)) {
      const enrollment = await this.prisma.studentEnrollment.findFirst({
        where: {
          status: 'ACTIVE',
          sectionId: owned.sectionId,
          student: { parents: { some: { parent: { userId: user.id } } } },
        },
      });
      if (!enrollment || owned.status !== LessonStatus.CONFIRMED) {
        throw new ForbiddenException({
          code: 'CHILD_ACCESS_DENIED',
          message: 'Parent does not have access to this lesson',
        });
      }
    }
    return this.presentLessonWithStyle(owned);
  }
}
