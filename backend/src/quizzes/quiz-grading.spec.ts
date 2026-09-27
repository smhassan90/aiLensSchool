import { QuestionType } from '@prisma/client';
import { gradeQuizAnswer } from './quiz-grading';

describe('gradeQuizAnswer', () => {
  it('grades true/false from option selection when isCorrect is set', () => {
    const ok = gradeQuizAnswer(
      {
        type: QuestionType.TRUE_FALSE,
        correctAnswer: 'TRUE',
        options: [
          { id: 'a', optionText: 'TRUE', isCorrect: true },
          { id: 'b', optionText: 'FALSE', isCorrect: false },
        ],
      },
      { optionId: 'a', answerText: 'TRUE' },
    );
    expect(ok).toBe(true);
  });

  it('grades true/false when options lack isCorrect but correctAnswer is set', () => {
    const ok = gradeQuizAnswer(
      {
        type: QuestionType.TRUE_FALSE,
        correctAnswer: 'FALSE',
        options: [
          { id: 'a', optionText: 'TRUE', isCorrect: false },
          { id: 'b', optionText: 'FALSE', isCorrect: false },
        ],
      },
      { optionId: 'b', answerText: 'FALSE' },
    );
    expect(ok).toBe(true);
  });

  it('grades fill-in-the-blank case-insensitively', () => {
    expect(
      gradeQuizAnswer(
        {
          type: QuestionType.FILL_IN_THE_BLANK,
          correctAnswer: 'Paris',
          options: [],
        },
        { answerText: 'paris' },
      ),
    ).toBe(true);
  });
});
