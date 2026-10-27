import { z } from 'zod';

export const TeachingAssistanceModeSchema = z.enum([
  'PREPARE_LESSON',
  'EXPLAIN_TOPIC',
  'CREATE_QUESTIONS',
  'CLASSROOM_ACTIVITY',
  'DIFFERENTIATE',
]);

export type TeachingAssistanceMode = z.infer<typeof TeachingAssistanceModeSchema>;

export type TeachingHelpBasis = 'CHAPTER_TEXT' | 'OBJECTIVES_ONLY' | 'UNAVAILABLE';

const assessmentQuestionSchema = z.object({
  question: z.string().min(8).max(400),
  expectedAnswer: z.string().min(1).max(400),
  kind: z.enum(['recall', 'understanding', 'application']),
});

export const TeachingHelpOutputSchema = z.object({
  overview: z.object({
    subject: z.string().min(1).max(120),
    classLabel: z.string().min(1).max(120),
    lessonTitle: z.string().min(1).max(200),
    teachingOverview: z.string().min(20).max(1500),
    estimatedDurationMinutes: z.number().int().min(5).max(180).nullable().optional(),
    durationIsSuggestion: z.boolean().default(true),
  }),
  learningObjectives: z.array(z.string().min(8).max(300)).min(1).max(6),
  teacherExplanation: z.object({
    simpleExplanation: z.string().min(20).max(3000),
    stepByStep: z.array(z.string().min(8).max(600)).max(10).default([]),
    terminology: z
      .array(z.object({ term: z.string().min(1).max(80), definition: z.string().min(8).max(400) }))
      .max(12)
      .default([]),
    examples: z.array(z.string().min(8).max(500)).max(6).default([]),
  }),
  classroomDelivery: z.object({
    warmUp: z.string().min(8).max(800),
    teachingSteps: z.array(z.string().min(8).max(600)).min(1).max(10),
    questionsDuringLesson: z.array(z.string().min(8).max(300)).min(1).max(8),
    activity: z
      .object({
        title: z.string().min(3).max(160),
        materials: z.string().min(3).max(400),
        steps: z.array(z.string().min(8).max(400)).min(1).max(6),
        minutes: z.number().int().min(5).max(120),
      })
      .nullable()
      .default(null),
    recap: z.string().min(8).max(600),
  }),
  assessment: z.object({
    formativeQuestions: z.array(assessmentQuestionSchema).min(1).max(8),
    exitTicket: z.string().min(8).max(400),
  }),
  differentiation: z.object({
    struggling: z.array(z.string().min(8).max(400)).max(5).default([]),
    extension: z.array(z.string().min(8).max(400)).max(5).default([]),
  }),
  sourceAndConfidence: z.object({
    sourcesUsed: z.array(z.string().min(3).max(200)).min(1).max(6),
    sourceSupportedClaims: z.array(z.string().min(8).max(400)).max(8).default([]),
    pedagogicalSuggestions: z.array(z.string().min(8).max(400)).max(8).default([]),
    missingOrAmbiguous: z.array(z.string().min(8).max(400)).max(8).default([]),
    limitations: z.string().min(8).max(800),
  }),
});

export type TeachingHelpOutput = z.infer<typeof TeachingHelpOutputSchema>;
