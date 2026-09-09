import type { QuizQuestionOutput } from './schemas/quiz-output.schema';

export type QuizMixRequest = {
  quickGenerate?: boolean;
  mcqCount?: number;
  fillBlankCount?: number;
  /** @deprecated Use trueFalseCount — open-ended short answers are not auto-gradable. */
  shortAnswerCount?: number;
  trueFalseCount?: number;
  questionCount?: number;
};

export type ResolvedQuizMix =
  | { mode: 'quick'; questionCount: number }
  | {
      mode: 'custom';
      mcqCount: number;
      fillBlankCount: number;
      trueFalseCount: number;
      questionCount: number;
    };

export function resolveQuizMix(input: QuizMixRequest): ResolvedQuizMix {
  const mcqCount = Math.max(0, Math.floor(input.mcqCount ?? 0));
  const fillBlankCount = Math.max(0, Math.floor(input.fillBlankCount ?? 0));
  const trueFalseCount = Math.max(
    0,
    Math.floor(input.trueFalseCount ?? input.shortAnswerCount ?? 0),
  );
  const customTotal = mcqCount + fillBlankCount + trueFalseCount;

  if (input.quickGenerate || customTotal === 0) {
    return {
      mode: 'quick',
      questionCount: Math.min(Math.max(input.questionCount ?? 8, 3), 20),
    };
  }

  return { mode: 'custom', mcqCount, fillBlankCount, trueFalseCount, questionCount: customTotal };
}

export function quizMixInstructions(mix: ResolvedQuizMix): string {
  if (mix.mode === 'quick') {
    return `Quick generate: choose a sensible mix of AUTO-GRADABLE question types only.
Use only these types (never SHORT_ANSWER or open-ended):
- MCQ = choose the best answer. Exactly 4 options, exactly one isCorrect true. Set correctAnswer to the correct option text.
- FILL_IN_THE_BLANK = a sentence with _____ and a short exact correctAnswer (1-4 words).
- TRUE_FALSE = statement; correctAnswer must be TRUE or FALSE; include two options TRUE/FALSE with one isCorrect.
About ${mix.questionCount} questions total. Every question MUST include correctAnswer so the system can mark automatically.`;
  }

  return `Generate EXACTLY ${mix.questionCount} AUTO-GRADABLE questions, in this order:
- ${mix.mcqCount} choose-the-best-answer questions (type MCQ). Each MUST have 4 options, exactly one isCorrect true, and correctAnswer set.
- ${mix.fillBlankCount} fill-in-the-blank questions (type FILL_IN_THE_BLANK). Put _____ in the question and set a short exact correctAnswer.
- ${mix.trueFalseCount} true/false questions (type TRUE_FALSE). correctAnswer must be TRUE or FALSE with matching options.
Skip a type if its count is 0. Do NOT create SHORT_ANSWER or open-ended questions. Every question MUST include correctAnswer.`;
}

export function mockQuestionsForMix(subjectName: string | undefined, mix: ResolvedQuizMix) {
  const subject = subjectName ?? 'Subject';
  const counts =
    mix.mode === 'custom'
      ? mix
      : (() => {
          const mcqCount = Math.max(1, Math.round(mix.questionCount * 0.5));
          const fillBlankCount = Math.max(0, Math.round(mix.questionCount * 0.25));
          const trueFalseCount = Math.max(0, mix.questionCount - mcqCount - fillBlankCount);
          return { mcqCount, fillBlankCount, trueFalseCount };
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
    ...Array.from({ length: counts.trueFalseCount }, (_, i) => ({
      type: 'TRUE_FALSE' as const,
      questionText: `${subject} — true or false ${i + 1}: This lesson’s main idea is important.`,
      marks: 1,
      correctAnswer: 'TRUE',
      options: [
        { optionText: 'TRUE', isCorrect: true },
        { optionText: 'FALSE', isCorrect: false },
      ],
    })),
  ];

  return questions;
}

export function normalizeGeneratedQuestion(q: QuizQuestionOutput): QuizQuestionOutput {
  const type = q.type;
  const options = [...(q.options ?? [])];
  const marked = options.find((opt) => opt.isCorrect)?.optionText?.trim();
  let correctAnswer = (q.correctAnswer ?? marked ?? '').trim();

  if (type === 'TRUE_FALSE') {
    const yes = /^(true|t|yes)$/i.test(correctAnswer);
    const no = /^(false|f|no)$/i.test(correctAnswer);
    correctAnswer = yes ? 'TRUE' : no ? 'FALSE' : correctAnswer.toUpperCase() || 'TRUE';
    return {
      ...q,
      type,
      correctAnswer,
      options: [
        { optionText: 'TRUE', isCorrect: correctAnswer === 'TRUE' },
        { optionText: 'FALSE', isCorrect: correctAnswer === 'FALSE' },
      ],
    };
  }

  if (type === 'MCQ') {
    if (options.length && !options.some((opt) => opt.isCorrect) && correctAnswer) {
      const match = correctAnswer.toLowerCase();
      for (const opt of options) {
        opt.isCorrect = opt.optionText.trim().toLowerCase() === match;
      }
    }
    if (!correctAnswer) {
      correctAnswer = options.find((opt) => opt.isCorrect)?.optionText?.trim() ?? '';
    }
    return { ...q, type, correctAnswer, options };
  }

  // FILL_IN_THE_BLANK
  if (!correctAnswer && marked) correctAnswer = marked;
  return { ...q, type, correctAnswer, options: options.length ? options : undefined };
}
