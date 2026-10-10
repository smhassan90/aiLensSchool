import type { QuizOutput, QuizQuestionOutput } from './schemas/quiz-output.schema';

function clampDifficulty(level?: number): number {
  if (!level || !Number.isFinite(level)) return 5;
  return Math.min(10, Math.max(1, Math.round(level)));
}

export function difficultyInstruction(level?: number) {
  if (!level) return '';
  const d = clampDifficulty(level);
  if (d <= 3) {
    return `Difficulty: ${d}/10 (easy — direct recall, simple wording, obvious distractors).`;
  }
  if (d <= 6) {
    return `Difficulty: ${d}/10 (medium — application and clear reasoning).`;
  }
  if (d <= 8) {
    return `Difficulty: ${d}/10 (challenging — analysis, multi-step thinking).`;
  }
  return `Difficulty: ${d}/10 (hard — synthesis, subtle distractors, higher-order thinking).`;
}

/**
 * Detailed exam difficulty rules. Level 1 = easiest, 10 = hardest.
 * Intermediate levels blend toward the nearer extreme.
 */
export function examDifficultyInstructions(level?: number): string {
  const d = clampDifficulty(level);
  const band =
    d <= 3 ? 'EASY' : d <= 6 ? 'MEDIUM' : d <= 8 ? 'HARD' : 'HARDEST';

  return `EXAM DIFFICULTY TARGET: ${d}/10 (${band}). Apply ALL of the following for this level.

MCQ ("choose the best answer"):
- Level 1–3 (easiest): Stem is a sentence taken nearly verbatim from the lesson. Four options; distractors are clearly different / unrelated. Exactly one option is the exact match from the lesson.
- Level 4–6: Stem mostly from lesson ideas with light rephrasing. Distractors plausible but not near-duplicates.
- Level 7–10 (hardest): Stem must NOT copy lesson wording — rephrase the meaning/idea in other words. All four options must be similar / close in meaning so the correct one is hard to spot; only one is truly correct.

FILL_IN_THE_BLANK:
- Level 1–3: Exactly one _____ blank; answer is one word taken from the lesson wording.
- Level 4–6: Usually one blank; may use one paraphrased sentence.
- Level 7–10: Prefer 2–3 blanks in one question (maximum 3 _____). Each blank is exactly ONE word. correctAnswer lists answers in order separated by " | " (e.g. "dignity | work | respect"). Never put more than one word in a single blank.

SHORT_ANSWER:
- Level 1–3: Very short question using lesson wording; model answer is short and drawn from the text.
- Level 4–6: Short applied questions; answer still grounded in the lesson.
- Level 7–10: Ask about the idea/meaning of the lesson in fresh wording (not copied phrases). Model answer explains the idea, not a quote.

LONG_ANSWER:
- Level 1–3: Prompt is not too long; expects a short paragraph from lesson facts.
- Level 4–6: Moderate length prompt and answer.
- Level 7–10: Longer, demanding prompt (analysis / explain / compare ideas); model answer is a fuller paragraph.

TRUE_FALSE (if requested): Scale similarly — easy statements near the text; hard ones rephrase subtle ideas so True/False is less obvious.

Scale intensity continuously with ${d}/10 — do not jump to max hardness unless the level is 9–10.`;
}

export function examChapterWeightInstructions(): string {
  return `CHAPTER WEIGHTAGE & WITHIN-CHAPTER COVERAGE (critical):
Each lecture block may include Pages/photos, Content size, Weight hint (MAJOR / STANDARD / MINOR), Key points, Section checklist, and Formulas & symbols.
- Allocate MORE questions to MAJOR / longer chapters (many pages, rich content).
- Allocate FEWER questions to MINOR / short chapters (1–2 pages, thin content).
- Do NOT give equal counts per chapter when sizes differ.
- WITHIN one chapter/lesson: spread questions across the Section checklist and Key points. Forbidden: almost all questions from one subsection while another main part (definitions, formulas, worked examples, numericals, summary) has none.
- If Formulas & symbols are listed (λ, π, √, v = f × λ, period/frequency relations, units, etc.), include questions that assess those — FIB/MCQ/SHORT_ANSWER with formula use or symbol meaning — not only prose definitions.
- Within each question type, INTERLEAVE chapters and sections — never dump several questions from the same chapter/section in a row.
- After choosing counts, SHUFFLE the final order inside each typed section so the paper does not follow chapter sequence.`;
}

export type QuizMixRequest = {
  quickGenerate?: boolean;
  examPaper?: boolean;
  difficulty?: number;
  mcqCount?: number;
  fillBlankCount?: number;
  /** Open-ended questions on exam papers (legacy — use shortAnswerCount + longAnswerCount). */
  openEndedCount?: number;
  shortAnswerCount?: number;
  longAnswerCount?: number;
  trueFalseCount?: number;
  questionCount?: number;
  mcqMarks?: number;
  trueFalseMarks?: number;
  openEndedMarks?: number;
  shortAnswerMarks?: number;
  longAnswerMarks?: number;
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
      shortAnswerCount: number;
      longAnswerCount: number;
      openEndedCount: number;
      questionCount: number;
      mcqMarks: number;
      trueFalseMarks: number;
      openEndedMarks: number;
      shortAnswerMarks: number;
      longAnswerMarks: number;
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
  const shortAnswerCount = countOf(
    input.shortAnswerCount ?? (input.examPaper ? input.openEndedCount : 0),
  );
  const longAnswerCount = countOf(input.longAnswerCount);
  const openEndedCount = shortAnswerCount + longAnswerCount;

  if (input.examPaper) {
    const questionCount = mcqCount + fillBlankCount + trueFalseCount + openEndedCount;
    const mix =
      questionCount > 0
        ? { mcqCount, fillBlankCount, trueFalseCount, shortAnswerCount, longAnswerCount, openEndedCount, questionCount }
        : { mcqCount: 8, fillBlankCount: 0, trueFalseCount: 5, shortAnswerCount: 3, longAnswerCount: 1, openEndedCount: 4, questionCount: 17 };
    return {
      mode: 'exam',
      ...mix,
      mcqMarks: mix.mcqCount ? marksOf(input.mcqMarks, 1) : 0,
      trueFalseMarks: mix.trueFalseCount ? marksOf(input.trueFalseMarks, 1) : 0,
      openEndedMarks: mix.openEndedCount ? marksOf(input.openEndedMarks, 3) : 0,
      shortAnswerMarks: mix.shortAnswerCount
        ? marksOf(input.shortAnswerMarks ?? input.openEndedMarks, 3)
        : 0,
      longAnswerMarks: mix.longAnswerCount ? marksOf(input.longAnswerMarks, 5) : 0,
      fillBlankMarks: mix.fillBlankCount ? marksOf(input.fillBlankMarks, 1) : 0,
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
- FILL_IN_THE_BLANK = a sentence with one _____ blank and a single-word correctAnswer (one word only; letters or a number; app matches case-insensitively).
- TRUE_FALSE = statement; correctAnswer must be TRUE or FALSE; include two options TRUE/FALSE with exactly one isCorrect.
Never create SHORT_ANSWER, open-ended, or essay questions. Do not ask students to explain, describe, or write a paragraph.
Every question MUST include correctAnswer.`;
  }

  if (mix.mode === 'exam') {
    const mcqSectionMarks = mix.mcqCount * mix.mcqMarks;
    const tfSectionMarks = mix.trueFalseCount * mix.trueFalseMarks;
    const fillSectionMarks = mix.fillBlankCount * mix.fillBlankMarks;
    const shortSectionMarks = mix.shortAnswerCount * mix.shortAnswerMarks;
    const longSectionMarks = mix.longAnswerCount * mix.longAnswerMarks;
    return `This is a formal written exam paper for printout, not an app quiz.
Write as a senior subject teacher: every question should check main learning and help the student understand the chapter.
Cover the provided lectures with WEIGHTAGE by chapter size/importance AND even section coverage (see chapter weight rules). Use Formulas & symbols and Key points when present.
Generate EXACTLY ${mix.questionCount} questions as typed sections (Section A, B, …). Inside each section, SHUFFLE so consecutive items are not from the same chapter or the same lesson subsection:
- ${mix.mcqCount} MCQ questions (type MCQ). Section A. Each MUST have 4 options, exactly one isCorrect, and correctAnswer set. Each question is worth ${mix.mcqMarks} marks (section total ${mcqSectionMarks}).
- ${mix.trueFalseCount} true/false questions (type TRUE_FALSE). Section B. correctAnswer must be TRUE or FALSE. Each question is worth ${mix.trueFalseMarks} marks (section total ${tfSectionMarks}).
${mix.fillBlankCount ? `- ${mix.fillBlankCount} fill-in-the-blank questions (type FILL_IN_THE_BLANK). Use 1–3 _____ blanks per difficulty rules; each blank is one word; multi-blank correctAnswer uses " | " between words. Each question is worth ${mix.fillBlankMarks} marks (section total ${fillSectionMarks}).` : ''}
- ${mix.shortAnswerCount} short-answer questions (type SHORT_ANSWER). Length/wording follow difficulty rules. Include model correctAnswer. Each question is worth ${mix.shortAnswerMarks} marks (section total ${shortSectionMarks}).
- ${mix.longAnswerCount} long-answer questions (type LONG_ANSWER). Prompt length follows difficulty rules. Include model correctAnswer. Each question is worth ${mix.longAnswerMarks} marks (section total ${longSectionMarks}).
Skip a type if its count is 0.
Set marks on every question to the per-question value for its section (do not split section totals across questions).`;
  }

  return `Generate EXACTLY ${mix.questionCount} AUTO-GRADABLE questions, in this order:
- ${mix.mcqCount} choose-the-best-answer questions (type MCQ). Each MUST have 4 options, exactly one isCorrect true, and correctAnswer set.
- ${mix.fillBlankCount} fill-in-the-blank questions (type FILL_IN_THE_BLANK). One _____ per question; correctAnswer must be exactly one word (no spaces).
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
  if (!answer || /\n/.test(answer) || /\s/.test(answer)) return false;
  const words = answer.split(/\s+/).filter(Boolean);
  return words.length === 1 && answer.length <= 40;
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
    return isShortExactAnswer(answer) && /_____/.test(q.questionText);
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

function applyMarksEach(questions: QuizQuestionOutput[], marksEach: number): QuizQuestionOutput[] {
  if (!questions.length) return questions;
  const each = marksEach > 0 ? marksEach : 1;
  return questions.map((question) => ({ ...question, marks: each }));
}

export function sectionLabelForQuestionType(
  type: string,
  presentTypes: string[],
): string {
  const order = ['MCQ', 'TRUE_FALSE', 'FILL_IN_THE_BLANK', 'SHORT_ANSWER', 'LONG_ANSWER'];
  const active = order.filter((item) => presentTypes.includes(item));
  const index = active.indexOf(type);
  if (index < 0) return 'Section A';
  return `Section ${String.fromCharCode(65 + index)}`;
}

/** Fisher–Yates shuffle (in place). */
export function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function sanitizeGeneratedExam(quiz: QuizOutput, mix: Extract<ResolvedQuizMix, { mode: 'exam' }>): QuizOutput {
  const questions = quiz.questions
    .map(normalizeGeneratedQuestion)
    .filter((question) =>
      ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'LONG_ANSWER', 'FILL_IN_THE_BLANK'].includes(question.type),
    );

  // Keep section order for print layout, but shuffle within each type so
  // consecutive questions are not stuck in chapter sequence.
  const mcqs = shuffleInPlace(
    applyMarksEach(
      questions.filter((question) => question.type === 'MCQ'),
      mix.mcqMarks,
    ),
  );
  const trueFalse = shuffleInPlace(
    applyMarksEach(
      questions.filter((question) => question.type === 'TRUE_FALSE'),
      mix.trueFalseMarks,
    ),
  );
  const fillBlanks = shuffleInPlace(
    applyMarksEach(
      questions.filter((question) => question.type === 'FILL_IN_THE_BLANK'),
      mix.fillBlankMarks,
    ),
  );
  const shortAnswers = shuffleInPlace(
    applyMarksEach(
      questions.filter((question) => question.type === 'SHORT_ANSWER'),
      mix.shortAnswerMarks || mix.openEndedMarks,
    ),
  );
  const longAnswers = shuffleInPlace(
    applyMarksEach(
      questions.filter((question) => question.type === 'LONG_ANSWER'),
      mix.longAnswerMarks,
    ),
  );

  const ordered = [...mcqs, ...trueFalse, ...fillBlanks, ...shortAnswers, ...longAnswers];
  if (!ordered.length) {
    throw new Error('Exam generation produced no questions. Please try again.');
  }
  return { ...quiz, questions: ordered };
}
