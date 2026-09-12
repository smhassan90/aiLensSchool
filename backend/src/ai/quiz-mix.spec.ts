import {
  isAutoGradableQuestion,
  mockQuestionsForMix,
  resolveQuizMix,
  sanitizeGeneratedQuiz,
} from './quiz-mix';

describe('resolveQuizMix', () => {
  it('uses quick mix when no counts are provided', () => {
    expect(resolveQuizMix({})).toEqual({ mode: 'quick', questionCount: 8 });
  });

  it('keeps fill-in-the-blank as its own auto-gradable type', () => {
    expect(
      resolveQuizMix({
        mcqCount: 2,
        fillBlankCount: 3,
        trueFalseCount: 1,
      }),
    ).toEqual({
      mode: 'custom',
      mcqCount: 2,
      fillBlankCount: 3,
      trueFalseCount: 1,
      questionCount: 6,
    });
  });
});

describe('sanitizeGeneratedQuiz', () => {
  it('keeps MCQ, short fill-in-the-blank, and true/false', () => {
    const quiz = sanitizeGeneratedQuiz({
      title: 'Quiz',
      questions: [
        {
          type: 'MCQ',
          questionText: 'Pick one',
          marks: 1,
          correctAnswer: 'A',
          options: [
            { optionText: 'A', isCorrect: true },
            { optionText: 'B', isCorrect: false },
          ],
        },
        {
          type: 'FILL_IN_THE_BLANK',
          questionText: 'The capital of France is _____.',
          marks: 1,
          correctAnswer: 'Paris',
        },
        {
          type: 'FILL_IN_THE_BLANK',
          questionText: 'Write a paragraph about the water cycle.',
          marks: 5,
          correctAnswer:
            'Students should explain evaporation, condensation, precipitation and collection in several sentences.',
        },
        {
          type: 'TRUE_FALSE',
          questionText: 'Water boils at 100C.',
          marks: 1,
          correctAnswer: 'TRUE',
          options: [
            { optionText: 'TRUE', isCorrect: true },
            { optionText: 'FALSE', isCorrect: false },
          ],
        },
      ],
    });

    expect(quiz.questions.map((q) => q.type)).toEqual(['MCQ', 'FILL_IN_THE_BLANK', 'TRUE_FALSE']);
  });

  it('drops long open-ended answers', () => {
    expect(
      isAutoGradableQuestion({
        type: 'FILL_IN_THE_BLANK',
        questionText: 'Write a paragraph.',
        marks: 5,
        correctAnswer:
          'A long explanation covering many ideas that a teacher would have to read and judge.',
      }),
    ).toBe(false);
  });

  it('mock mix only includes auto-gradable types', () => {
    const questions = mockQuestionsForMix('Math', { mode: 'quick', questionCount: 8 });
    expect(questions.every((q) => ['MCQ', 'FILL_IN_THE_BLANK', 'TRUE_FALSE'].includes(q.type))).toBe(
      true,
    );
    expect(questions.some((q) => q.type === 'FILL_IN_THE_BLANK')).toBe(true);
  });
});
