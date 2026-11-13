import { assertPersistableActivities, groundTeachingPack } from './chapter-teaching-pack.ground';
import { capTeachingPackActivities, parseChapterTeachingPackJson } from './schemas/chapter-teaching-pack.schema';
import type { ChapterTeachingPackOutput } from './schemas/chapter-teaching-pack.schema';

function activity(title: string, sliceKey: string | null): ChapterTeachingPackOutput['activities'][number] {
  return {
    sliceKey,
    title,
    learningObjective: `Students can use ${title} from this chapter.`,
    description: `The class works on ${title} using the textbook section.`,
    materials: 'Textbook and notebooks',
    steps: ['Read the textbook line for this section.', 'Ask every student for one response.'],
    participationTechnique: 'Student might say: "The line means one thing." You add: "Use the textbook wording."',
    expectedOutcome: 'Each student can say one fact from the section.',
    durationMinutes: 15,
  };
}

function pack(activities: ChapterTeachingPackOutput['activities']): ChapterTeachingPackOutput {
  return {
    complexity: 'MEDIUM',
    summary: 'This chapter covers a bad dream, presentations, modals, and a letter to the editor.',
    teacherGuide: ['Explain the bad dream before the letter.'],
    readingSlices: [
      {
        sliceKey: 's1',
        title: 'A Bad Dream',
        readingFrom: 'A bad dream woke him before the presentation.',
        readingTo: null,
        explainPoints: ['The dream happens before the presentation.'],
      },
    ],
    questions: [
      {
        sliceKey: 's1',
        question: 'What woke him?',
        expectedAnswer: 'A bad dream',
        format: 'ORAL',
      },
    ],
    activities,
    revisionPoints: [{ sliceKey: 's1', point: 'A bad dream woke him before the presentation.' }],
  };
}

describe('teaching pack activity limits', () => {
  const chapter = 'A bad dream woke him before the presentation. The class then writes a letter to the editor.';

  it('rejects fewer or more than 3 to 5 activities and unknown slice keys', () => {
    expect(() => assertPersistableActivities(pack([activity('One', null), activity('Two', 's1')]))).toThrow(/3 to 5/);
    expect(() =>
      assertPersistableActivities(
        pack([
          activity('Unit recap', null),
          activity('Two', 's1'),
          activity('Three', 's1'),
          activity('Four', 's1'),
          activity('Five', 's1'),
          activity('Six', 's1'),
        ]),
      ),
    ).toThrow(/3 to 5/);
    expect(() =>
      assertPersistableActivities(pack([activity('Unit recap', null), activity('Two', 's9'), activity('Three', 's1')])),
    ).toThrow(/unknown slice s9/);
  });

  it('drops a generic unit recap before a chapter task when there are more than five', () => {
    const raw = pack([
      activity('Dream twist discussion', 's1'),
      activity('Mini presentation', 's1'),
      activity('Modal drill', 's1'),
      activity('Draft letter', 's1'),
      activity('Extra game', 's1'),
      activity('Unit recap', null),
    ]);
    const capped = capTeachingPackActivities(raw.activities) as ChapterTeachingPackOutput['activities'];
    expect(capped).toHaveLength(5);
    expect(capped.map((item) => item.title)).not.toContain('Unit recap');
    const parsed = parseChapterTeachingPackJson(JSON.stringify({ ...raw, activities: capped }));
    expect(parsed.activities).toHaveLength(5);
  });

  it('rejects a reading quote that is not in the chapter and keeps a real quote', () => {
    const valid = pack([activity('Unit recap', null), activity('Dream twist discussion', 's1'), activity('Letter draft', 's1')]);
    expect(groundTeachingPack(valid, chapter).readingSlices[0].readingFrom).toContain('bad dream');
    const invented = pack([activity('Unit recap', null), activity('Dream twist discussion', 's1'), activity('Letter draft', 's1')]);
    invented.readingSlices[0].readingFrom = 'This sentence was never printed in the textbook at all.';
    invented.readingSlices[0].title = 'Missing heading';
    expect(() => groundTeachingPack(invented, chapter)).toThrow(/does not quote the chapter text/);
  });
});
