import { ChapterTeachingPackSchema } from './chapter-teaching-pack.schema';
import { heuristicChapterTeachingPack } from '../chapter-teaching-pack.heuristic';

describe('ChapterTeachingPackSchema', () => {
  it('accepts heuristic output', () => {
    const raw = heuristicChapterTeachingPack({
      chapterTitle: 'Fractions',
      chapterText: 'A fraction represents parts of a whole. '.repeat(40),
      subjectName: 'Mathematics',
      classLabel: 'Class 6',
    });
    expect(() => ChapterTeachingPackSchema.parse(raw)).not.toThrow();
  });
});
