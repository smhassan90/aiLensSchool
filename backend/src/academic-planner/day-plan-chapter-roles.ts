import { LessonStage, PlannerLessonKind } from '@prisma/client';
import { displayChapterTitle } from './day-plan-content-quality';

export type ChapterDayRole = 'INTRO' | 'READING' | 'CONTINUE_READING' | 'EXERCISE' | 'ACTIVITY';

/**
 * One intro day, one activity day, and the days between split evenly:
 * half reading, half exercise. An odd leftover day is a reading day.
 */
export function rolesForChapterDays(dayCount: number): ChapterDayRole[] {
  const n = Math.max(0, Math.floor(dayCount));
  if (n === 0) return [];
  if (n === 1) return ['INTRO'];
  if (n === 2) return ['INTRO', 'ACTIVITY'];

  const rest = n - 2;
  const readingCount = Math.ceil(rest / 2);
  const exerciseCount = rest - readingCount;

  const roles: ChapterDayRole[] = ['INTRO'];
  for (let i = 0; i < readingCount; i++) {
    roles.push(i === 0 ? 'READING' : 'CONTINUE_READING');
  }
  for (let i = 0; i < exerciseCount; i++) {
    roles.push('EXERCISE');
  }
  roles.push('ACTIVITY');
  return roles;
}

const roleLabels: Record<ChapterDayRole, string> = {
  INTRO: 'Intro',
  READING: 'Reading',
  CONTINUE_READING: 'Continue reading',
  EXERCISE: 'Exercise',
  ACTIVITY: 'Activity',
};

export function parseRoleFromPortionKey(tag: string): ChapterDayRole | null {
  if (tag === 'role:intro') return 'INTRO';
  if (tag.startsWith('role:reading')) return 'READING';
  if (tag.startsWith('role:continue')) return 'CONTINUE_READING';
  if (tag === 'role:exercise' || tag.startsWith('role:exercise:')) return 'EXERCISE';
  if (tag === 'role:activity' || tag.startsWith('activity:')) return 'ACTIVITY';
  return null;
}

export function rolePortionKey(role: ChapterDayRole, readingIndex: number): string {
  if (role === 'INTRO') return 'role:intro';
  if (role === 'READING') return `role:reading:${readingIndex}`;
  if (role === 'CONTINUE_READING') return `role:continue:${readingIndex}`;
  if (role === 'EXERCISE') return `role:exercise:${readingIndex}`;
  return 'role:activity';
}

export function activityConductNotes(chapter: string, themes: string[]): string {
  const named = themes.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 12).slice(0, 4);
  const lines = [
    `How to run this activity for ${chapter}:`,
    '1. Make groups of 3 or 4. Every student speaks at least once.',
  ];
  if (named.length > 0) {
    lines.push('2. Give each group one idea from this chapter:');
    named.forEach((theme, index) => lines.push(`   ${index + 1}. ${theme}`));
    lines.push('3. In about 8 minutes, each group prepares one real-life example for their idea.');
  } else {
    lines.push('2. Give each group one main idea you already taught in this chapter.');
    lines.push('3. In about 8 minutes, each group prepares one real-life example.');
  }
  lines.push('4. Each group presents for about 2 minutes.');
  lines.push('5. After each group, add one point they missed and ask one short question.');
  return lines.join('\n');
}

export function buildMinimalDayPlan(input: {
  chapterTitle: string;
  role: ChapterDayRole;
  sectionHint?: string;
  activityThemes?: string[];
}): {
  objectives: string[];
  teacherNotes: string | null;
  titleSuffix: string;
  kind: PlannerLessonKind;
  primaryStage: LessonStage;
} {
  const chapter = displayChapterTitle(input.chapterTitle);
  const hint =
    input.sectionHint && input.sectionHint.length > 3 ? ` (${input.sectionHint})` : '';

  switch (input.role) {
    case 'INTRO':
      return {
        titleSuffix: roleLabels.INTRO,
        kind: PlannerLessonKind.TEACHING,
        primaryStage: LessonStage.INTRODUCTION,
        objectives: [
          `Introduce ${chapter} with one short example, then open the textbook${hint}.`,
        ],
        teacherNotes: null,
      };
    case 'READING':
      return {
        titleSuffix: roleLabels.READING,
        kind: PlannerLessonKind.TEACHING,
        primaryStage: LessonStage.READING,
        objectives: [`Read today’s section with the class${hint}.`],
        teacherNotes: null,
      };
    case 'CONTINUE_READING':
      return {
        titleSuffix: roleLabels.CONTINUE_READING,
        kind: PlannerLessonKind.TEACHING,
        primaryStage: LessonStage.READING,
        objectives: [`Continue reading from where you stopped last time${hint}.`],
        teacherNotes: null,
      };
    case 'EXERCISE':
      return {
        titleSuffix: roleLabels.EXERCISE,
        kind: PlannerLessonKind.TEACHING,
        primaryStage: LessonStage.GUIDED_PRACTICE,
        objectives: [`Do textbook exercises for this part of ${chapter}.`],
        teacherNotes: null,
      };
    case 'ACTIVITY':
      return {
        titleSuffix: roleLabels.ACTIVITY,
        kind: PlannerLessonKind.ACTIVITY,
        primaryStage: LessonStage.ACTIVITY,
        objectives: [`Class activity: groups recall the main ideas of ${chapter} with a real-life example.`],
        teacherNotes: activityConductNotes(chapter, input.activityThemes ?? []),
      };
  }
}
