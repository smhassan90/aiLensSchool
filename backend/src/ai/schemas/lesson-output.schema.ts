import { z } from 'zod';

export const LessonOutputSchema = z.object({
  chapterName: z.string().optional(),
  topicName: z.string().optional(),
  summary: z.string(),
  concepts: z.array(z.string()).default([]),
  pageFrom: z.number().int().optional(),
  pageTo: z.number().int().optional(),
  teacherNotesSuggestion: z.string().optional(),
});

export type LessonOutput = z.infer<typeof LessonOutputSchema>;
