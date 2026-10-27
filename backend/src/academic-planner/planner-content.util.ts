import { createHash } from 'crypto';
import { PlannerContentStatus } from '@prisma/client';
import { joinCompiledChapter } from '../ai/schemas/chapter-compile.schema';

const MIN_CONTENT_CHARS = 200;

export function plannerChapterContentHash(publishedText: string, exercisesText: string): string {
  const joined = joinCompiledChapter(publishedText ?? '', exercisesText ?? '').trim();
  return createHash('sha256').update(joined, 'utf8').digest('hex');
}

export function plannerChapterContentStatus(publishedText: string, exercisesText: string): PlannerContentStatus {
  const joined = joinCompiledChapter(publishedText ?? '', exercisesText ?? '').trim();
  return joined.length < MIN_CONTENT_CHARS ? PlannerContentStatus.MISSING : PlannerContentStatus.AVAILABLE;
}
