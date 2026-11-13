import { PlannerAnalysisSource, PrismaClient } from '@prisma/client';
import { joinCompiledChapter } from '../ai/schemas/chapter-compile.schema';
import { CHAPTER_TEACHING_PACK_PROMPT_VERSION } from '../ai/prompts';
import { plannerChapterContentHash } from '../academic-planner/planner-content.util';
import { generateChapterTeachingPack } from './chapter-teaching-pack.generator';
import { upsertChapterTeachingPack } from './chapter-teaching-pack.persistence';
import { packNeedsRefresh } from '../academic-planner/section-teaching-plan';

/**
 * Regenerates a teaching pack when the chapter text or the pack prompt version changed.
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
      teachingPack: { select: { contentHash: true, promptVersion: true } },
    },
  });
  if (!chapter) throw new Error('Library chapter not found');

  const contentHash = plannerChapterContentHash(chapter.publishedText, chapter.exercisesText);
  if (
    !packNeedsRefresh({
      storedHash: chapter.teachingPack?.contentHash ?? null,
      storedPromptVersion: chapter.teachingPack?.promptVersion ?? null,
      contentHash,
      promptVersion: CHAPTER_TEACHING_PACK_PROMPT_VERSION,
    })
  ) {
    return 'current';
  }

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
  if (result.source !== PlannerAnalysisSource.AI && result.source !== PlannerAnalysisSource.MANUAL) {
    throw new Error(`Teaching pack for ${chapter.title} was not saved because generation did not return a complete pack.`);
  }

  await upsertChapterTeachingPack(prisma, {
    libraryBookChapterId,
    contentHash,
    pack: result.pack,
    sectionPlans: result.sectionPlans,
    source: result.source,
    warnings: result.warnings,
    promptVersion: CHAPTER_TEACHING_PACK_PROMPT_VERSION,
  });
  return 'regenerated';
}
