import { z } from 'zod';

function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
  }
  return false;
}

const QuizOptionSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return { optionText: value, isCorrect: false };
  }
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    const optionText = String(
      item.optionText ?? item.text ?? item.label ?? item.value ?? item.option ?? '',
    ).trim();
    return {
      optionText,
      isCorrect: asBool(item.isCorrect ?? item.correct ?? item.is_correct ?? item.answer),
    };
  }
  return value;
}, z.object({
  optionText: z.string().min(1),
  isCorrect: z.boolean(),
}));

const QuestionTypeSchema = z.preprocess((value) => {
  const raw = String(value ?? 'MCQ')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (raw === 'TRUE/FALSE' || raw === 'TRUEFALSE' || raw === 'TF') return 'TRUE_FALSE';
  if (raw === 'FILL_BLANK' || raw === 'FILLINTHEBLANK' || raw === 'FIB') return 'FILL_IN_THE_BLANK';
  if (raw === 'SHORT' || raw === 'SA') return 'SHORT_ANSWER';
  if (raw === 'MULTIPLE_CHOICE' || raw === 'MULTIPLECHOICE') return 'MCQ';
  return raw;
}, z.enum(['MCQ', 'FILL_IN_THE_BLANK', 'TRUE_FALSE', 'SHORT_ANSWER']));

export const QuizQuestionOutputSchema = z.object({
  type: QuestionTypeSchema,
  questionText: z.string().min(1),
  marks: z.coerce.number().positive(),
  correctAnswer: z.string().optional(),
  options: z.array(QuizOptionSchema).optional(),
});

export const QuizOutputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  questions: z.array(QuizQuestionOutputSchema).min(1),
});

export type QuizOutput = z.infer<typeof QuizOutputSchema>;
export type QuizQuestionOutput = z.infer<typeof QuizQuestionOutputSchema>;
