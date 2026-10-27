import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  PlannerAnalysisSource,
  PlannerContentStatus,
  PlannerExamRisk,
  PlannerVersionOrigin,
  PlannerVersionStatus,
  Prisma,
  TeacherStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { LibraryBooksService } from '../library-books/library-books.service';
import { PlannerChapterAnalysisService } from '../ai/services/planner-chapter-analysis.service';
import { TimetableResolverService } from '../timetables/timetable-resolver.service';
import { teacherDisplayName } from '../common/utils/person-name';
import { gradeClassLabel, sectionClassLabel } from '../common/utils/section-class-label';
import { joinCompiledChapter } from '../ai/schemas/chapter-compile.schema';
import { AcademicPlannersService } from './academic-planners.service';
import { PlannerContentService } from './planner-content.service';
import { buildPlannerTeachingSlots } from './academic-planners-schedule.helper';
import { generateSchedule, ChapterForSegments } from './schedule-engine';
import { PlannerSettings } from './planner-types';
import { DEFAULT_SCHOOL_TIMEZONE } from '../teachers/teacher-checkin';

@Injectable()
export class AcademicPlannersWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly libraryBooks: LibraryBooksService,
    private readonly content: PlannerContentService,
    private readonly analysis: PlannerChapterAnalysisService,
    private readonly resolver: TimetableResolverService,
    private readonly planners: AcademicPlannersService,
  ) {}

  async list(
    user: AuthUser,
    query: { status?: string; sectionId?: string; subjectId?: string; teacherId?: string; scope?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const rows = await this.prisma.academicPlanner.findMany({
      where: {
        schoolId,
        ...(query.status ? { status: query.status as import('@prisma/client').PlannerStatus } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.teacherId ? { teacherId: query.teacherId } : {}),
      },
      include: {
        subject: { select: { name: true } },
        section: { select: { name: true, grade: { select: { name: true } } } },
        teacher: { select: { user: { select: { firstName: true, lastName: true } }, gender: true } },
        workingVersion: { select: { id: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      classLabel: gradeClassLabel(p.section),
      subjectName: p.subject.name,
      teacherName: teacherDisplayName(p.teacher.user.firstName, p.teacher.user.lastName, p.teacher.gender),
      examDate: p.examDate.toISOString().slice(0, 10),
      sectionId: p.sectionId,
      subjectId: p.subjectId,
      workingVersionId: p.workingVersionId,
      workingVersionStatus: p.workingVersion?.status ?? null,
    }));
  }

  async getOptions(user: AuthUser, sectionId: string, subjectId: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, schoolId },
      include: { grade: true },
    });
    if (!section) {
      throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Section not found' });
    }
    const subject = await this.prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
    if (!subject) {
      throw new NotFoundException({ code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' });
    }

    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });

    const classSubject = year
      ? await this.prisma.classSubject.findFirst({
          where: { sectionId, subjectId, academicYearId: year.id },
          include: {
            teacher: { select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } } },
            assistantTeacher: {
              select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } },
            },
          },
        })
      : null;

    const teachers = await this.prisma.teacherProfile.findMany({
      where: { schoolId, status: TeacherStatus.ACTIVE },
      select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } },
      take: 200,
    });

    const eligibleTeachers = teachers
      .filter((t) => classSubject?.teacherId === t.id || classSubject?.assistantTeacherId === t.id)
      .map((t) => ({
        id: t.id,
        name: teacherDisplayName(t.user.firstName, t.user.lastName, t.gender),
      }));
    if (classSubject?.teacher && !eligibleTeachers.some((e) => e.id === classSubject.teacher!.id)) {
      eligibleTeachers.unshift({
        id: classSubject.teacher.id,
        name: teacherDisplayName(
          classSubject.teacher.user.firstName,
          classSubject.teacher.user.lastName,
          classSubject.teacher.gender,
        ),
      });
    }

    const books = await this.libraryBooks.listGrantedBooksForSchool(schoolId);
    const classLabel = gradeClassLabel(section);
    const grantedBooks = books.map((book) => {
      const suggested =
        book.classLabel.toLowerCase().includes(classLabel.toLowerCase()) ||
        classLabel.toLowerCase().includes(book.classLabel.toLowerCase()) ||
        book.subjectLabel.toLowerCase().includes(subject.name.toLowerCase());
      return { ...book, suggested };
    });

    const examConfigs = year
      ? await this.prisma.examConfig.findMany({
          where: { schoolId, academicYearId: year.id },
          select: { id: true, name: true, startDate: true },
          orderBy: { sequence: 'asc' },
        })
      : [];

    let timetable: {
      source: string;
      periodsPerWeek: number | null;
      typicalMinutes: number | null;
    } | null = null;
    if (year) {
      const grid = await this.resolver.weeklyGridSlots(
        schoolId,
        sectionId,
        year.id,
        year.startDate.toISOString().slice(0, 10),
      );
      const subjectSlots = grid.slots.filter((s) => s.subjectId === subjectId);
      const minutes = subjectSlots
        .map((s) => {
          if (!s.startTime || !s.endTime) return 40;
          const [sh, sm] = s.startTime.split(':').map(Number);
          const [eh, em] = s.endTime.split(':').map(Number);
          return eh * 60 + em - (sh * 60 + sm);
        })
        .filter((m) => m > 0);
      timetable = {
        source: grid.source,
        periodsPerWeek: subjectSlots.length || null,
        typicalMinutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
      };
    }

    const overlappingPlanners = year
      ? await this.prisma.academicPlanner.findMany({
          where: {
            schoolId,
            sectionId,
            subjectId,
            academicYearId: year.id,
            status: { not: 'ARCHIVED' },
          },
          select: { id: true, title: true, startDate: true, examDate: true, status: true },
        })
      : [];

    return {
      section: { id: section.id, label: sectionClassLabel(section), gradeHasPeriodTimetable: section.grade.hasPeriodTimetable },
      subject: { id: subject.id, name: subject.name },
      eligibleTeachers,
      grantedBooks,
      examConfigs: examConfigs.map((e) => ({
        id: e.id,
        name: e.name,
        startDate: e.startDate?.toISOString().slice(0, 10) ?? null,
      })),
      timetable,
      overlappingPlanners,
    };
  }

  async listBookChapters(user: AuthUser, bookId: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const grant = await this.prisma.libraryBookGrant.findFirst({
      where: { schoolId, bookId, canRead: true },
    });
    if (!grant) {
      throw new NotFoundException({ code: 'BOOK_NOT_ASSIGNED', message: 'Book is not assigned to this school' });
    }
    const chapters = await this.prisma.libraryBookChapter.findMany({
      where: { bookId },
      orderBy: [{ chapterNumber: 'asc' }, { title: 'asc' }],
      select: { id: true, chapterNumber: true, title: true, publishedText: true, exercisesText: true },
    });
    return chapters.map((c) => {
      const text = joinCompiledChapter(c.publishedText, c.exercisesText).trim();
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      return {
        id: c.id,
        chapterNumber: c.chapterNumber,
        title: c.title,
        hasContent: text.length >= 200,
        wordCount,
      };
    });
  }

  async analyzeChapter(
    user: AuthUser,
    plannerId: string,
    versionId: string,
    chapterKey: string,
    expectedRevision: number,
    force?: boolean,
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const { planner, version, chapter } = await this.loadEditableChapter(
      schoolId,
      plannerId,
      versionId,
      chapterKey,
    );

    const settings = version.settings as PlannerSettings;
    const periodMinutes = settings.fallbackPeriodMinutes ?? 40;
    const loaded = chapter.libraryBookChapterId
      ? await this.content.loadChapterText(schoolId, chapter.libraryBookChapterId)
      : { title: chapter.titleSnapshot, text: '', wordCount: 0 };

    const result = await this.analysis.analyze({
      schoolId,
      userId: user.id,
      chapterTitle: chapter.titleSnapshot,
      chapterText: loaded.text,
      subjectName: planner.subject.name,
      classLabel: gradeClassLabel(planner.section),
      gradeLevel: planner.section.grade.level,
      periodMinutes,
      activityCount: chapter.activityCount,
      activitiesEnabled: chapter.activitiesEnabled,
      contentMissing: chapter.contentStatus === PlannerContentStatus.MISSING,
      force,
    });

    await this.prisma.$transaction(async (tx) => {
      const cas = await tx.academicPlannerVersion.updateMany({
        where: {
          id: versionId,
          revision: expectedRevision,
          status: { in: [PlannerVersionStatus.DRAFT, PlannerVersionStatus.CHANGES_REQUESTED] },
        },
        data: { revision: { increment: 1 } },
      });
      if (cas.count === 0) {
        throw new ConflictException({
          error: {
            code: 'PLANNER_VERSION_CONFLICT',
            message: 'Planner was updated elsewhere',
            details: { currentRevision: version.revision },
          },
        });
      }

      await tx.plannerChapter.update({
        where: { id: chapter.id },
        data: {
          analysis: result.analysis as Prisma.InputJsonValue,
          analysisSource: result.source,
          analysisWarnings: result.warnings as Prisma.InputJsonValue,
          analyzedAt: new Date(),
        },
      });

      if (chapter.activitiesEnabled && result.analysis.activitySuggestions?.length) {
        await tx.plannerActivity.deleteMany({ where: { versionId, plannerChapterId: chapter.id } });
        await tx.plannerActivity.createMany({
          data: result.analysis.activitySuggestions.slice(0, chapter.activityCount).map((a, i) => ({
            versionId,
            plannerChapterId: chapter.id,
            activityKey: randomUUID(),
            title: a.title,
            description: a.description,
            minutes: a.minutes,
            afterPortionKey: a.afterPortionKey,
            optional: true,
            sortOrder: i,
            source: result.source,
          })),
        });
      }
    });

    return this.planners.getVersionPayload(user, plannerId, versionId);
  }

  async generate(user: AuthUser, plannerId: string, versionId: string, expectedRevision: number) {
    const schoolId = this.tenant.requireSchoolId(user);
    const planner = await this.prisma.academicPlanner.findFirst({
      where: { id: plannerId, schoolId },
      include: {
        subject: true,
        section: { include: { grade: true } },
      },
    });
    if (!planner) throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });

    const version = await this.prisma.academicPlannerVersion.findFirst({
      where: { id: versionId, plannerId },
      include: {
        chapters: { orderBy: { sortOrder: 'asc' }, include: { activities: true } },
      },
    });
    if (!version) throw new NotFoundException({ code: 'PLANNER_VERSION_NOT_FOUND', message: 'Version not found' });

    if (version.origin === PlannerVersionOrigin.RECOVERY) {
      throw new UnprocessableEntityException({
        code: 'USE_RECOVERY_REGENERATE',
        message: 'Use recovery regenerate for recovery proposals',
      });
    }

    const unanalyzed = version.chapters.filter((c) => !c.analysis);
    if (unanalyzed.length) {
      throw new UnprocessableEntityException({
        code: 'CHAPTER_NOT_ANALYZED',
        message: 'Analyze all chapters before generating the schedule',
        details: { chapterKeys: unanalyzed.map((c) => c.chapterKey) },
      });
    }

    const settings = version.settings as PlannerSettings;
    const settingsRow = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    const tz = settingsRow?.timezone ?? DEFAULT_SCHOOL_TIMEZONE;

    const slotResult = await buildPlannerTeachingSlots(
      { resolver: this.resolver, prisma: this.prisma },
      {
        schoolId,
        sectionId: planner.sectionId,
        academicYearId: planner.academicYearId,
        gradeHasPeriodTimetable: planner.section.grade.hasPeriodTimetable,
        subjectId: planner.subjectId,
        startDate: planner.startDate.toISOString().slice(0, 10),
        lastTeachingDate: settings.lastTeachingDate,
        settings,
        timezone: tz,
        section: {
          id: planner.sectionId,
          gradeId: planner.section.gradeId,
          branchId: planner.section.branchId,
        },
      },
    );

    const chaptersForEngine: ChapterForSegments[] = version.chapters.map((c) => {
      const analysis = c.analysis as ChapterForSegments['analysis'];
      return {
        chapterKey: c.chapterKey,
        title: c.titleSnapshot,
        required: c.required,
        activitiesEnabled: c.activitiesEnabled,
        analysis,
        activities: c.activities.map((a) => ({
          activityKey: a.activityKey,
          title: a.title,
          minutes: a.minutes,
          afterPortionKey: a.afterPortionKey,
          optional: a.optional,
        })),
      };
    });

    const generated = generateSchedule({
      chapters: chaptersForEngine,
      teachingSlots: slotResult.slots,
      settings,
      timetableSource: slotResult.timetableSource,
    });

    const examRisk: PlannerExamRisk =
      generated.summary.feasibility === 'INFEASIBLE'
        ? PlannerExamRisk.HIGH
        : generated.summary.feasibility === 'AT_RISK'
          ? PlannerExamRisk.MEDIUM
          : PlannerExamRisk.LOW;

    await this.prisma.$transaction(async (tx) => {
      const cas = await tx.academicPlannerVersion.updateMany({
        where: {
          id: versionId,
          revision: expectedRevision,
          status: { in: [PlannerVersionStatus.DRAFT, PlannerVersionStatus.CHANGES_REQUESTED] },
        },
        data: {
          revision: { increment: 1 },
          summary: generated.summary as Prisma.InputJsonValue,
          examRisk,
        },
      });
      if (cas.count === 0) {
        throw new ConflictException({
          error: {
            code: 'PLANNER_VERSION_CONFLICT',
            message: 'Planner was updated elsewhere',
          },
        });
      }
      await tx.plannerLesson.deleteMany({ where: { versionId, frozen: false } });
      const chapterIdByKey = new Map(version.chapters.map((c) => [c.chapterKey, c.id]));
      await tx.plannerLesson.createMany({
        data: generated.lessons.map((l, sequence) => ({
          versionId,
          plannerChapterId: l.chapterKey ? chapterIdByKey.get(l.chapterKey) ?? null : null,
          lessonKey: l.lessonKey,
          sequence,
          kind: l.kind,
          title: l.title,
          primaryStage: l.primaryStage,
          stages: l.stages as Prisma.InputJsonValue,
          objectives: l.objectives as Prisma.InputJsonValue,
          portionKeys: l.portionKeys as Prisma.InputJsonValue,
          dependsOnKeys: l.dependsOnKeys as Prisma.InputJsonValue,
          plannedMinutes: l.plannedMinutes,
          scheduledDate: l.scheduledDate ? new Date(`${l.scheduledDate}T00:00:00.000Z`) : null,
          periodNumber: l.periodNumber,
          slotStartTime: l.slotStartTime,
          slotEndTime: l.slotEndTime,
          frozen: l.frozen,
          isContinuation: l.isContinuation,
        })),
      });
    });

    return this.planners.getVersionPayload(user, plannerId, versionId);
  }

  private async loadEditableChapter(
    schoolId: string,
    plannerId: string,
    versionId: string,
    chapterKey: string,
  ) {
    const planner = await this.prisma.academicPlanner.findFirst({
      where: { id: plannerId, schoolId },
      include: {
        subject: true,
        section: { include: { grade: true } },
      },
    });
    if (!planner) throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });

    const version = await this.prisma.academicPlannerVersion.findFirst({
      where: { id: versionId, plannerId, schoolId },
    });
    if (!version) throw new NotFoundException({ code: 'PLANNER_VERSION_NOT_FOUND', message: 'Version not found' });
    if (version.status !== PlannerVersionStatus.DRAFT && version.status !== PlannerVersionStatus.CHANGES_REQUESTED) {
      throw new ConflictException({ code: 'VERSION_NOT_EDITABLE', message: 'Version is not editable' });
    }

    const chapter = await this.prisma.plannerChapter.findFirst({
      where: { versionId, chapterKey },
    });
    if (!chapter) throw new NotFoundException({ code: 'CHAPTER_NOT_FOUND', message: 'Chapter not found' });

    return { planner, version, chapter };
  }
}
