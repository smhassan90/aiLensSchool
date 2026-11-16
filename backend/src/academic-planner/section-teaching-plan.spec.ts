import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { joinCompiledChapter } from '../ai/schemas/chapter-compile-text';
import { collectActivityIssues } from '../library-books/activity-quality';
import { selectSavedActivity, type SavedActivity } from './saved-activity-plan';
import {
  activityChapterContext,
  allocateSectionDays,
  packNeedsRefresh,
  parseSectionPlans,
  readSectionPlans,
  renderAssignedLesson,
  teacherGuideBullets,
  teachingPackFromSectionPlans,
  validateDisplayedLesson,
  type SectionPlan,
} from './section-teaching-plan';

function chapterText(fileName: string): string {
  const path = [
    join(process.cwd(), 'docs/analysis/raw', fileName),
    join(process.cwd(), '../docs/analysis/raw', fileName),
    join('/Users/smhassan.tahir/Documents/workspace/aiLensSchool/docs/analysis/raw', fileName),
  ].find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`${fileName} is missing`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { publishedText: string; exercisesText: string };
  return joinCompiledChapter(raw.publishedText, raw.exercisesText);
}

function unitText(): string {
  return chapterText('unit-1-chapter.json');
}

function lessonFor(plans: SectionPlan[], skill: SectionPlan['skill'], mode: 'teach' | 'practice' | 'activity' = 'teach') {
  const days = allocateSectionDays(16, plans);
  const match = days.find((day) => day.section.skill === skill && day.mode === mode) ?? days.find((day) => day.section.skill === skill);
  if (!match) throw new Error(`No ${skill} lesson`);
  return { assignment: match, lesson: renderAssignedLesson(match, 40) };
}

describe('Unit 1 section teaching plans', () => {
  const plans = parseSectionPlans(unitText());

  it('maps exercises to the six textbook sections', () => {
    expect(plans.map((plan) => plan.skill)).toEqual(['READING', 'ORAL', 'LANGUAGE', 'WRITING', 'STUDY', 'FUN']);
    const oral = plans.find((plan) => plan.skill === 'ORAL');
    expect(oral?.exercises.map((exercise) => exercise.number)).toEqual(['1', '2', '3']);
    expect(oral?.exercises[0]?.instruction).toMatch(/Amina, Hina, and Mariam/);
    expect(oral?.exercises[0]?.grouping).toBe('groups');
    expect(oral?.exercises[2]?.teacherNote).toMatch(/agreement and disagreement/);
    const language = plans.find((plan) => plan.skill === 'LANGUAGE');
    expect(language?.exercises.length).toBe(7);
    const writing = plans.find((plan) => plan.skill === 'WRITING');
    expect(writing?.exercises[0]?.instruction).toMatch(/Sindh/);
    const fun = plans.find((plan) => plan.skill === 'FUN');
    expect(fun?.exercises[0]?.grouping).toBe('groups');
    expect(fun?.exercises[0]?.groupSize).toBe(5);
    expect(plans.find((plan) => plan.skill === 'ORAL')?.learningObjective).toMatch(/agreement/i);
  });

  it('writes a different lecture for each skill and keeps the time at 40 minutes', () => {
    const reading = lessonFor(plans, 'READING').lesson.notes;
    const oral = lessonFor(plans, 'ORAL').lesson.notes;
    const language = lessonFor(plans, 'LANGUAGE').lesson.notes;
    const writing = lessonFor(plans, 'WRITING').lesson.notes;
    const study = lessonFor(plans, 'STUDY').lesson.notes;
    const fun = lessonFor(plans, 'FUN').lesson.notes;

    expect(reading).toMatch(/steeple|Voice of God|God dwells among the people/i);
    expect(reading).toMatch(/Caliph|horse/i);
    expect(reading).not.toMatch(/say one fact from this section/i);

    expect(oral).toMatch(/Amina/);
    expect(oral).toMatch(/Hina/);
    expect(oral).toMatch(/Mariam/);
    expect(oral).not.toMatch(/half the class/i);

    expect(language).toMatch(/capital/i);
    expect(writing).toMatch(/cluster/i);
    expect(writing).toMatch(/paragraph/i);
    expect(study).toMatch(/Wh-question/i);
    expect(fun).toMatch(/groups of five/i);
    expect(fun).toMatch(/English/);

    for (const notes of [reading, oral, language, writing, study, fun]) {
      expect(validateDisplayedLesson(notes, 40)).toEqual([]);
    }
  });

  it('uses a printed exercise for the activity instead of a horse debate', () => {
    const days = allocateSectionDays(16, plans);
    const oralPractice = days.find((day) => day.section.skill === 'ORAL' && day.exercise?.number === '2');
    const oralNotes = renderAssignedLesson(oralPractice!, 40).notes;
    expect(oralNotes).toMatch(/Amina/);
    expect(oralNotes).toMatch(/three sequences|Mariam/);
    const activity = days.find((day) => day.mode === 'activity');
    expect(activity?.section.skill).toBe('WRITING');
    const lesson = renderAssignedLesson(activity!, 40);
    expect(lesson.notes).toMatch(/paragraph/);
    expect(lesson.notes).not.toMatch(/half the class/i);
    expect(lesson.notes).not.toMatch(/rich man/i);
    const teacher = lesson.notes.split('What the teacher does:')[1]?.split('What students do:')[0] ?? '';
    const students = lesson.notes.split('What students do:\n')[1]?.split('\n\n')[0] ?? '';
    expect(teacher.trim().toLowerCase()).not.toBe(students.trim().toLowerCase());
    expect(validateDisplayedLesson(lesson.notes, 40)).toEqual([]);
  });

  it('does not repeat an exercise while unused exercises remain', () => {
    const days = allocateSectionDays(16, plans);
    const keys = days
      .filter((day) => day.mode !== 'activity' && !day.application)
      .map((day) => day.exercise?.key)
      .filter((key): key is string => Boolean(key));
    expect(new Set(keys).size).toBe(keys.length);
    const activity = days.find((day) => day.mode === 'activity');
    expect(keys).not.toContain(activity?.exercise?.key);
  });

  it('fills extra days with application work instead of repeating the last explanation', () => {
    const sections: SectionPlan[] = ['READING', 'ORAL', 'LANGUAGE', 'WRITING', 'STUDY', 'FUN'].map((skill, index) => ({
      sliceKey: `s${index + 1}`,
      title: `Section ${index + 1}`,
      skill: skill as SectionPlan['skill'],
      learningObjective: `Students can use section ${index + 1}.`,
      contentPoints: [`UNIQUE_EXPLAIN_${index}`],
      anchor: 'Anchor text from the textbook section.',
      exercises: [
        {
          key: `s${index + 1}-ex1`,
          number: '1',
          instruction: 'Complete the printed item.',
          teacherNote: null,
          items: ['1. First item'],
          grouping: 'individual',
          groupSize: null,
        },
      ],
    }));
    const days = allocateSectionDays(12, sections);
    const extra = days.filter((day) => day.application);
    expect(extra.length).toBeGreaterThan(0);
    for (const day of extra) {
      const notes = renderAssignedLesson(day, 40).notes;
      expect(notes).toContain('Do not repeat the section explanation.');
      expect(notes).not.toContain(day.section.contentPoints[0]);
    }
  });

  it('uses the activity prepared for the chapter before a later section task', () => {
    const activities: SavedActivity[] = [
      {
        sliceKey: 's1',
        title: 'Oral debate about the story',
        description: 'Groups discuss and debate the story in a group.',
        participationTechnique: 'Each student speaks once.',
      },
      {
        sliceKey: 's2',
        title: 'Write the paragraph',
        description: 'Each student writes one paragraph from the textbook task.',
        participationTechnique: 'Each student writes in their own notebook.',
      },
    ];
    const selected = selectSavedActivity({
      activities,
      coveredSliceKeys: ['s1', 's2'],
      usedTitles: [],
      preferRecap: true,
    });
    expect(selected?.title).toBe('Oral debate about the story');
    const repeated = selectSavedActivity({
      activities,
      coveredSliceKeys: ['s1', 's2'],
      usedTitles: ['Oral debate about the story'],
      preferRecap: true,
    });
    expect(repeated?.title).toBe('Write the paragraph');
  });

  it('refreshes a pack when the prompt version changes and keeps a current pack', () => {
    expect(
      packNeedsRefresh({
        storedHash: 'abc',
        storedPromptVersion: 'chapter-teaching-pack-v4',
        contentHash: 'abc',
        promptVersion: 'chapter-teaching-pack-v5',
      }),
    ).toBe(true);
    expect(
      packNeedsRefresh({
        storedHash: 'abc',
        storedPromptVersion: 'chapter-teaching-pack-v5',
        contentHash: 'abc',
        promptVersion: 'chapter-teaching-pack-v5',
      }),
    ).toBe(false);
    expect(
      packNeedsRefresh({
        storedHash: null,
        storedPromptVersion: null,
        contentHash: 'abc',
        promptVersion: 'chapter-teaching-pack-v5',
      }),
    ).toBe(true);
  });

  it('keeps an old guide array readable and does not invent sections for an incomplete chapter', () => {
    expect(teacherGuideBullets(['Explain the first paragraph.'])).toEqual(['Explain the first paragraph.']);
    expect(readSectionPlans(['Explain the first paragraph.'])).toEqual([]);
    expect(parseSectionPlans('A short chapter with no textbook headings.')).toEqual([]);
    const wrapped = {
      bullets: ['Explain the first paragraph.'],
      sectionPlans: plans.slice(0, 1),
    };
    expect(teacherGuideBullets(wrapped)).toEqual(['Explain the first paragraph.']);
    expect(readSectionPlans(wrapped)).toHaveLength(1);
  });

  it('builds pack activities from the section exercises', () => {
    const pack = teachingPackFromSectionPlans(plans, 'Unit 1');
    expect(pack.activities.length).toBeGreaterThanOrEqual(3);
    expect(pack.activities.length).toBeLessThanOrEqual(5);
    expect(pack.activities.some((activity) => /Amina|health dialogue|Agree and disagree/i.test(activity.description + activity.title))).toBe(true);
    expect(pack.activities.some((activity) => /rich man/i.test(activity.description) && /beggar/i.test(activity.description))).toBe(false);
    expect(collectActivityIssues(pack.activities, unitText())).toEqual([]);
    const oralQuestion = pack.questions.find((question) => question.question.includes('Amina'));
    expect(oralQuestion?.sliceKey).toBe(plans.find((plan) => plan.skill === 'ORAL')?.sliceKey);
  });

  it('rejects a lesson whose time, roles, or assessment do not fit', () => {
    expect(validateDisplayedLesson('Learning objective: Students can agree.\n(10 min) Talk.\n(10 min) Talk.', 40)).toContain(
      'time breakdown does not match the period',
    );
    expect(
      validateDisplayedLesson(
        'Learning objective: Students can agree.\n(40 min) Work.\nWhat students do:\nWork in groups.\nThere is no group answer.',
        40,
      ),
    ).toContain('group work contradicts individual work');
    expect(
      validateDisplayedLesson(
        'Learning objective: Students can express agreement.\n(40 min) Check.\nCheck understanding:\nAsk who got the horse.',
        40,
      ),
    ).toContain('assessment does not match the learning objective');
  });
});

describe('Unit 2 section teaching plans', () => {
  const plans = parseSectionPlans(chapterText('unit-2-chapter.json'));

  it('finds the sections that are printed only on the exercise pages', () => {
    expect(plans.map((plan) => plan.skill)).toEqual(['READING', 'ORAL', 'LANGUAGE', 'WRITING', 'STUDY', 'FUN']);
    expect(plans.find((plan) => plan.skill === 'ORAL')?.exercises[0]?.instruction).toMatch(/advice/i);
    expect(plans.find((plan) => plan.skill === 'WRITING')?.exercises[0]?.instruction).toMatch(/email/i);
  });

  it('teaches Dignity of Work without the Unit 1 horse story or health dialogue', () => {
    for (const skill of ['READING', 'ORAL', 'LANGUAGE', 'WRITING', 'STUDY', 'FUN'] as const) {
      const notes = lessonFor(plans, skill).lesson.notes;
      expect(notes).not.toMatch(/\bhorse\b|\bsteeple\b|\bAmina\b|Sindh cluster|Wh-question|ghost story/i);
      expect(validateDisplayedLesson(notes, 40)).toEqual([]);
    }
    expect(lessonFor(plans, 'READING').lesson.notes).toMatch(/Dignity of Work|Akhtar|honest work/i);
    expect(lessonFor(plans, 'ORAL').lesson.notes).toMatch(/advice/i);
    expect(lessonFor(plans, 'LANGUAGE').lesson.notes).toMatch(/Present|verb|tense/i);
    expect(lessonFor(plans, 'WRITING').lesson.notes).toMatch(/email/i);
    expect(lessonFor(plans, 'FUN').lesson.notes).toMatch(/word/i);
  });
});

describe('activity chapter context', () => {
  it('keeps the story and the later sections for a long unit', () => {
    const text = chapterText('unit-1-chapter.json');
    const context = activityChapterContext(text);
    expect(context.length).toBeGreaterThan(20000);
    expect(context).toMatch(/horse/i);
    expect(context).toMatch(/\bAmina\b/);
    expect(context).toMatch(/Sindh/);
    expect(context).toMatch(/ghost/i);
    const unit2 = activityChapterContext(chapterText('unit-2-chapter.json'));
    expect(unit2).toMatch(/Dignity of Work/);
    expect(unit2).toMatch(/formal email/i);
    expect(unit2).toMatch(/advice/i);
  });
});
