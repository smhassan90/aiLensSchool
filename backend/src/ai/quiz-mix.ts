import type { QuizOutput, QuizQuestionOutput } from './schemas/quiz-output.schema';

export type QuizMixRequest = {
  quickGenerate?: boolean;
  examPaper?: boolean;
  mcqCount?: number;
  fillBlankCount?: number;
  /** Open-ended questions on exam papers. Also accepted as shortAnswerCount. */
  openEndedCount?: number;
  /** @deprecated Use trueFalseCount for quizzes, openEndedCount for exam papers. */
  shortAnswerCount?: number;
  trueFalseCount?: number;
  questionCount?: number;
  mcqMarks?: number;
  trueFalseMarks?: number;
  openEndedMarks?: number;
  fillBlankMarks?: number;
};

export type ResolvedQuizMix =
  | { mode: 'quick'; questionCount: number }
  | {
      mode: 'custom';
      mcqCount: number;
      fillBlankCount: number;
      trueFalseCount: number;
      questionCount: number;
    }
  | {
      mode: 'exam';
      mcqCount: number;
      fillBlankCount: number;
      trueFalseCount: number;
      openEndedCount: number;
      questionCount: number;
      mcqMarks: number;
      trueFalseMarks: number;
      openEndedMarks: number;
      fillBlankMarks: number;
    };

const AUTO_GRADABLE_TYPES = new Set(['MCQ', 'TRUE_FALSE', 'FILL_IN_THE_BLANK']);

function countOf(value?: number) {
  return Math.max(0, Math.floor(value ?? 0));
}

function marksOf(value: number | undefined, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 100) / 100;
}

export function resolveQuizMix(input: QuizMixRequest): ResolvedQuizMix {
  const mcqCount = countOf(input.mcqCount);
  const fillBlankCount = countOf(input.fillBlankCount);
  const trueFalseCount = countOf(input.trueFalseCount);
  const openEndedCount = countOf(input.openEndedCount ?? (input.examPaper ? input.shortAnswerCount : 0));

  if (input.examPaper) {
    const questionCount = mcqCount + fillBlankCount + trueFalseCount + openEndedCount;
    const mix =
      questionCount > 0
        ? { mcqCount, fillBlankCount, trueFalseCount, openEndedCount, questionCount }
        : { mcqCount: 8, fillBlankCount: 0, trueFalseCount: 5, openEndedCount: 4, questionCount: 17 };
    return {
      mode: 'exam',
      ...mix,
      mcqMarks: marksOf(input.mcqMarks, mix.mcqCount),
      trueFalseMarks: marksOf(input.trueFalseMarks, mix.trueFalseCount),
      openEndedMarks: marksOf(input.openEndedMarks, mix.openEndedCount * 5 || 0),
      fillBlankMarks: marksOf(input.fillBlankMarks, mix.fillBlankCount),
    };
  }

  const quizTrueFalse = countOf(input.trueFalseCount ?? input.shortAnswerCount);
  const customTotal = mcqCount + fillBlankCount + quizTrueFalse;

  if (input.quickGenerate || customTotal === 0) {
    return {
      mode: 'quick',
      questionCount: Math.min(Math.max(input.questionCount ?? 8, 3), 20),
    };
  }

  return {
    mode: 'custom',
    mcqCount,
    fillBlankCount,
    trueFalseCount: quizTrueFalse,
    questionCount: customTotal,
  };
}

export function quizMixInstructions(mix: ResolvedQuizMix): string {
  if (mix.mode === 'quick') {
    return `Quick generate: about ${mix.questionCount} questions.
Use ONLY auto-gradable types the system can mark itself:
- MCQ = choose the best answer. Exactly 4 options, exactly one isCorrect true. Set correctAnswer to that option text.
- FILL_IN_THE_BLANK = a sentence with _____ and a short exact correctAnswer (1-4 words, a fact/word/number the app can match).
- TRUE_FALSE = statement; correctAnswer must be TRUE or FALSE; include two options TRUE/FALSE with exactly one isCorrect.
Never create SHORT_ANSWER, open-ended, or essay questions. Do not ask students to explain, describe, or write a paragraph.
Every question MUST include correctAnswer.`;
  }

  if (mix.mode === 'exam') {
    return `This is a formal written exam paper for printout, not an app quiz.
Cover ALL provided lectures. Do not invent unrelated chapters.
Generate EXACTLY ${mix.questionCount} questions, in this order:
- ${mix.mcqCount} MCQ questions (type MCQ). Each MUST have 4 options, exactly one isCorrect, and correctAnswer set. Section total ${mix.mcqMarks} marks.
- ${mix.trueFalseCount} true/false questions (type TRUE_FALSE). correctAnswer must be TRUE or FALSE. Section total ${mix.trueFalseMarks} marks.
- ${mix.openEndedCount} open-ended questions (type SHORT_ANSWER). These are marked by the teacher. Ask students to explain, define, or write a short answer. Include a model correctAnswer for the answer key. Section total ${mix.openEndedMarks} marks.
${mix.fillBlankCount ? `- ${mix.fillBlankCount} fill-in-the-blank questions (type FILL_IN_THE_BLANK). Section total ${mix.fillBlankMarks} marks.` : 'Skip FILL_IN_THE_BLANK unless listed above.'}
Skip a type if its count is 0.
Set each question's marks so the section totals match.`;
  }

  return `Generate EXACTLY ${mix.questionCount} AUTO-GRADABLE questions, in this order:
- ${mix.mcqCount} choose-the-best-answer questions (type MCQ). Each MUST have 4 options, exactly one isCorrect true, and correctAnswer set.
- ${mix.fillBlankCount} fill-in-the-blank questions (type FILL_IN_THE_BLANK). Put _____ in the question and set a short exact correctAnswer (1-4 words).
- ${mix.trueFalseCount} true/false questions (type TRUE_FALSE). correctAnswer must be TRUE or FALSE with matching options.
Skip a type if its count is 0.
Never create SHORT_ANSWER, open-ended, or essay questions. Every question MUST include correctAnswer.`;
}

export function mockQuestionsForMix(subjectName: string | undefined, mix: ResolvedQuizMix) {
  const subject = subjectName ?? 'Subject';
  const counts =
    mix.mode === 'custom' || mix.mode === 'exam'
      ? mix
      : (() => {
          const mcqCount = Math.max(1, Math.round(mix.questionCount * 0.5));
          const fillBlankCount = Math.max(0, Math.round(mix.questionCount * 0.25));
          const trueFalseCount = Math.max(0, mix.questionCount - mcqCount - fillBlankCount);
          return { mcqCount, fillBlankCount, trueFalseCount, openEndedCount: 0 };
        })();
  const openEndedCount = mix.mode === 'exam' ? mix.openEndedCount : 0;

  return [
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
    ...Array.from({ length: openEndedCount }, (_, i) => ({
      type: 'SHORT_ANSWER' as const,
      questionText: `${subject} — open-ended ${i + 1}: Explain the main idea of the lectures in your own words.`,
      marks: 5,
      correctAnswer: 'Students should explain the key idea from the selected lectures.',
    })),
  ];
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

  if (!correctAnswer && marked) correctAnswer = marked;
  return { ...q, type, correctAnswer, options: options.length ? options : undefined };
}

function isShortExactAnswer(value: string): boolean {
  const answer = value.trim();
  if (!answer || /\n/.test(answer)) return false;
  const words = answer.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 6 && answer.length <= 80;
}

function coerceToAutoGradable(q: QuizQuestionOutput): QuizQuestionOutput {
  if (AUTO_GRADABLE_TYPES.has(q.type)) return q;
  if ((q.options?.length ?? 0) >= 2) {
    return normalizeGeneratedQuestion({ ...q, type: 'MCQ' });
  }
  if (isShortExactAnswer(q.correctAnswer ?? '')) {
    return normalizeGeneratedQuestion({ ...q, type: 'FILL_IN_THE_BLANK' });
  }
  return q;
}

export function isAutoGradableQuestion(q: QuizQuestionOutput): boolean {
  const answer = q.correctAnswer?.trim();
  if (!answer) return false;
  const options = q.options ?? [];
  const correctCount = options.filter((opt) => opt.isCorrect).length;
  if (q.type === 'TRUE_FALSE') {
    return options.length === 2 && correctCount === 1;
  }
  if (q.type === 'MCQ') {
    return options.length >= 2 && correctCount === 1;
  }
  if (q.type === 'FILL_IN_THE_BLANK') {
    return isShortExactAnswer(answer);
  }
  return false;
}

export function sanitizeGeneratedQuiz(quiz: QuizOutput): QuizOutput {
  const questions = quiz.questions
    .map(normalizeGeneratedQuestion)
    .map(coerceToAutoGradable)
    .filter(isAutoGradableQuestion);

  if (!questions.length) {
    throw new Error('Quiz generation produced no auto-gradable questions. Please try again.');
  }

  return { ...quiz, questions };
}

function distributeMarks(questions: QuizQuestionOutput[], totalMarks: number): QuizQuestionOutput[] {
  if (!questions.length || totalMarks <= 0) return questions;
  const base = Math.floor((totalMarks / questions.length) * 100) / 100;
  let used = 0;
  return questions.map((question, index) => {
    const marks = index === questions.length - 1 ? Math.round((totalMarks - used) * 100) / 100 : base;
    used += marks;
    return { ...question, marks: Math.max(0.5, marks) };
  });
}

export function sanitizeGeneratedExam(quiz: QuizOutput, mix: Extract<ResolvedQuizMix, { mode: 'exam' }>): QuizOutput {
  const questions = quiz.questions
    .map(normalizeGeneratedQuestion)
    .filter((question) => ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'FILL_IN_THE_BLANK'].includes(question.type));

  const mcqs = distributeMarks(
    questions.filter((question) => question.type === 'MCQ'),
    mix.mcqMarks,
  );
  const trueFalse = distributeMarks(
    questions.filter((question) => question.type === 'TRUE_FALSE'),
    mix.trueFalseMarks,
  );
  const openEnded = distributeMarks(
    questions.filter((question) => question.type === 'SHORT_ANSWER'),
    mix.openEndedMarks,
  );
  const fillBlanks = distributeMarks(
    questions.filter((question) => question.type === 'FILL_IN_THE_BLANK'),
    mix.fillBlankMarks,
  );

  const ordered = [...mcqs, ...trueFalse, ...fillBlanks, ...openEnded];
  if (!ordered.length) {
    throw new Error('Exam generation produced no questions. Please try again.');
  }
  return { ...quiz, questions: ordered };
}
