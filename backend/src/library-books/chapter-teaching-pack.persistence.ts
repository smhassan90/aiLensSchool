import { PlannerAnalysisSource, Prisma, PrismaClient } from '@prisma/client';
import type { ChapterTeachingPackOutput } from './schemas/chapter-teaching-pack.schema';

export async function upsertChapterTeachingPack(
  prisma: PrismaClient,
  input: {
    libraryBookChapterId: string;
    contentHash: string;
    pack: ChapterTeachingPackOutput;
    source: PlannerAnalysisSource;
    warnings: Prisma.InputJsonValue | null;
    promptVersion: string;
  },
) {
  const generatedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.libraryChapterTeachingPack.findUnique({
      where: { libraryBookChapterId: input.libraryBookChapterId },
      select: { id: true },
    });
    if (existing) {
      await tx.libraryChapterTeachingPack.delete({ where: { id: existing.id } });
    }

    return tx.libraryChapterTeachingPack.create({
      data: {
        libraryBookChapterId: input.libraryBookChapterId,
        contentHash: input.contentHash,
        complexity: input.pack.complexity,
        summary: input.pack.summary,
        teacherGuide: input.pack.teacherGuide as Prisma.InputJsonValue,
        source: input.source,
        warnings: input.warnings ?? undefined,
        promptVersion: input.promptVersion,
        generatedAt,
        readingSlices: {
          create: input.pack.readingSlices.map((slice, sortOrder) => ({
            sortOrder,
            sliceKey: slice.sliceKey,
            title: slice.title,
            readingFrom: slice.readingFrom,
            readingTo: slice.readingTo ?? null,
            explainPoints: slice.explainPoints as Prisma.InputJsonValue,
          })),
        },
        questions: {
          create: input.pack.questions.map((q, sortOrder) => ({
            sortOrder,
            sliceKey: q.sliceKey ?? null,
            question: q.question,
            expectedAnswer: q.expectedAnswer,
            format: q.format,
          })),
        },
        activities: {
          create: input.pack.activities.map((a, sortOrder) => ({
            sortOrder,
            sliceKey: a.sliceKey ?? null,
            title: a.title,
            description: a.description,
            participationTechnique: a.participationTechnique,
            materials: a.materials ?? null,
          })),
        },
        revisionPoints: {
          create: input.pack.revisionPoints.map((r, sortOrder) => ({
            sortOrder,
            sliceKey: r.sliceKey ?? null,
            point: r.point,
          })),
        },
      },
      include: {
        readingSlices: { orderBy: { sortOrder: 'asc' } },
        questions: { orderBy: { sortOrder: 'asc' } },
        activities: { orderBy: { sortOrder: 'asc' } },
        revisionPoints: { orderBy: { sortOrder: 'asc' } },
      },
    });
  });
}

export async function listGrantedChaptersForSchool(prisma: PrismaClient, schoolId: string) {
  const grants = await prisma.libraryBookGrant.findMany({
    where: { schoolId, canRead: true },
    select: { bookId: true },
  });
  const bookIds = [...new Set(grants.map((g) => g.bookId))];
  if (!bookIds.length) return [];

  return prisma.libraryBookChapter.findMany({
    where: { bookId: { in: bookIds } },
    include: {
      book: { select: { title: true, classLabel: true, subjectLabel: true } },
      teachingPack: { select: { id: true, contentHash: true, generatedAt: true, source: true } },
    },
    orderBy: [{ bookId: 'asc' }, { chapterNumber: 'asc' }, { title: 'asc' }],
  });
}
