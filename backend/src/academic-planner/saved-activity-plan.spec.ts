import { readFileSync } from 'fs';
import { join } from 'path';
import { PlannerAnalysisSource, PlannerLessonKind } from '@prisma/client';
import { generateDayPlanFromTeachingPacks } from './day-plan-from-teaching-pack';
import { defaultPlannerSettings, TeachingSlot } from './planner-types';
import { TeachingPackForAnalysis } from '../library-books/chapter-teaching-pack-to-analysis';
import { selectSavedActivity } from './saved-activity-plan';
import { teachingHelpFromSavedActivityNotes } from './teaching-help-from-saved-activity';
import { TeachingHelpOutputSchema } from '../ai/schemas/teaching-help.schema';

const participation =
  'Student might say: oral communication is just talking freely. You add: the text says students evaluate peers against a criterion.';

function activity(
  title: string,
  sliceKey: string | null,
  description: string,
): TeachingPackForAnalysis['activities'][number] {
  return {
    sliceKey,
    title,
    description: `${description} For example: use one fact from this chapter.`,
    participationTechnique: participation,
    materials: 'Board, textbook, notebooks',
    learningObjective: `Students use ${title} from Unit 5.`,
    teacherSteps: [
      'Write the section name on the board.',
      'Give every student a turn to answer from the textbook.',
      'Correct one answer with the textbook line.',
    ],
    expectedOutcome: `Students can explain ${title} in their own words.`,
    durationMinutes: 20,
  };
}

function unit5Pack(contentHash: string): TeachingPackForAnalysis {
  const longDescription = `${'Groups own each section of Unit 5 and write its meaning, one textbook line, and one real-life example. '.repeat(20)}`;
  return {
    contentHash,
    complexity: 'MEDIUM',
    summary: 'UNIQUE_SUMMARY_SENTENCE_SHOULD_NOT_REPEAT on every teaching day.',
    teacherGuide: [
      'Explain why the bad dream matters before the presentation.',
      'Model one modal verb for a polite request.',
      'Show the greeting of a letter to the editor.',
    ],
    source: PlannerAnalysisSource.AI,
    promptVersion: 'chapter-teaching-pack-v2',
    readingSlices: [
      {
        sliceKey: 's1',
        title: 'A Bad Dream',
        readingFrom: 'A bad dream woke him before the presentation.',
        readingTo: null,
        explainPoints: ['The dream is about failing a presentation.'],
      },
      {
        sliceKey: 's2',
        title: 'Presentation Evaluation',
        readingFrom: 'Students evaluate a presentation against a criterion.',
        readingTo: null,
        explainPoints: ['A criterion is the point used to judge the talk.'],
      },
      {
        sliceKey: 's3',
        title: 'Modal Verbs',
        readingFrom: 'Modal verbs for requests and advice include can and should.',
        readingTo: null,
        explainPoints: ['Can asks for permission. Should gives advice.'],
      },
      {
        sliceKey: 's4',
        title: 'Letter to the Editor',
        readingFrom: 'A letter to the editor states a problem and a request.',
        readingTo: null,
        explainPoints: ['The letter needs a greeting, a problem, and a request.'],
      },
    ],
    questions: [
      {
        sliceKey: 's4',
        question: 'Write the opening of a letter to the editor.',
        format: 'WRITTEN',
        expectedAnswer: 'A greeting, the problem, and a request.',
      },
      {
        sliceKey: 's3',
        question: 'Choose can or should for this request.',
        format: 'WRITTEN',
        expectedAnswer: 'Can you check my presentation?',
      },
    ],
    activities: [
      activity('Unit recap', null, longDescription),
      activity('Dream twist discussion', 's1', 'Students retell the turning point of A Bad Dream.'),
      activity('Mini presentation with feedback', 's2', 'Pairs give a one-minute talk and mark it against the criterion.'),
      activity('Modal request and advice drill', 's3', 'Students write one request and one piece of advice with modal verbs.'),
      activity('Draft letter to the editor', 's4', 'Students draft the opening of a letter to the editor from the textbook task.'),
    ],
    revisionPoints: [{ sliceKey: 's4', point: 'A letter to the editor states a problem and a request.' }],
  };
}

function slots(count: number): TeachingSlot[] {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-11-${String(16 + index).padStart(2, '0')}`,
    periodNumber: 1,
    startTime: '08:00',
    endTime: '08:40',
    minutes: 40,
  }));
}

function planFor(
  chapters: Array<{ key: string; title: string; hash: string | null; libraryId: string | null }>,
  packs: Map<string, TeachingPackForAnalysis>,
  chapterText = 'A bad dream woke him before the presentation. '.repeat(40),
  dayCount = 8,
) {
  return generateDayPlanFromTeachingPacks({
    chapters: chapters.map((chapter, index) => ({
      chapterKey: chapter.key,
      titleSnapshot: chapter.title,
      libraryBookChapterId: chapter.libraryId,
      contentHash: chapter.hash,
      sortOrder: index,
      chapterText,
    })),
    packsByChapterId: packs,
    chapterTextsByLibraryId: new Map(
      chapters
        .filter((chapter) => chapter.libraryId)
        .map((chapter) => [chapter.libraryId as string, chapterText]),
    ),
    subjectName: 'English',
    teachingSlots: slots(dayCount),
    settings: { ...defaultPlannerSettings('2026-12-20'), revisionSlots: dayCount === 2 ? 0 : 1, fallbackPeriodMinutes: 40 },
    timetableSource: 'FALLBACK',
    keyFactory: (() => {
      let n = 0;
      return () => `lesson-${n++}`;
    })(),
  });
}

describe('saved teaching-pack activities in the day plan', () => {
  it('uses the saved Unit recap instead of a generic Finish the line activity', () => {
    const pack = unit5Pack('hash-unit-5');
    const result = planFor(
      [{ key: 'u5', title: 'Unit 5 — Respecting Self and Others', hash: 'hash-unit-5', libraryId: 'lib-u5' }],
      new Map([['lib-u5', pack]]),
    );
    expect(result).not.toBeNull();
    const activityLesson = result!.lessons.find((lesson) => lesson.kind === PlannerLessonKind.ACTIVITY);
    expect(activityLesson?.objectives[0]).toBe('Dream twist discussion');
    expect(activityLesson?.title).toContain('Dream twist discussion');
    expect(activityLesson?.title).not.toContain('Unit recap');
    expect(activityLesson?.notes).toContain(participation);
    expect(activityLesson?.notes).toContain('Board, textbook, notebooks');
    expect(activityLesson?.notes).toContain('What the teacher does:');
    expect(activityLesson?.notes).toContain('What students do:');
    expect(activityLesson?.notes).toContain('Duration: 40 minutes');
    expect(activityLesson?.notes).not.toMatch(/the class period set aside/i);
    expect(activityLesson?.notes).not.toMatch(/What did this activity ask you to do/i);
    expect(activityLesson?.notes).not.toMatch(/Finish the line/i);
    expect(activityLesson?.notes).toContain('Dream twist discussion');
  });

  it('keeps a valid pack when another chapter pack is missing or outdated', () => {
    const packs = new Map<string, TeachingPackForAnalysis>([
      ['lib-u5', unit5Pack('hash-unit-5')],
      ['lib-u6', unit5Pack('old-hash')],
    ]);
    const result = planFor(
      [
        { key: 'u5', title: 'Unit 5 — Respecting Self and Others', hash: 'hash-unit-5', libraryId: 'lib-u5' },
        { key: 'u6', title: 'Unit 6 — Safety', hash: 'new-hash', libraryId: 'lib-u6' },
      ],
      packs,
    );
    expect(result).not.toBeNull();
    const unit5 = result!.lessons.find(
      (lesson) => lesson.chapterKey === 'u5' && lesson.kind === PlannerLessonKind.ACTIVITY,
    );
    const unit6 = result!.lessons.find(
      (lesson) => lesson.chapterKey === 'u6' && lesson.kind === PlannerLessonKind.ACTIVITY,
    );
    expect(unit5?.notes).toContain('Dream twist discussion');
    expect(unit5?.notes).not.toMatch(/Finish the line/i);
    expect(unit6?.notes).toContain('Use the next numbered application in the textbook');
    expect(unit6?.notes).not.toMatch(/sections already taught/i);
    expect(unit6?.notes).toContain('out of date');
    expect(unit6?.notes).not.toContain('Unit recap');
    expect(result!.summary.warnings.some((warning) => warning.code === 'TEACHING_PACK_UNAVAILABLE')).toBe(true);
  });

  it('gives reading and exercise lessons teacher guidance without repeating the chapter summary', () => {
    const result = planFor(
      [{ key: 'u5', title: 'Unit 5 — Respecting Self and Others', hash: 'hash-unit-5', libraryId: 'lib-u5' }],
      new Map([['lib-u5', unit5Pack('hash-unit-5')]]),
    );
    const reading = result!.lessons.find((lesson) => /Read .+ with the class/.test(lesson.objectives[0] ?? ''));
    const exercise = result!.lessons.find((lesson) => lesson.objectives[0]?.startsWith('Do the textbook exercises'));
    expect(reading?.notes).toContain('What you do:');
    expect(reading?.notes).toContain('What students do:');
    expect(reading?.notes).toContain('Check understanding:');
    expect(reading?.notes).not.toContain('UNIQUE_SUMMARY_SENTENCE_SHOULD_NOT_REPEAT');
    expect(exercise?.notes).toContain('Write the opening of a letter to the editor.');
    expect(exercise?.notes).toContain('Accept:');
    expect(exercise?.notes).not.toContain('UNIQUE_SUMMARY_SENTENCE_SHOULD_NOT_REPEAT');
  });

  it('uses a showable activity from a later slice when the taught slice has none', () => {
    const pack = unit5Pack('hash-unit-5');
    const early = selectSavedActivity({
      activities: pack.activities,
      coveredSliceKeys: ['s1'],
      usedTitles: [],
      preferRecap: false,
    });
    expect(early?.title).toBe('Dream twist discussion');
    const unseen = selectSavedActivity({
      activities: pack.activities.filter((item) => item.sliceKey === 's4'),
      coveredSliceKeys: ['s1'],
      usedTitles: [],
      preferRecap: false,
    });
    expect(unseen?.title).toBe('Draft letter to the editor');
    const second = selectSavedActivity({
      activities: pack.activities,
      coveredSliceKeys: ['s1', 's2'],
      usedTitles: ['Dream twist discussion'],
      preferRecap: false,
    });
    expect(second?.title).toBe('Mini presentation with feedback');
  });

  it('shows a later complete activity on a two-day chapter and does not blame the sections', () => {
    const chapterText = 'Convert a ratio by multiplying both terms. Simplify 3:4. Calculate the missing term with the product of the means.';
    const steps = [
      '(8 min) Write 3:4 on the board.',
      '(20 min) Each student calculates the missing term.',
      '(12 min) Check that both products are 24.',
    ];
    const complete = {
      sliceKey: 's6',
      title: 'Find the missing term',
      description:
        'A shop keeps the ratio 3:4. The short piece is 6 metres. What is the long piece? Worked example: 3:4 = 6:8, because 3 times 8 is 24 and 4 times 6 is 24. The correct answer is 8 metres. Each student calculates the missing term.',
      participationTechnique: 'Each student calculates the missing term alone.',
      materials: 'None',
      learningObjective: 'Students can find the missing term in an equal ratio.',
      teacherSteps: steps,
      expectedOutcome: 'Each notebook shows 3:4 = 6:8.',
      durationMinutes: 40,
    };
    const relay = {
      sliceKey: 's1',
      title: 'Term relay',
      description: 'Students pass one step of the method to the next person. Nobody finishes a full item.',
      participationTechnique: 'Each student passes one step.',
      materials: 'None',
      learningObjective: '',
      teacherSteps: [],
      expectedOutcome: '',
      durationMinutes: 20,
    };
    const base = unit5Pack('hash-ratio');
    const withLater = {
      ...base,
      summary: 'A short ratio chapter.',
      readingSlices: [
        { sliceKey: 's1', title: 'Equal ratios', readingFrom: 'Convert a ratio by multiplying both terms.', readingTo: null, explainPoints: ['Both terms change by the same factor.'] },
        { sliceKey: 's6', title: 'A missing term', readingFrom: 'Calculate the missing term with the product of the means.', readingTo: null, explainPoints: ['The products match.'] },
      ],
      activities: [relay, complete],
    };
    const shown = planFor(
      [{ key: 'ratio', title: 'Ratios', hash: 'hash-ratio', libraryId: 'lib-ratio' }],
      new Map([['lib-ratio', withLater]]),
      chapterText,
      3,
    );
    const activity = shown!.lessons.find((lesson) => lesson.kind === PlannerLessonKind.ACTIVITY);
    expect(activity?.notes).toContain('3:4');
    expect(activity?.notes).toContain('6:8');
    expect(activity?.title).toContain('Find the missing term');
    expect(activity?.notes).not.toMatch(/relay/i);
    expect(activity?.notes).not.toMatch(/sections already taught/i);

    const onlyRelay = planFor(
      [{ key: 'ratio', title: 'Ratios', hash: 'hash-ratio', libraryId: 'lib-ratio' }],
      new Map([['lib-ratio', { ...withLater, activities: [relay] }]]),
      chapterText,
      3,
    );
    const hidden = onlyRelay!.lessons.find((lesson) => lesson.kind === PlannerLessonKind.ACTIVITY);
    expect(hidden?.notes).toMatch(/not complete enough to teach/);
    expect(hidden?.notes).not.toMatch(/relay/i);
    expect(hidden?.notes).not.toMatch(/sections already taught/i);

    const empty = planFor(
      [{ key: 'ratio', title: 'Ratios', hash: 'hash-ratio', libraryId: 'lib-ratio' }],
      new Map([['lib-ratio', { ...withLater, activities: [] }]]),
      chapterText,
      3,
    );
    const missing = empty!.lessons.find((lesson) => lesson.kind === PlannerLessonKind.ACTIVITY);
    expect(missing?.notes).toMatch(/No saved activity for Ratios/);
    expect(missing?.notes).not.toMatch(/sections already taught/i);
  });
});

describe('teacher-facing activity text', () => {
  it('does not replace long activity instructions with DISPLAY_ACTIVITIES', () => {
    const source = readFileSync(join(process.cwd(), '../portal/src/lib/planner-day-line.ts'), 'utf8');
    expect(source).not.toContain('DISPLAY_ACTIVITIES');
    expect(source).not.toContain('notes.length < 1400');
    expect(source).toContain('return notes || null');
  });

  it('returns the saved activity from Help me teach', () => {
    const notes = [
      'Unit recap',
      'Learning objective: Students recall every section of Unit 5.',
      'You need: Board, textbook, notebooks',
      'Duration: 20 minutes',
      'What the teacher does:',
      '1. Write the section names on the board.',
      '2. Give each group one section from the textbook.',
      'How every student participates:',
      participation,
    ].join('\n');
    const help = TeachingHelpOutputSchema.parse(
      teachingHelpFromSavedActivityNotes({
        lessonTitle: 'Day 16 — Unit 5 — Respecting Self and Others · Unit recap',
        chapterTitle: 'Unit 5 — Respecting Self and Others',
        classLabel: 'Class 10',
        subjectName: 'English',
        notes,
      }),
    );
    expect(help.classroomDelivery.activity?.title).toBe('Unit recap');
    expect(help.teacherExplanation.simpleExplanation).toContain(participation);
    expect(help.teacherExplanation.simpleExplanation).not.toMatch(/Finish the line/i);
    expect(help.classroomDelivery.activity?.materials).toContain('Board, textbook, notebooks');
  });
});
