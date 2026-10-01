import { z } from 'zod';

export const ChapterCompileOutputSchema = z.object({
  chapterName: z.string().nullish(),
  topicName: z.string().nullish(),
  lessonBody: z.string(),
  exercises: z.string(),
  concepts: z.array(z.string()).default([]),
});

export type ChapterCompileOutput = z.infer<typeof ChapterCompileOutputSchema>;

export const CHAPTER_COMPILE_DELIMITER = '\n\n## Exercises\n\n';

export function joinCompiledChapter(body: string, exercises: string): string {
  const main = body.trim();
  const ex = exercises.trim();
  if (!ex) return main;
  return `${main}${CHAPTER_COMPILE_DELIMITER}${ex}`;
}

export function splitCompiledChapter(full: string): { lessonBody: string; exercises: string } {
  const idx = full.indexOf(CHAPTER_COMPILE_DELIMITER);
  if (idx < 0) {
    return { lessonBody: full.trim(), exercises: '' };
  }
  return {
    lessonBody: full.slice(0, idx).trim(),
    exercises: full.slice(idx + CHAPTER_COMPILE_DELIMITER.length).trim(),
  };
}
