import { LessonRecordKind, LessonSourceType, LessonStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** Lessons a teacher can pick when building an exam paper. */
export function examLectureTeachableStatusWhere(): Prisma.DailyLessonWhereInput {
  return {
    OR: [
      { status: LessonStatus.CONFIRMED },
      {
        recordKind: LessonRecordKind.CHAPTER_LIBRARY,
        OR: [
          { contentConfirmed: true },
          {
            AND: [{ aiSummary: { not: null } }, { NOT: { aiSummary: '' } }],
          },
          {
            sources: {
              some: {
                type: LessonSourceType.TEXTBOOK_IMAGE,
                AND: [{ ocrText: { not: null } }, { NOT: { ocrText: '' } }],
              },
            },
          },
        ],
      },
    ],
  };
}

/** Chapter library ids that already have at least one logged class session in this class/subject. */
export async function chapterSourceIdsWithClassSessions(
  prisma: PrismaService,
  where: Prisma.DailyLessonWhereInput,
): Promise<string[]> {
  const rows = await prisma.dailyLesson.findMany({
    where: {
      ...where,
      recordKind: LessonRecordKind.CLASS_SESSION,
      status: LessonStatus.CONFIRMED,
      chapterSourceId: { not: null },
    },
    select: { chapterSourceId: true },
    distinct: ['chapterSourceId'],
  });
  return rows.map((r) => r.chapterSourceId).filter((id): id is string => Boolean(id));
}

/** One row per teachable unit: class sessions plus library chapters not yet logged as class. */
export function examLectureRecordWhere(
  chapterIdsWithSessions: string[],
): Prisma.DailyLessonWhereInput {
  return {
    OR: [
      { recordKind: LessonRecordKind.CLASS_SESSION },
      {
        recordKind: LessonRecordKind.CHAPTER_LIBRARY,
        ...(chapterIdsWithSessions.length ? { id: { notIn: chapterIdsWithSessions } } : {}),
      },
    ],
  };
}

export function dedupeExamLectureLessons<
  T extends { id: string; recordKind: LessonRecordKind; chapterSourceId?: string | null },
>(lessons: T[]): T[] {
  const taughtChapterIds = new Set(
    lessons
      .filter((l) => l.recordKind === LessonRecordKind.CLASS_SESSION && l.chapterSourceId)
      .map((l) => l.chapterSourceId as string),
  );
  return lessons.filter(
    (l) => l.recordKind !== LessonRecordKind.CHAPTER_LIBRARY || !taughtChapterIds.has(l.id),
  );
}
