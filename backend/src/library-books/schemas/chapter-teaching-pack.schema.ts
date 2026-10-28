import { z } from 'zod';

export const ChapterTeachingPackSchema = z.object({
  complexity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  summary: z.string().min(20).max(4000),
  teacherGuide: z.array(z.string().min(5).max(500)).min(1).max(40),
  readingSlices: z
    .array(
      z.object({
        sliceKey: z.string().regex(/^s\d{1,2}$/),
        title: z.string().min(2).max(160),
        readingFrom: z.string().min(8).max(800),
        readingTo: z.string().max(800).optional().nullable(),
        explainPoints: z.array(z.string().min(5).max(400)).min(1).max(12),
      }),
    )
    .min(1)
    .max(12),
  questions: z
    .array(
      z.object({
        sliceKey: z.string().regex(/^s\d{1,2}$/).nullable().optional(),
        question: z.string().min(5).max(600),
        expectedAnswer: z.string().min(2).max(1200),
        format: z.enum(['ORAL', 'WRITTEN', 'QUICK_FIRE']),
      }),
    )
    .min(1)
    .max(40),
  activities: z
    .array(
      z.object({
        sliceKey: z.string().regex(/^s\d{1,2}$/).nullable().optional(),
        title: z.string().min(2).max(160),
        description: z.string().min(10).max(1200),
        participationTechnique: z.string().min(10).max(800),
        materials: z.string().max(300).optional().nullable(),
      }),
    )
    .min(1)
    .max(8),
  revisionPoints: z
    .array(
      z.object({
        sliceKey: z.string().regex(/^s\d{1,2}$/).nullable().optional(),
        point: z.string().min(5).max(400),
      }),
    )
    .min(1)
    .max(30),
});

export type ChapterTeachingPackOutput = z.infer<typeof ChapterTeachingPackSchema>;
