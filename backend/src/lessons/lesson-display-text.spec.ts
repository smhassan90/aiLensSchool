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
});
