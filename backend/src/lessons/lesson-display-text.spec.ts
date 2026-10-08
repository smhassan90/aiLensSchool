import { coerceLessonDisplayText } from './lesson-display-text';

describe('coerceLessonDisplayText', () => {
  it('returns plain lesson text unchanged', () => {
    expect(coerceLessonDisplayText('Page 53\n\nMissing Numbers')).toContain('Missing Numbers');
  });

  it('unwraps a lesson JSON blob to summary', () => {
    const blob = JSON.stringify(
      {
        chapterName: null,
        topicName: 'Missing Numbers',
        summary: 'Page 53\n\n**Missing Numbers**\n\nMissing numbers are gaps.',
        concepts: ['One idea'],
        pageFrom: 53,
        pageTo: 53,
      },
      null,
      2,
    );
    const out = coerceLessonDisplayText(blob);
    expect(out).toContain('**Missing Numbers**');
    expect(out).not.toContain('"concepts"');
  });

  it('strips trailing fenced JSON after OCR prose', () => {
    const fence = ['```', 'json'].join('');
    const mixed = [
      'pre-reading',
      '1. Have you seen a spider?',
      '',
      'King Bruce of Scotland flung himself down',
      '',
      fence,
      '{',
      '  "chapterName": "Unit 3",',
      '  "summary": "Exercise 5 only",',
      '  "concepts": ["Persistence"]',
      '}',
      '```',
    ].join('\n');
    const out = coerceLessonDisplayText(mixed);
    expect(out).toMatch(/flung himself/i);
    expect(out).not.toContain('"concepts"');
    expect(out).not.toContain('```');
  });

  it('unwraps compile JSON with lessonBody + exercises', () => {
    const blob = JSON.stringify({
      chapterName: 'Unit 3',
      lessonBody: 'King Bruce poem body',
      exercises: 'Exercise 1\nWas the king happy?',
      concepts: ['Try again'],
    });
    const out = coerceLessonDisplayText(blob);
    expect(out).toContain('King Bruce poem body');
    expect(out).toContain('Exercise 1');
    expect(out).not.toContain('"lessonBody"');
  });
});
