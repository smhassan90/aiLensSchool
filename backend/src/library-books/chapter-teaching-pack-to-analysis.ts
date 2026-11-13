import { LessonStage, PlannerAnalysisSource } from '@prisma/client';
import {
  PlannerChapterAnalysis,
  PlannerChapterAnalysisSchema,
} from '../ai/schemas/planner-chapter-analysis.schema';
import { detectSubjectProfile } from '../academic-planner/subject-profiles';
import { teacherGuideBullets } from '../academic-planner/section-teaching-plan';

export type TeachingPackForAnalysis = {
  contentHash: string;
  complexity: string;
  summary: string;
  teacherGuide: unknown;
  source: PlannerAnalysisSource;
  promptVersion: string;
  readingSlices: Array<{
    sliceKey: string;
    title: string;
    readingFrom: string;
    readingTo: string | null;
    explainPoints: unknown;
  }>;
  questions: Array<{
    sliceKey: string | null;
    question: string;
    format: string;
    expectedAnswer?: string | null;
  }>;
  activities: Array<{
    sliceKey: string | null;
    title: string;
    description: string;
    participationTechnique: string;
    materials?: string | null;
    learningObjective?: string | null;
    teacherSteps?: unknown;
    expectedOutcome?: string | null;
    durationMinutes?: number | null;
  }>;
  revisionPoints: Array<{ sliceKey: string | null; point: string }>;
};

function sliceKeyToPortionKey(sliceKey: string): string {
  const n = sliceKey.replace(/^s/i, '');
  return `p${n || '1'}`;
}

function asStringArray(value: unknown): string[] {
  return teacherGuideBullets(value);
}

function stagesForSlice(input: {
  subjectName: string;
  periodMinutes: number;
  explainPointCount: number;
}): Array<{ stage: LessonStage; minutes: number }> {
  const profile = detectSubjectProfile(input.subjectName);
  const pm = Math.max(20, input.periodMinutes);
  const templates: Array<{ stage: LessonStage; share: number }> =
    profile === 'LANGUAGE'
      ? [
          { stage: LessonStage.INTRODUCTION, share: 0.1 },
          { stage: LessonStage.READING, share: 0.3 },
          { stage: LessonStage.EXPLANATION, share: 0.35 },
          { stage: LessonStage.DISCUSSION, share: 0.25 },
        ]
      : profile === 'MATHEMATICS'
        ? [
            { stage: LessonStage.INTRODUCTION, share: 0.1 },
            { stage: LessonStage.EXPLANATION, share: 0.35 },
            { stage: LessonStage.WORKED_EXAMPLES, share: 0.3 },
            { stage: LessonStage.GUIDED_PRACTICE, share: 0.25 },
          ]
        : [
            { stage: LessonStage.INTRODUCTION, share: 0.12 },
            { stage: LessonStage.READING, share: 0.28 },
            { stage: LessonStage.EXPLANATION, share: 0.35 },
            { stage: LessonStage.DISCUSSION, share: 0.25 },
          ];

  const stages = templates.map((row) => ({
    stage: row.stage,
    minutes: Math.max(3, Math.round(pm * row.share)),
  }));
  if (input.explainPointCount > 4) {
    stages.push({ stage: LessonStage.REVISION, minutes: Math.max(3, Math.round(pm * 0.1)) });
  }
  return stages;
}

export function teachingPackToPlannerAnalysis(input: {
  pack: TeachingPackForAnalysis;
  chapterTitle: string;
  subjectName: string;
  periodMinutes: number;
  activitiesEnabled: boolean;
  activityCount: number;
}): PlannerChapterAnalysis {
  const { pack, chapterTitle, subjectName, periodMinutes, activityCount } = input;
  const profile = detectSubjectProfile(subjectName);
  const guide = asStringArray(pack.teacherGuide);

  const objectives = guide.slice(0, 3);
  if (objectives.length < 1) {
    objectives.push(`Cover ${chapterTitle} using the textbook reading plan`);
  }
  while (objectives.length < 3) {
    objectives.push(`Check understanding of ${chapterTitle} through oral and written questions`);
  }

  const portions = pack.readingSlices.map((slice) => {
    const explainPoints = asStringArray(slice.explainPoints);
    const anchor = slice.readingFrom.replace(/\s+/g, ' ').trim().slice(0, 100);
    const stages = stagesForSlice({
      subjectName,
      periodMinutes,
      explainPointCount: explainPoints.length,
    });
    const portionMinutes = stages.reduce((sum, s) => sum + s.minutes, 0);
    return {
      portionKey: sliceKeyToPortionKey(slice.sliceKey),
      title: slice.title.slice(0, 160),
      contentAnchor: anchor.length >= 8 ? anchor : `${slice.title} — ${chapterTitle}`.slice(0, 120),
      kind:
        profile === 'LANGUAGE'
          ? ('READING' as const)
          : profile === 'MATHEMATICS'
            ? ('CONCEPT' as const)
            : ('CONCEPT' as const),
      stages,
      minMinutes: Math.max(3, portionMinutes - 15),
      maxMinutes: Math.min(600, portionMinutes + 20),
      dependsOn: [] as string[],
      exerciseCount: pack.questions.filter((q) => q.sliceKey === slice.sliceKey).length,
      compressible: profile !== 'ISLAMIAT_QURAN',
    };
  });

  const writtenCount = pack.questions.filter((q) => q.format === 'WRITTEN').length;
  // Saved activities stay available when activitiesEnabled is the create() default of false.
  // A teacher turns the feature off by saving activityCount 0.
  const activityLimit = activityCount === 0 ? 0 : 5;
  const activitySuggestions = pack.activities.slice(0, activityLimit).map((a) => ({
    title: a.title.slice(0, 160),
    description: `${a.description} ${a.participationTechnique}`.replace(/\s+/g, ' ').trim().slice(0, 600),
    minutes: Math.min(120, Math.max(5, a.durationMinutes ?? Math.min(30, Math.round(periodMinutes * 0.35)))),
    afterPortionKey: a.sliceKey ? sliceKeyToPortionKey(a.sliceKey) : null,
  }));

  const complexity =
    pack.complexity === 'LOW' || pack.complexity === 'MEDIUM' || pack.complexity === 'HIGH'
      ? pack.complexity
      : portions.length >= 5
        ? 'HIGH'
        : portions.length >= 3
          ? 'MEDIUM'
          : 'LOW';

  const raw = {
    complexity,
    objectives: objectives.slice(0, 12).map((o) => o.slice(0, 300)),
    prerequisites: [] as string[],
    portions: portions.length
      ? portions
      : [
          {
            portionKey: 'p1',
            title: chapterTitle.slice(0, 160),
            contentAnchor: pack.summary.slice(0, 120),
            kind: 'CONCEPT' as const,
            stages: stagesForSlice({ subjectName, periodMinutes, explainPointCount: 1 }),
            minMinutes: periodMinutes,
            maxMinutes: periodMinutes + 20,
            dependsOn: [] as string[],
            exerciseCount: 0,
            compressible: true,
          },
        ],
    activitySuggestions,
    revisionMinutes: Math.min(periodMinutes * 2, Math.max(0, pack.revisionPoints.length) * 8),
    assessmentMinutes: Math.min(periodMinutes * 2, writtenCount * 12),
    practicalRequirements: [] as string[],
    notes: [pack.summary.slice(0, 300)],
  };

  return PlannerChapterAnalysisSchema.parse(raw);
}
