import {
  buildHomeworkQuestions,
  labelMcqOptionsAbcd,
  singleWordFillAnswer,
} from './homework-questions';
import { randomUUID } from 'crypto';

describe('homework question policy', () => {
  it('clamps fill-in-the-blank answers to one word', () => {
    expect(singleWordFillAnswer('missing numbers')).toBe('missing');
    const questions = buildHomeworkQuestions(
      [
        {
          type: 'FILL_IN_THE_BLANK',
          questionText: 'The next number is _____.',
          marks: 1,
          correctAnswer: 'seven days',
        },
      ],
      [],
    );
    expect(questions[0]?.correctAnswer).toBe('seven');
  });

  it('labels MCQ options A through D', () => {
    const labeled = labelMcqOptionsAbcd([
      { id: randomUUID(), optionText: '12', isCorrect: true },
      { id: randomUUID(), optionText: 'B) 13', isCorrect: false },
      { id: randomUUID(), optionText: '14', isCorrect: false },
      { id: randomUUID(), optionText: '15', isCorrect: false },
    ]);
    expect(labeled.map((o) => o.optionText)).toEqual([
      'A) 12',
      'B) 13',
      'C) 14',
      'D) 15',
    ]);
  });
});
