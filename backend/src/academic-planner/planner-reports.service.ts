import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { zonedDateIso, DEFAULT_SCHOOL_TIMEZONE } from '../teachers/teacher-checkin';
import { computePlannerProgress, LessonProgressRow } from './progress-metrics';
import { PlannerAccessService } from './planner-access.service';

@Injectable()
export class PlannerReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly access: PlannerAccessService,
  ) {}

  async plannerProgress(user: AuthUser, plannerId: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const planner = await this.prisma.academicPlanner.findFirst({
      where: { id: plannerId, schoolId },
    });
    if (!planner?.approvedVersionId) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'No approved planner' });
    }
    await this.assertView(user, planner);

    const todayIso = zonedDateIso(new Date(), DEFAULT_SCHOOL_TIMEZONE);

    const lessons = await this.prisma.plannerLesson.findMany({
      where: { versionId: planner.approvedVersionId },
      orderBy: { sequence: 'asc' },
    });
    const records = await this.prisma.teachingRecord.findMany({ where: { plannerId } });

    const rows: LessonProgressRow[] = lessons.map((lesson) => {
      const rec = records.find(
        (r) =>
          r.plannedLessonKey === lesson.lessonKey ||
          (lesson.scheduledDate &&
            r.date.toISOString().slice(0, 10) === lesson.scheduledDate.toISOString().slice(0, 10) &&
            r.periodNumber === lesson.periodNumber),
      );
      return {
        lessonKey: lesson.lessonKey,
        scheduledDate: lesson.scheduledDate?.toISOString().slice(0, 10) ?? null,
        periodNumber: lesson.periodNumber,
        recordStatus: rec?.status ?? null,
      };
    });

    const metrics = computePlannerProgress(rows, planner.examDate.toISOString().slice(0, 10), todayIso);

    return {
      plannerId,
      approvedVersionId: planner.approvedVersionId,
      examDate: planner.examDate.toISOString().slice(0, 10),
      metrics,
      lessons: rows.map((row) => {
        const lesson = lessons.find((l) => l.lessonKey === row.lessonKey)!;
        return {
          lessonKey: row.lessonKey,
          title: lesson.title,
          scheduledDate: row.scheduledDate,
          periodNumber: row.periodNumber,
          recordStatus: row.recordStatus,
        };
      }),
    };
  }

  private async assertView(
    user: AuthUser,
    planner: { teacherId: string; createdById: string; sectionId: string },
  ) {
    const actor = await this.access.resolveActor(user);
    if (actor.isPrincipalOrAdmin) return;
    if (actor.teacherProfileId === planner.teacherId) return;
    throw new ForbiddenException({ code: 'PLANNER_FORBIDDEN', message: 'Access denied' });
  }
}
