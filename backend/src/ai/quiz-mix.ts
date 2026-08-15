import type { QuizQuestionOutput } from './schemas/quiz-output.schema';

export type QuizMixRequest = {
  quickGenerate?: boolean;
  mcqCount?: number;
  fillBlankCount?: number;
  shortAnswerCount?: number;
  questionCount?: number;
};

export type ResolvedQuizMix =
  | { mode: 'quick'; questionCount: number }
  | {
      mode: 'custom';
      mcqCount: number;
      fillBlankCount: number;
      shortAnswerCount: number;
      questionCount: number;
    };

export function resolveQuizMix(input: QuizMixRequest): ResolvedQuizMix {
  const mcqCount = Math.max(0, Math.floor(input.mcqCount ?? 0));
  const fillBlankCount = Math.max(0, Math.floor(input.fillBlankCount ?? 0));
  const shortAnswerCount = Math.max(0, Math.floor(input.shortAnswerCount ?? 0));
  const customTotal = mcqCount + fillBlankCount + shortAnswerCount;

  if (input.quickGenerate || customTotal === 0) {
    return {
      mode: 'quick',
      questionCount: Math.min(Math.max(input.questionCount ?? 8, 3), 20),
    };
  }

  return { mode: 'custom', mcqCount, fillBlankCount, shortAnswerCount, questionCount: customTotal };
}

export function quizMixInstructions(mix: ResolvedQuizMix): string {
  if (mix.mode === 'quick') {
    return `Quick generate: choose a sensible mix of question types for these topics.
Use only these types:
- MCQ = choose the best answer. Exactly 4 options, exactly one isCorrect true.
- FILL_IN_THE_BLANK = a sentence with _____ and correctAnswer filled in.
- SHORT_ANSWER = simple text answer with correctAnswer filled in.
About ${mix.questionCount} questions total. Pick the mix you judge best.`;
  }

  return `Generate EXACTLY ${mix.questionCount} questions, in this order:
- ${mix.mcqCount} choose-the-best-answer questions (type MCQ). Each MUST have 4 options and exactly one isCorrect true.
- ${mix.fillBlankCount} fill-in-the-blank questions (type FILL_IN_THE_BLANK). Put _____ in the question and set correctAnswer.
- ${mix.shortAnswerCount} simple text questions (type SHORT_ANSWER). Set correctAnswer to the expected answer.
Skip a type if its count is 0. Do not add extra questions or TRUE_FALSE questions.`;
}

export function mockQuestionsForMix(subjectName: string | undefined, mix: ResolvedQuizMix) {
  const subject = subjectName ?? 'Subject';
  const counts =
    mix.mode === 'custom'
      ? mix
      : (() => {
          const mcqCount = Math.max(1, Math.round(mix.questionCount * 0.5));
          const fillBlankCount = Math.max(0, Math.round(mix.questionCount * 0.25));
          const shortAnswerCount = Math.max(0, mix.questionCount - mcqCount - fillBlankCount);
          return { mcqCount, fillBlankCount, shortAnswerCount };
        })();

  const questions = [
    ...Array.from({ length: counts.mcqCount }, (_, i) => ({
      type: 'MCQ' as const,
      questionText: `${subject} — choose the best answer ${i + 1}: What is the main idea?`,
      marks: 1,
      correctAnswer: 'Option A',
      options: [
        { optionText: 'Option A', isCorrect: true },
        { optionText: 'Option B', isCorrect: false },
        { optionText: 'Option C', isCorrect: false },
        { optionText: 'Option D', isCorrect: false },
      ],
    })),
    ...Array.from({ length: counts.fillBlankCount }, (_, i) => ({
      type: 'FILL_IN_THE_BLANK' as const,
      questionText: `${subject} — fill in the blank ${i + 1}: The key idea is _____.`,
      marks: 1,
      correctAnswer: 'concept',
    })),
    ...Array.from({ length: counts.shortAnswerCount }, (_, i) => ({
      type: 'SHORT_ANSWER' as const,
      questionText: `${subject} — simple text ${i + 1}: Explain the main idea in one sentence.`,
      marks: 2,
      correctAnswer: 'A short explanation of the main idea.',
    })),
  ];

  return questions;
}

export function normalizeGeneratedQuestion(q: QuizQuestionOutput): QuizQuestionOutput {
  const options = [...(q.options ?? [])];
  const marked = options.find((opt) => opt.isCorrect)?.optionText?.trim();
  let correctAnswer = (q.correctAnswer ?? marked ?? '').trim();

  if (q.type === 'TRUE_FALSE') {
    const yes = /^(true|t|yes)$/i.test(correctAnswer);
    const no = /^(false|f|no)$/i.test(correctAnswer);
    correctAnswer = yes ? 'TRUE' : no ? 'FALSE' : correctAnswer.toUpperCase() || 'TRUE';
    return {
      ...q,
      correctAnswer,
      options: [
        { optionText: 'TRUE', isCorrect: correctAnswer === 'TRUE' },
        { optionText: 'FALSE', isCorrect: correctAnswer === 'FALSE' },
      ],
    };
  }

  if (options.length && !options.some((opt) => opt.isCorrect) && correctAnswer) {
    const match = correctAnswer.toLowerCase();
    for (const opt of options) {
      opt.isCorrect = opt.optionText.trim().toLowerCase() === match;
    }
  }

  if (!correctAnswer) {
    correctAnswer = options.find((opt) => opt.isCorrect)?.optionText?.trim() ?? '';
  }

  return { ...q, correctAnswer, options };
}
