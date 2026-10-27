import { PlannerStatus, PrismaClient } from '@prisma/client';
import { dateFromIso } from '../teachers/teacher-checkin';

export async function resolvePlannerLesson(
  prisma: PrismaClient,
  schoolId: string,
  sectionId: string,
  subjectId: string,
  dateIso: string,
  periodNumber: number,
) {
  const at = dateFromIso(dateIso);
  const planners = await prisma.academicPlanner.findMany({
    where: {
      schoolId,
      sectionId,
      subjectId,
      status: { in: [PlannerStatus.PUBLISHED, PlannerStatus.REVISION_PENDING] },
      approvedVersionId: { not: null },
      startDate: { lte: at },
      examDate: { gte: at },
    },
    select: { id: true, title: true, approvedVersionId: true },
  });
  if (planners.length !== 1) {
    return { planner: planners[0] ?? null, lesson: null, conflict: planners.length > 1 };
  }
  const planner = planners[0];
  const lesson = await prisma.plannerLesson.findFirst({
    where: {
      versionId: planner.approvedVersionId!,
      scheduledDate: at,
      periodNumber,
    },
    include: { chapter: { select: { titleSnapshot: true } } },
  });
  return {
    planner,
    lesson: lesson
      ? {
          lessonKey: lesson.lessonKey,
          title: lesson.title,
          primaryStage: lesson.primaryStage,
          objectives: lesson.objectives,
          chapterTitle: lesson.chapter?.titleSnapshot ?? null,
          plannedMinutes: lesson.plannedMinutes,
        }
      : null,
    conflict: false,
  };
}
