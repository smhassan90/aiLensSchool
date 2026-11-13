import { PlannerAnalysisSource, PrismaClient } from '@prisma/client';
import { joinCompiledChapter } from '../ai/schemas/chapter-compile.schema';
import { CHAPTER_TEACHING_PACK_PROMPT_VERSION } from '../ai/prompts';
import { plannerChapterContentHash } from '../academic-planner/planner-content.util';
import { generateChapterTeachingPack } from './chapter-teaching-pack.generator';
import { upsertChapterTeachingPack } from './chapter-teaching-pack.persistence';

/**
 * Regenerates a teaching pack only when the saved chapter text has changed.
 * A failed generation throws and leaves the previous pack untouched.
 */
export async function refreshChapterTeachingPack(
  prisma: PrismaClient,
  libraryBookChapterId: string,
): Promise<'current' | 'regenerated'> {
  const chapter = await prisma.libraryBookChapter.findUnique({
    where: { id: libraryBookChapterId },
    include: {
      book: { select: { title: true, classLabel: true, subjectLabel: true } },
      teachingPack: { select: { contentHash: true } },
    },
  });
  if (!chapter) throw new Error('Library chapter not found');

  const contentHash = plannerChapterContentHash(chapter.publishedText, chapter.exercisesText);
  if (chapter.teachingPack?.contentHash === contentHash) return 'current';

  const chapterText = joinCompiledChapter(chapter.publishedText, chapter.exercisesText).trim();
  const result = await generateChapterTeachingPack({
    chapterTitle: chapter.title,
    chapterText,
    lessonText: chapter.publishedText,
    exercisesText: chapter.exercisesText,
    subjectName: chapter.book.subjectLabel || 'General',
    classLabel: chapter.book.classLabel || '',
    bookTitle: chapter.book.title,
  });
  if (result.source !== PlannerAnalysisSource.AI) {
    throw new Error(`Teaching pack for ${chapter.title} was not saved because generation did not return a complete pack.`);
  }

  await upsertChapterTeachingPack(prisma, {
    libraryBookChapterId,
    contentHash,
    pack: result.pack,
    source: result.source,
    warnings: result.warnings,
    promptVersion: CHAPTER_TEACHING_PACK_PROMPT_VERSION,
  });
  return 'regenerated';
}
