import { z } from 'zod';

export const QuizQuestionOutputSchema = z.object({
  type: z.enum(['MCQ', 'FILL_IN_THE_BLANK', 'TRUE_FALSE', 'SHORT_ANSWER']),
  questionText: z.string(),
  marks: z.number().positive(),
  correctAnswer: z.string().optional(),
  options: z
    .array(
      z.object({
        optionText: z.string(),
        isCorrect: z.boolean(),
      }),
    )
    .optional(),
});

export const QuizOutputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  questions: z.array(QuizQuestionOutputSchema).min(1),
});

export type QuizOutput = z.infer<typeof QuizOutputSchema>;
export type QuizQuestionOutput = z.infer<typeof QuizQuestionOutputSchema>;
