import { z } from 'zod';

export {
  CHAPTER_COMPILE_DELIMITER,
  joinCompiledChapter,
  splitCompiledChapter,
} from './chapter-compile-text';

export const ChapterCompileOutputSchema = z.object({
  chapterName: z.string().nullish(),
  topicName: z.string().nullish(),
  lessonBody: z.string(),
  exercises: z.string(),
  concepts: z.array(z.string()).default([]),
});

export type ChapterCompileOutput = z.infer<typeof ChapterCompileOutputSchema>;
