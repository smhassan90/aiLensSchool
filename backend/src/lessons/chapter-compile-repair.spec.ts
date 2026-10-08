import { repairCompiledChapterFromSource } from './chapter-compile-repair';

describe('repairCompiledChapterFromSource', () => {
  const source = `
Reading text
King Bruce and the Spider
Eliza Cook (1818-1889)

King Bruce of Scotland flung himself down
In a lonely mood to think;
'Tis true he was monarch and wore a crown,
But his heart was beginning to sink.

He had tried to do everything to make his people glad;
He had tried and tried, but couldn't succeed,
And so became quite sad.

Exercise 1
1. Was the king happy or unhappy?
2. What attracted his attention as he was thinking?

Exercise 5
1. Why was King Bruce so sad?
`.trim();

  it('restores opening stanza when the model jumps into the middle of the poem', () => {
    const compiledBody = `
Reading text
King Bruce and the Spider

He had tried to do everything to make his people glad;
He had tried and tried, but couldn't succeed,
And so became quite sad.
`.trim();
    const repaired = repairCompiledChapterFromSource(source, compiledBody, '');
    expect(repaired.lessonBody).toMatch(/flung himself/i);
    expect(repaired.lessonBody).toMatch(/beginning to sink/i);
    expect(repaired.exercises).toMatch(/Exercise 1/i);
    expect(repaired.exercises).toMatch(/Why was King Bruce so sad/i);
  });
});
