import { LessonStage } from '@prisma/client';
import { z } from 'zod';

export const PlannerChapterAnalysisSchema = z.object({
  complexity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  objectives: z.array(z.string().min(3).max(300)).min(1).max(12),
  prerequisites: z.array(z.string().max(200)).max(10).default([]),
  portions: z
    .array(
      z.object({
        portionKey: z.string().regex(/^p\d{1,3}$/),
        title: z.string().min(2).max(160),
        contentAnchor: z.string().min(8).max(120),
        kind: z.enum([
          'CONCEPT',
          'READING',
          'EXERCISE_SET',
          'PRACTICAL',
          'RECITATION',
          'GRAMMAR',
          'VOCABULARY',
          'ASSESSMENT',
        ]),
        stages: z
          .array(
            z.object({
              stage: z.nativeEnum(LessonStage),
              minutes: z.number().int().min(3).max(240),
            }),
          )
          .min(1)
          .max(8),
        minMinutes: z.number().int().min(3),
        maxMinutes: z.number().int().max(600),
        dependsOn: z.array(z.string()).max(6).default([]),
        exerciseCount: z.number().int().min(0).max(200).default(0),
        compressible: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(40),
  activitySuggestions: z
    .array(
      z.object({
        title: z.string().max(160),
        description: z.string().max(600),
        minutes: z.number().int().min(5).max(120),
        afterPortionKey: z.string().nullable(),
      }),
    )
    .max(5)
    .default([]),
  revisionMinutes: z.number().int().min(0).max(240).default(0),
  assessmentMinutes: z.number().int().min(0).max(240).default(0),
  practicalRequirements: z.array(z.string().max(200)).max(6).default([]),
  notes: z.array(z.string().max(300)).max(6).default([]),
});

export type PlannerChapterAnalysis = z.infer<typeof PlannerChapterAnalysisSchema>;
