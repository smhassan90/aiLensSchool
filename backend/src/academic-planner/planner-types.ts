import { LessonStage, PlannerLessonKind } from '@prisma/client';

export type StageSegment = {
  stage: LessonStage;
  minutes: number;
  portionKey?: string;
  activityKey?: string;
  part?: number;
  partCount?: number;
};

export type PlannerSettings = {
  revisionSlots: number;
  minRevisionSlots: number;
  minChapterStartMinutes: number;
  fallbackPeriodsPerWeek?: number;
  fallbackPeriodMinutes?: number;
  lastTeachingDate: string;
};

export type ScheduleSummary = {
  totalSlots: number;
  teachingSlots: number;
  revisionSlots: number;
  usedSlots: number;
  slackSlots: number;
  requiredMinutes: number;
  capacityMinutes: number;
  unscheduledLessonCount: number;
  predictedCompletionDate: string | null;
  feasibility: 'FEASIBLE' | 'AT_RISK' | 'INFEASIBLE';
  shortfallMinutes: number;
  alternatives: Array<{
    code:
      | 'USE_REVISION_BUFFER'
      | 'COMPRESS_PRACTICE'
      | 'DROP_OPTIONAL_ACTIVITIES'
      | 'ADD_PERIODS'
      | 'ADD_WORKING_DAYS'
      | 'LATER_EXAM_DATE';
    detail: string;
    recoversMinutes?: number;
    earliestFeasibleExamDate?: string;
  }>;
  warnings: Array<{ code: string; message: string; chapterKey?: string; lessonKey?: string }>;
  timetableSource: 'VERSIONED' | 'LEGACY' | 'FALLBACK';
};

export type TeachingSlot = {
  date: string;
  periodNumber: number;
  startTime: string | null;
  endTime: string | null;
  minutes: number;
};

export type ScheduleLessonDraft = {
  lessonKey: string;
  chapterKey: string | null;
  sequence: number;
  kind: PlannerLessonKind;
  title: string;
  primaryStage: LessonStage;
  stages: StageSegment[];
  objectives: string[];
  portionKeys: string[];
  dependsOnKeys: string[];
  plannedMinutes: number;
  scheduledDate: string | null;
  periodNumber: number | null;
  slotStartTime: string | null;
  slotEndTime: string | null;
  frozen: boolean;
  isContinuation: boolean;
};

export type PackSegment = {
  chapterKey: string;
  chapterTitle: string;
  portionKey?: string;
  portionTitle?: string;
  activityKey?: string;
  stage: LessonStage;
  minutes: number;
  required: boolean;
  compressible: boolean;
  floorMinutes: number;
  optional?: boolean;
};

export type PlannerVersionPayload = {
  planner: {
    id: string;
    title: string;
    status: string;
    sectionId: string;
    classLabel: string;
    subject: { id: string; name: string };
    teacher: { id: string; name: string };
    examType: string;
    examDate: string;
    startDate: string;
    approvedVersionId: string | null;
    workingVersionId: string | null;
    lockRevision: number;
    libraryBook: { id: string; title: string } | null;
  };
  version: {
    id: string;
    versionNumber: number;
    status: string;
    origin: string;
    revision: number;
    basedOnVersionId: string | null;
    settings: PlannerSettings;
    summary: ScheduleSummary | null;
    examRisk: string | null;
    changeReason: string | null;
    changeReasonNote: string | null;
    impact: unknown;
    submittedAt: string | null;
    decidedAt: string | null;
    decisionComment: string | null;
    createdById: string;
  };
  permissions: {
    canEdit: boolean;
    canSubmit: boolean;
    canWithdraw: boolean;
    canDecide: boolean;
    canPublishDirectly: boolean;
    canCreateRevision: boolean;
    canRequestRecovery: boolean;
    canRegenerateRecovery: boolean;
    canRecord: boolean;
  };
  chapters: Array<Record<string, unknown>>;
  activities: Array<Record<string, unknown>>;
  lessons: Array<{
    lessonKey: string;
    chapterKey: string | null;
    sequence: number;
    kind: string;
    title: string;
    primaryStage: LessonStage;
    stages: StageSegment[];
    objectives: string[];
    plannedMinutes: number;
    dependsOnKeys: string[];
    date: string | null;
    periodNumber: number | null;
    startTime: string | null;
    endTime: string | null;
    frozen: boolean;
    isContinuation: boolean;
    progress: null;
  }>;
  calendar: {
    from: string;
    to: string;
    lastTeachingDate: string;
    examDate: string;
    days: Array<Record<string, unknown>>;
  };
  warnings: ScheduleSummary['warnings'];
};

export const defaultPlannerSettings = (examDateIso: string): PlannerSettings => {
  const exam = new Date(`${examDateIso}T00:00:00.000Z`);
  exam.setUTCDate(exam.getUTCDate() - 1);
  return {
    revisionSlots: 0,
    minRevisionSlots: 1,
    minChapterStartMinutes: 10,
    lastTeachingDate: exam.toISOString().slice(0, 10),
  };
};
