import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  PlannerExamRisk,
  PlannerStatus,
  PlannerVersionOrigin,
  PlannerVersionStatus,
  Prisma,
  ScheduleChangeReason,
  TimetableVersionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { AcademicPlannersService } from './academic-planners.service';
import { CreateRecoveryProposalDto } from './dto/planner-recovery.dto';
import { PlannerAccessService } from './planner-access.service';
import { TimetableResolverService } from '../timetables/timetable-resolver.service';
import { buildPlannerTeachingSlots } from './academic-planners-schedule.helper';
import { DEFAULT_SCHOOL_TIMEZONE, zonedDateIso, zonedMinutes } from '../teachers/teacher-checkin';
import { PlannerSettings } from './planner-types';
import {
  dbLessonsToDrafts,
  isRecoveryScheduleChanged,
  listEligibleRecoveryLessons,
  RecoveryEngineResult,
  runRecoveryEngine,
} from './recovery-engine';
import { detectRecoveryTimetableConflicts } from './recovery-conflicts';
import { buildExternalCrossPoolForDates } from './recovery-external-timetable';
import { RecoveryImpact } from './recovery-impact';
import { recoveryHasBlockingConflicts, recoveryRequiresRegeneration } from './recovery-workflow';
import { ScheduleLessonDraft } from './planner-types';

@Injectable()
export class PlannerRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly planners: AcademicPlannersService,
    private readonly access: PlannerAccessService,
    private readonly resolver: TimetableResolverService,
  ) {}

  async proposeRecovery(user: AuthUser, plannerId: string, dto: CreateRecoveryProposalDto) {
    const ctx = await this.assertRecoveryContext(user, plannerId);
    if (ctx.existingRecoveryVersionId) {
      throw new ConflictException({
        code: 'RECOVERY_DRAFT_EXISTS',
        message: 'A recovery proposal is already in progress',
        details: { versionId: ctx.existingRecoveryVersionId },
      });
    }
    const baseline = await this.loadBaseline(ctx.planner.approvedVersionId!);
    const engine = await this.runEngine(ctx.schoolId, ctx.planner, baseline, dto);
    if (!isRecoveryScheduleChanged(engine, dbLessonsToDrafts(baseline.lessons, new Map(baseline.chapters.map((c) => [c.id, c.chapterKey]))))) {
      throw new UnprocessableEntityException({ code: 'RECOVERY_NOT_NEEDED', message: 'Schedule unchanged' });
    }

    const version = await this.createRecoveryDraft(ctx, baseline, dto);
    await this.persistEngineResult(ctx.planner.id, version.id, 0, dto, engine);
    return this.planners.getVersionPayload(user, plannerId, version.id);
  }

  async listEligible(user: AuthUser, plannerId: string) {
    const actor = await this.access.resolveActor(user);
    const schoolId = actor.schoolId;
    const planner = await this.prisma.academicPlanner.findFirst({ where: { id: plannerId, schoolId } });
    if (!planner?.approvedVersionId) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });
    }
    const isOwner =
      actor.isPrincipalOrAdmin ||
      planner.createdById === actor.userId ||
      (actor.teacherProfileId != null && planner.teacherId === actor.teacherProfileId);
    if (!isOwner) {
      throw new NotFoundException({ code: 'PLANNER_FORBIDDEN', message: 'Access denied' });
    }
    const baseline = await this.loadBaseline(planner.approvedVersionId);
    const settingsRow = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    const tz = settingsRow?.timezone ?? DEFAULT_SCHOOL_TIMEZONE;
    const todayIso = zonedDateIso(new Date(), tz);
    const nowMinutes = zonedMinutes(new Date(), tz);
    const chapterKeyById = new Map(baseline.chapters.map((c) => [c.id, c.chapterKey]));
    const baselineDrafts = dbLessonsToDrafts(baseline.lessons, chapterKeyById);
    const records = await this.prisma.teachingRecord.findMany({ where: { plannerId: planner.id } });
    const eligible = listEligibleRecoveryLessons(
      baselineDrafts,
      records.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        periodNumber: r.periodNumber,
        plannedLessonKey: r.plannedLessonKey,
        status: r.status,
        actualLessons: (r.actualLessons as Array<{
          lessonKey: string;
          outcome: string;
          completedStageIndexes?: number[];
        }>) ?? [],
      })),
      todayIso,
      nowMinutes,
    );
    return {
      plannerId: planner.id,
      approvedVersionId: planner.approvedVersionId,
      eligible,
      changeReasons: Object.values(ScheduleChangeReason),
    };
  }

  async assertRecoverySubmitReady(
    schoolId: string,
    planner: { id: string; approvedVersionId: string | null },
    version: {
      id: string;
      origin: PlannerVersionOrigin;
      basedOnVersionId: string | null;
      impact: unknown;
    },
  ) {
    if (version.origin !== PlannerVersionOrigin.RECOVERY) return;
    if (recoveryRequiresRegeneration(version.origin, version.basedOnVersionId, planner.approvedVersionId)) {
      throw new ConflictException({
        code: 'BASELINE_CHANGED',
        message: 'Approved baseline changed; regenerate the recovery proposal',
      });
    }
    const impact = version.impact as RecoveryImpact | null;
    if (recoveryHasBlockingConflicts(impact)) {
      throw new UnprocessableEntityException({
        code: 'RECOVERY_TIMETABLE_CONFLICT',
        message: 'Resolve timetable conflicts before submitting',
        details: { conflicts: impact?.timetableConflicts },
      });
    }
    const conflicts = await this.revalidateConflictsForVersion(schoolId, planner.id, version.id);
    if (conflicts.length) {
      throw new UnprocessableEntityException({
        code: 'RECOVERY_TIMETABLE_CONFLICT',
        message: 'Timetable conflicts detected on latest data',
        details: { conflicts },
      });
    }
  }

  async assertRecoveryApproveReady(
    schoolId: string,
    planner: { id: string; approvedVersionId: string | null },
    version: {
      id: string;
      origin: PlannerVersionOrigin;
      basedOnVersionId: string | null;
      status: PlannerVersionStatus;
    },
  ) {
    if (version.origin !== PlannerVersionOrigin.RECOVERY) return;
    if (version.status !== PlannerVersionStatus.SUBMITTED) {
      throw new ConflictException({ code: 'VERSION_NOT_SUBMITTED', message: 'Version is not submitted' });
    }
    if (recoveryRequiresRegeneration(version.origin, version.basedOnVersionId, planner.approvedVersionId)) {
      throw new ConflictException({
        code: 'BASELINE_CHANGED',
        message: 'Baseline version changed; reject or request regeneration',
      });
    }
    const conflicts = await this.revalidateConflictsForVersion(schoolId, planner.id, version.id);
    if (conflicts.length) {
      throw new UnprocessableEntityException({
        code: 'RECOVERY_TIMETABLE_CONFLICT',
        message: 'Cannot approve while timetable conflicts exist',
        details: { conflicts },
      });
    }
  }

  async revalidateConflictsForVersion(schoolId: string, plannerId: string, versionId: string) {
    const planner = await this.prisma.academicPlanner.findFirst({
      where: { id: plannerId, schoolId },
      include: { section: { include: { grade: true } } },
    });
    if (!planner) return [];
    const version = await this.prisma.academicPlannerVersion.findFirst({
      where: { id: versionId, plannerId, schoolId },
      include: { lessons: { orderBy: { sequence: 'asc' } }, chapters: true },
    });
    if (!version) return [];
    const chapterKeyById = new Map(version.chapters.map((c) => [c.id, c.chapterKey]));
    const drafts = dbLessonsToDrafts(version.lessons, chapterKeyById);
    return this.computeTimetableConflicts(
      schoolId,
      {
        sectionId: planner.sectionId,
        academicYearId: planner.academicYearId,
        teacherId: planner.teacherId,
        section: planner.section,
      },
      drafts,
    );
  }

  async regenerateRecovery(
    user: AuthUser,
    plannerId: string,
    versionId: string,
    expectedRevision: number,
    dto: CreateRecoveryProposalDto,
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const planner = await this.prisma.academicPlanner.findFirst({ where: { id: plannerId, schoolId } });
    if (!planner?.approvedVersionId) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });
    }
    const version = await this.prisma.academicPlannerVersion.findFirst({
      where: { id: versionId, plannerId, schoolId },
    });
    if (!version || version.origin !== PlannerVersionOrigin.RECOVERY) {
      throw new ConflictException({ code: 'NOT_RECOVERY_VERSION', message: 'Not a recovery draft' });
    }
    if (version.status !== PlannerVersionStatus.DRAFT && version.status !== PlannerVersionStatus.CHANGES_REQUESTED) {
      throw new ConflictException({ code: 'VERSION_NOT_EDITABLE', message: 'Version is not editable' });
    }
    const actor = await this.access.resolveActor(user);
    const isOwner =
      actor.isPrincipalOrAdmin ||
      planner.createdById === actor.userId ||
      (actor.teacherProfileId != null && planner.teacherId === actor.teacherProfileId);
    if (!isOwner) {
      throw new NotFoundException({ code: 'PLANNER_FORBIDDEN', message: 'Access denied' });
    }
    const baseline = await this.loadBaseline(version.basedOnVersionId ?? planner.approvedVersionId);
    if (baseline.id !== planner.approvedVersionId) {
      throw new ConflictException({
        code: 'BASELINE_CHANGED',
        message: 'Approved baseline changed; create a new recovery proposal',
      });
    }
    const engine = await this.runEngine(schoolId, planner, baseline, dto);
    await this.persistEngineResult(planner.id, versionId, expectedRevision, dto, engine);
    return this.planners.getVersionPayload(user, plannerId, versionId);
  }

  private async runEngine(
    schoolId: string,
    planner: {
      id: string;
      sectionId: string;
      subjectId: string;
      academicYearId: string;
    },
    baseline: Awaited<ReturnType<PlannerRecoveryService['loadBaseline']>>,
    dto: CreateRecoveryProposalDto,
  ): Promise<RecoveryEngineResult> {
    const settingsRow = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    const tz = settingsRow?.timezone ?? DEFAULT_SCHOOL_TIMEZONE;
    const todayIso = zonedDateIso(new Date(), tz);
    const nowMinutes = zonedMinutes(new Date(), tz);

    const plannerFull = await this.prisma.academicPlanner.findFirst({
      where: { id: planner.id, schoolId },
      include: { section: { include: { grade: true } } },
    });
    if (!plannerFull) throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });

    const settings = baseline.settings as PlannerSettings;
    const slotResult = await buildPlannerTeachingSlots(
      { resolver: this.resolver, prisma: this.prisma },
      {
        schoolId,
        sectionId: planner.sectionId,
        academicYearId: planner.academicYearId,
        gradeHasPeriodTimetable: plannerFull.section.grade.hasPeriodTimetable,
        subjectId: planner.subjectId,
        startDate: todayIso,
        lastTeachingDate: settings.lastTeachingDate,
        settings,
        timezone: tz,
        section: {
          id: planner.sectionId,
          gradeId: plannerFull.section.gradeId,
          branchId: plannerFull.section.branchId,
        },
      },
    );

    const chapterKeyById = new Map(baseline.chapters.map((c) => [c.id, c.chapterKey]));
    const baselineDrafts = dbLessonsToDrafts(baseline.lessons, chapterKeyById);

    const records = await this.prisma.teachingRecord.findMany({ where: { plannerId: planner.id } });
    const recoveryRecords = records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      periodNumber: r.periodNumber,
      plannedLessonKey: r.plannedLessonKey,
      status: r.status,
      actualLessons: (r.actualLessons as Array<{
        lessonKey: string;
        outcome: string;
        completedStageIndexes?: number[];
      }>) ?? [],
    }));

    this.validateSelectedLessonKeys(baselineDrafts, recoveryRecords, todayIso, nowMinutes, dto);

    const engine = runRecoveryEngine({
      todayIso,
      nowMinutes,
      baselineLessons: baselineDrafts,
      records: recoveryRecords,
      teachingSlots: slotResult.slots,
      settings,
      timetableSource: slotResult.timetableSource,
      options: {
        allowBufferUse: dto.allowBufferUse ?? true,
        allowCompression: dto.allowCompression ?? true,
        allowActivityRemoval: dto.allowActivityRemoval ?? false,
        targetLessonKeys: dto.lessonKeys,
        includeUnreported: dto.includeUnreported ?? false,
      },
      keyFactory: () => `rec-${Math.random().toString(36).slice(2, 9)}`,
    });

    const conflicts = await this.computeTimetableConflicts(
      schoolId,
      {
        sectionId: plannerFull.sectionId,
        academicYearId: plannerFull.academicYearId,
        teacherId: plannerFull.teacherId,
        section: plannerFull.section,
      },
      engine.lessons,
    );
    return this.applyConflictsToEngine(engine, conflicts, dto.lessonKeys);
  }

  private applyConflictsToEngine(
    engine: RecoveryEngineResult,
    conflicts: ReturnType<typeof detectRecoveryTimetableConflicts>,
    lessonKeys: string[],
  ): RecoveryEngineResult {
    const constraintsUnmet = [...engine.impact.constraintsUnmet];
    if (conflicts.length) {
      constraintsUnmet.push(`${conflicts.length} timetable conflict(s) detected.`);
    }
    const impact: RecoveryImpact = {
      ...engine.impact,
      timetableConflicts: conflicts,
      selectedLessonKeys: lessonKeys,
      constraintsUnmet,
    };
    const summary = { ...engine.summary };
    if (conflicts.length) {
      summary.feasibility = 'INFEASIBLE';
    }
    return { ...engine, impact, summary };
  }

  private async computeTimetableConflicts(
    schoolId: string,
    planner: {
      sectionId: string;
      academicYearId: string;
      teacherId: string;
      section: { grade: { name: string }; name: string };
    },
    proposalLessons: ScheduleLessonDraft[],
  ) {
    const dates = proposalLessons.map((l) => l.scheduledDate).filter((d): d is string => Boolean(d));
    if (!dates.length) return [];

    const published = await this.prisma.timetableVersion.findMany({
      where: {
        schoolId,
        academicYearId: planner.academicYearId,
        status: TimetableVersionStatus.PUBLISHED,
      },
      include: {
        periods: true,
        section: { select: { id: true, name: true, grade: { select: { name: true } } } },
      },
    });

    const external = buildExternalCrossPoolForDates(
      published
        .filter((v) => v.effectiveFrom != null)
        .map((v) => ({
          id: v.id,
          sectionId: v.sectionId,
          sectionLabel: `${v.section.grade.name} ${v.section.name}`,
          effectiveFrom: v.effectiveFrom!,
          effectiveTo: v.effectiveTo,
          periods: v.periods,
        })),
      planner.sectionId,
      dates,
    );

    return detectRecoveryTimetableConflicts(
      proposalLessons,
      planner.sectionId,
      planner.teacherId,
      external,
    );
  }

  private validateSelectedLessonKeys(
    baselineDrafts: ScheduleLessonDraft[],
    records: Parameters<typeof listEligibleRecoveryLessons>[1],
    todayIso: string,
    nowMinutes: number,
    dto: CreateRecoveryProposalDto,
  ) {
    const eligible = listEligibleRecoveryLessons(baselineDrafts, records, todayIso, nowMinutes);
    const eligibleKeys = new Set(eligible.map((e) => e.lessonKey));
    const unknown = dto.lessonKeys.filter((k) => !eligibleKeys.has(k));
    if (unknown.length) {
      throw new UnprocessableEntityException({
        code: 'RECOVERY_LESSON_INVALID',
        message: 'One or more selected lessons are not eligible for recovery',
        details: { lessonKeys: unknown },
      });
    }
    const unreportedSelected = eligible.filter(
      (e) => e.coverage === 'UNREPORTED' && dto.lessonKeys.includes(e.lessonKey),
    );
    if (unreportedSelected.length && !dto.includeUnreported) {
      throw new UnprocessableEntityException({
        code: 'CONFIRMATION_REQUIRED',
        message: 'Include unreported lessons or confirm they should not be recovered',
        details: { lessonKeys: unreportedSelected.map((u) => u.lessonKey) },
      });
    }
  }

  private async persistEngineResult(
    plannerId: string,
    versionId: string,
    expectedRevision: number,
    dto: CreateRecoveryProposalDto,
    engine: RecoveryEngineResult,
  ) {
    const examRisk: PlannerExamRisk =
      engine.examRisk === 'HIGH'
        ? PlannerExamRisk.HIGH
        : engine.examRisk === 'MEDIUM'
          ? PlannerExamRisk.MEDIUM
          : PlannerExamRisk.LOW;

    const version = await this.prisma.academicPlannerVersion.findFirst({
      where: { id: versionId, plannerId },
      include: { chapters: true },
    });
    if (!version) throw new NotFoundException({ code: 'PLANNER_VERSION_NOT_FOUND', message: 'Version not found' });
    const chapterIdByKey = new Map(version.chapters.map((c) => [c.chapterKey, c.id]));

    await this.prisma.$transaction(async (tx) => {
      const cas = await tx.academicPlannerVersion.updateMany({
        where: {
          id: versionId,
          revision: expectedRevision,
          status: { in: [PlannerVersionStatus.DRAFT, PlannerVersionStatus.CHANGES_REQUESTED] },
        },
        data: {
          revision: { increment: 1 },
          summary: engine.summary as Prisma.InputJsonValue,
          examRisk,
          impact: engine.impact as Prisma.InputJsonValue,
          changeReason: dto.reason,
          changeReasonNote: dto.reasonNote?.trim() ?? null,
        },
      });
      if (cas.count === 0) {
        throw new ConflictException({ code: 'PLANNER_VERSION_CONFLICT', message: 'Version conflict' });
      }
      await tx.plannerLesson.deleteMany({ where: { versionId } });
      if (engine.lessons.length) {
        await tx.plannerLesson.createMany({
          data: engine.lessons.map((l, sequence) => ({
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
      }
    });
  }

  private async createRecoveryDraft(
    ctx: Awaited<ReturnType<PlannerRecoveryService['assertRecoveryContext']>>,
    baseline: Awaited<ReturnType<PlannerRecoveryService['loadBaseline']>>,
    dto: CreateRecoveryProposalDto,
  ) {
    const maxNum = await this.prisma.academicPlannerVersion.aggregate({
      where: { plannerId: ctx.planner.id },
      _max: { versionNumber: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.academicPlannerVersion.create({
        data: {
          plannerId: ctx.planner.id,
          schoolId: ctx.schoolId,
          versionNumber: (maxNum._max.versionNumber ?? 0) + 1,
          status: PlannerVersionStatus.DRAFT,
          origin: PlannerVersionOrigin.RECOVERY,
          basedOnVersionId: baseline.id,
          revision: 0,
          settings: baseline.settings as Prisma.InputJsonValue,
          changeReason: dto.reason,
          changeReasonNote: dto.reasonNote?.trim() ?? null,
          createdById: ctx.actor.userId,
        },
      });

      for (const chapter of baseline.chapters) {
        await tx.plannerChapter.create({
          data: {
            versionId: version.id,
            chapterKey: chapter.chapterKey,
            libraryBookChapterId: chapter.libraryBookChapterId,
            sortOrder: chapter.sortOrder,
            titleSnapshot: chapter.titleSnapshot,
            contentHash: chapter.contentHash,
            contentStatus: chapter.contentStatus,
            required: chapter.required,
            activitiesEnabled: chapter.activitiesEnabled,
            activityCount: chapter.activityCount,
            analysis: chapter.analysis as Prisma.InputJsonValue,
            analysisSource: chapter.analysisSource,
            analysisWarnings: chapter.analysisWarnings as Prisma.InputJsonValue,
            analyzedAt: chapter.analyzedAt,
          },
        });
      }

      for (const act of baseline.activities) {
        const ch = baseline.chapters.find((c) => c.id === act.plannerChapterId);
        if (!ch) continue;
        const newCh = await tx.plannerChapter.findFirst({
          where: { versionId: version.id, chapterKey: ch.chapterKey },
        });
        if (!newCh) continue;
        await tx.plannerActivity.create({
          data: {
            versionId: version.id,
            plannerChapterId: newCh.id,
            activityKey: act.activityKey,
            title: act.title,
            description: act.description,
            minutes: act.minutes,
            afterPortionKey: act.afterPortionKey,
            optional: act.optional,
            sortOrder: act.sortOrder,
            source: act.source,
          },
        });
      }

      await tx.academicPlanner.update({
        where: { id: ctx.planner.id },
        data: { workingVersionId: version.id, status: PlannerStatus.REVISION_PENDING },
      });

      return version;
    });
  }

  private async assertRecoveryContext(user: AuthUser, plannerId: string) {
    const actor = await this.access.resolveActor(user);
    const schoolId = actor.schoolId;
    const planner = await this.prisma.academicPlanner.findFirst({ where: { id: plannerId, schoolId } });
    if (!planner?.approvedVersionId) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'No approved planner' });
    }
    if (planner.status !== PlannerStatus.PUBLISHED && planner.status !== PlannerStatus.REVISION_PENDING) {
      throw new ConflictException({ code: 'PLANNER_NOT_PUBLISHED', message: 'Planner is not active' });
    }
    if (planner.workingVersionId) {
      const working = await this.prisma.academicPlannerVersion.findUnique({
        where: { id: planner.workingVersionId },
      });
      if (working?.origin === PlannerVersionOrigin.RECOVERY) {
        return { actor, planner, schoolId, existingRecoveryVersionId: working.id };
      }
      throw new ConflictException({
        code: 'WORKING_VERSION_EXISTS',
        message: 'Finish or discard the current draft first',
        details: { workingVersionId: planner.workingVersionId },
      });
    }
    const isOwner =
      actor.isPrincipalOrAdmin ||
      planner.createdById === actor.userId ||
      (actor.teacherProfileId != null && planner.teacherId === actor.teacherProfileId);
    if (!isOwner) {
      throw new NotFoundException({ code: 'PLANNER_FORBIDDEN', message: 'Access denied' });
    }
    return { actor, planner, schoolId, existingRecoveryVersionId: null as string | null };
  }

  private async loadBaseline(versionId: string) {
    const baseline = await this.prisma.academicPlannerVersion.findUnique({
      where: { id: versionId },
      include: { lessons: true, chapters: true, activities: true },
    });
    if (!baseline) {
      throw new NotFoundException({ code: 'PLANNER_VERSION_NOT_FOUND', message: 'Baseline missing' });
    }
    return baseline;
  }
}
