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

export function buildMinimalDayPlan(input: {
  chapterTitle: string;
  role: ChapterDayRole;
  sectionHint?: string;
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
        objectives: [
          `Active recap for ${chapter}. Use Help me teach for a custom activity based on the chapter summary.`,
        ],
        teacherNotes: null,
      };
  }
}
