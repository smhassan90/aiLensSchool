import { PrismaClient } from '@prisma/client';
import {
  teachingPackToPlannerAnalysis,
  TeachingPackForAnalysis,
} from './chapter-teaching-pack-to-analysis';
import { PlannerChapterAnalysis } from '../ai/schemas/planner-chapter-analysis.schema';
import { PlannerAnalysisSource } from '@prisma/client';

const packInclude = {
  readingSlices: { orderBy: { sortOrder: 'asc' as const } },
  questions: { orderBy: { sortOrder: 'asc' as const } },
  activities: { orderBy: { sortOrder: 'asc' as const } },
  revisionPoints: { orderBy: { sortOrder: 'asc' as const } },
};

export async function loadTeachingPacksByChapterIds(
  prisma: PrismaClient,
  libraryBookChapterIds: string[],
): Promise<Map<string, TeachingPackForAnalysis & { id: string }>> {
  const ids = [...new Set(libraryBookChapterIds.filter(Boolean))];
  if (!ids.length) return new Map();

  const rows = await prisma.libraryChapterTeachingPack.findMany({
    where: { libraryBookChapterId: { in: ids } },
    include: packInclude,
  });

  const map = new Map<string, TeachingPackForAnalysis & { id: string }>();
  for (const row of rows) {
    map.set(row.libraryBookChapterId, {
      id: row.id,
      contentHash: row.contentHash,
      complexity: row.complexity,
      summary: row.summary,
      teacherGuide: row.teacherGuide,
      source: row.source,
      promptVersion: row.promptVersion,
      readingSlices: row.readingSlices,
      questions: row.questions,
      activities: row.activities,
      revisionPoints: row.revisionPoints,
    });
  }
  return map;
}

export function analysisFromTeachingPack(input: {
  pack: TeachingPackForAnalysis;
  chapterTitle: string;
  subjectName: string;
  periodMinutes: number;
  activitiesEnabled: boolean;
  activityCount: number;
  contentHash: string | null;
}): {
  analysis: PlannerChapterAnalysis;
  source: PlannerAnalysisSource;
  warnings: Array<{ code: string; message: string }>;
} | null {
  if (!input.contentHash || input.pack.contentHash !== input.contentHash) {
    return null;
  }
  const analysis = teachingPackToPlannerAnalysis({
    pack: input.pack,
    chapterTitle: input.chapterTitle,
    subjectName: input.subjectName,
    periodMinutes: input.periodMinutes,
    activitiesEnabled: input.activitiesEnabled,
    activityCount: input.activityCount,
  });
  return {
    analysis,
    source: input.pack.source,
    warnings: [
      {
        code: 'TEACHING_PACK',
        message: `Schedule built from library teaching pack (${input.pack.promptVersion}).`,
      },
    ],
  };
}
