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
    description,
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

function planFor(chapters: Array<{ key: string; title: string; hash: string | null; libraryId: string | null }>, packs: Map<string, TeachingPackForAnalysis>) {
  return generateDayPlanFromTeachingPacks({
    chapters: chapters.map((chapter, index) => ({
      chapterKey: chapter.key,
      titleSnapshot: chapter.title,
      libraryBookChapterId: chapter.libraryId,
      contentHash: chapter.hash,
      sortOrder: index,
      chapterText: 'A bad dream woke him before the presentation. '.repeat(30),
    })),
    packsByChapterId: packs,
    chapterTextsByLibraryId: new Map(
      chapters
        .filter((chapter) => chapter.libraryId)
        .map((chapter) => [chapter.libraryId as string, 'A bad dream woke him before the presentation. '.repeat(40)]),
    ),
    subjectName: 'English',
    teachingSlots: slots(8),
    settings: { ...defaultPlannerSettings('2026-12-20'), revisionSlots: 1, fallbackPeriodMinutes: 40 },
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
    expect(activityLesson?.objectives[0]).toBe('Unit recap');
    expect(activityLesson?.title).toContain('Unit recap');
    expect(activityLesson?.notes).toContain(participation);
    expect(activityLesson?.notes).toContain('Board, textbook, notebooks');
    expect(activityLesson?.notes).toContain('What the teacher does:');
    expect(activityLesson?.notes?.length).toBeGreaterThan(1400);
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
    expect(unit5?.notes).toContain('Unit recap');
    expect(unit5?.notes).not.toMatch(/Finish the line/i);
    expect(unit6?.notes).toContain('FALLBACK — no saved activity');
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

  it('does not select an activity for a section that has not been taught', () => {
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
    expect(unseen).toBeNull();
    const second = selectSavedActivity({
      activities: pack.activities,
      coveredSliceKeys: ['s1', 's2'],
      usedTitles: ['Dream twist discussion'],
      preferRecap: false,
    });
    expect(second?.title).toBe('Mini presentation with feedback');
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
