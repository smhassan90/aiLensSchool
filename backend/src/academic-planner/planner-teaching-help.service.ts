import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PlannerAccessService } from './planner-access.service';
import { PlannerContentService } from './planner-content.service';
import { TeachingHelpService } from '../ai/services/teaching-help.service';
import { PlannerChapterAnalysis } from '../ai/schemas/planner-chapter-analysis.schema';
import { TeachingAssistanceMode } from '../ai/schemas/teaching-help.schema';
import { StageSegment } from './planner-types';
import { gradeClassLabel } from '../common/utils/section-class-label';
import { resolveTeachingHelpContext } from './teaching-help-context';
import { TeachingHelpUsageService } from './teaching-help-usage';
import { TeachingHelpGenerationError } from '../ai/teaching-help-errors';
import { loadTeachingPacksByChapterIds } from '../library-books/chapter-teaching-pack-analysis.loader';
import { fixLibraryTextEncoding } from '../library-books/fix-library-text-encoding';

const ADMIN_CONTENT_MESSAGE =
  'The source lesson content is not available yet. Please ask your school administrator to check the assigned textbook content.';

@Injectable()
export class PlannerTeachingHelpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly access: PlannerAccessService,
    private readonly content: PlannerContentService,
    private readonly helpEngine: TeachingHelpService,
    private readonly usage: TeachingHelpUsageService,
  ) {}

  async teachingHelp(
    user: AuthUser,
    plannerId: string,
    lessonKey: string,
    versionId?: string,
    modeInput?: TeachingAssistanceMode,
    teacherQuestion?: string,
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const mode: TeachingAssistanceMode = modeInput ?? 'PREPARE_LESSON';
    const question = teacherQuestion?.trim().slice(0, 500) || undefined;

    const planner = await this.prisma.academicPlanner.findFirst({
      where: { id: plannerId, schoolId },
      include: {
        subject: { select: { name: true } },
        section: { include: { grade: true } },
        libraryBook: { select: { id: true, title: true } },
      },
    });
    if (!planner) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });
    }

    await this.assertTeachingHelpAccess(user, planner);
    this.usage.assertWithinRateLimit(user.id, schoolId);

    const vid = versionId ?? planner.approvedVersionId;
    if (!vid) {
      throw new UnprocessableEntityException({ code: 'NO_APPROVED_VERSION', message: 'No approved version' });
    }

    const lesson = await this.prisma.plannerLesson.findFirst({
      where: { versionId: vid, lessonKey },
      include: {
        chapter: {
          select: {
            id: true,
            chapterKey: true,
            titleSnapshot: true,
            contentHash: true,
            libraryBookChapterId: true,
            analysis: true,
          },
        },
      },
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }

    const objectives = Array.isArray(lesson.objectives) ? (lesson.objectives as string[]) : [];
    const portionKeys = Array.isArray(lesson.portionKeys) ? (lesson.portionKeys as string[]) : [];
    const stages = Array.isArray(lesson.stages) ? (lesson.stages as StageSegment[]) : [];
    const stagesSummary = stages
      .map((s) => `${s.stage}${s.minutes ? ` (${s.minutes}m)` : ''}${s.portionKey ? ` [${s.portionKey}]` : ''}`)
      .join('; ');

    const analysis = lesson.chapter?.analysis as PlannerChapterAnalysis | null;
    let chapterText: string | null = null;
    let packSummary: string | null = null;
    if (lesson.chapter?.libraryBookChapterId) {
      try {
        const loaded = await this.content.loadChapterText(schoolId, lesson.chapter.libraryBookChapterId);
        chapterText = loaded.text;
      } catch {
        chapterText = null;
      }
      const packs = await loadTeachingPacksByChapterIds(this.prisma, [
        lesson.chapter.libraryBookChapterId,
      ]);
      const pack = packs.get(lesson.chapter.libraryBookChapterId);
      if (pack?.summary?.trim()) {
        packSummary = fixLibraryTextEncoding(pack.summary);
      }
    }

    const resolved = resolveTeachingHelpContext({
      lessonTitle: lesson.title,
      objectives,
      portionKeys,
      chapterTitle: lesson.chapter?.titleSnapshot ?? 'Chapter',
      contentHash: lesson.chapter?.contentHash ?? null,
      libraryBookChapterId: lesson.chapter?.libraryBookChapterId ?? null,
      analysis,
      chapterText,
      packSummary,
      bookTitle: planner.libraryBook?.title ?? null,
    });

    if (resolved.basis === 'UNAVAILABLE') {
      throw new UnprocessableEntityException({
        code: 'TEACHING_HELP_UNAVAILABLE',
        message: ADMIN_CONTENT_MESSAGE,
      });
    }

    const contentHash = TeachingHelpService.contentHash([
      lesson.chapter?.contentHash ?? 'no-hash',
      lessonKey,
      resolved.basis,
      resolved.chapterExcerpt.slice(0, 500),
      objectives.join('|'),
      mode,
      question ?? '',
    ]);

    const classLabel = gradeClassLabel(planner.section);
    const inflightKey = `${schoolId}:${vid}:${lessonKey}:${contentHash}:${mode}`;

    let generated;
    try {
      generated = await this.usage.dedupeInFlight(inflightKey, () =>
        this.helpEngine.generate({
          schoolId,
          userId: user.id,
          versionId: vid,
          lessonKey,
          contentHash,
          mode,
          lessonTitle: lesson.title,
          chapterTitle: resolved.contentSources.chapterTitle,
          classLabel,
          subjectName: planner.subject.name,
          bookTitle: planner.libraryBook?.title ?? null,
          objectives,
          stagesSummary,
          chapterExcerpt: resolved.chapterExcerpt,
          basis: resolved.basis,
          teacherQuestion: question,
        }),
      );
    } catch (err) {
      if (err instanceof TeachingHelpGenerationError) {
        const status =
          err.code === 'TEACHING_HELP_INVALID_OUTPUT'
            ? HttpStatus.UNPROCESSABLE_ENTITY
            : HttpStatus.SERVICE_UNAVAILABLE;
        throw new HttpException({ code: err.code, message: err.message }, status);
      }
      if (err instanceof HttpException) throw err;
      throw new ServiceUnavailableException({
        code: 'TEACHING_HELP_PROVIDER_ERROR',
        message: 'Teaching assistance is temporarily unavailable. Please try again shortly.',
      });
    }

    const disclaimer = generated.aiGenerated
      ? 'AI teaching suggestions only — not approved curriculum or official records. Verify against your textbook before class.'
      : 'Template suggestions (AI provider not configured or unavailable). Not grounded in retrieved chapter text.';

    const basisDisclaimer =
      resolved.basis === 'CHAPTER_TEXT'
        ? 'Grounded in assigned textbook excerpt and lesson objectives where noted in sourceAndConfidence.'
        : 'Based on lesson objectives only; chapter text was unavailable or too short.';

    return {
      lessonKey,
      title: lesson.title,
      chapterTitle: resolved.contentSources.chapterTitle,
      classLabel,
      subjectName: planner.subject.name,
      mode: generated.mode,
      basis: resolved.basis,
      contentSources: resolved.contentSources,
      contentExcerpt: resolved.basis === 'CHAPTER_TEXT' ? resolved.chapterExcerpt.slice(0, 1200) : null,
      contextMeta: {
        anchorsUsed: resolved.anchorsUsed,
        excerptCharCount: resolved.excerptCharCount,
        missingNotes: resolved.missingNotes,
      },
      assistance: generated.assistance,
      aiGenerated: generated.aiGenerated,
      cached: generated.cached,
      promptVersion: generated.promptVersion,
      provider: generated.provider ?? null,
      disclaimer: `${disclaimer} ${basisDisclaimer}`,
      unavailableMessage: null,
    };
  }

  private async assertTeachingHelpAccess(
    user: AuthUser,
    planner: { teacherId: string; createdById: string; sectionId: string },
  ) {
    const actor = await this.access.resolveActor(user);
    if (actor.isPrincipalOrAdmin) return;
    if (planner.createdById === actor.userId) return;
    if (actor.teacherProfileId != null && planner.teacherId === actor.teacherProfileId) return;

    if (actor.isHeadTeacher && actor.teacherProfileId) {
      const head = await this.prisma.headTeacherSection.findFirst({
        where: {
          sectionId: planner.sectionId,
          headTeacher: { teacherId: actor.teacherProfileId },
        },
      });
      if (head) return;
    }

    throw new NotFoundException({ code: 'PLANNER_FORBIDDEN', message: 'Access denied' });
  }
}
