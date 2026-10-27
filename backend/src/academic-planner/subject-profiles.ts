import { LessonStage } from '@prisma/client';

export type SubjectProfile =
  | 'MATHEMATICS'
  | 'LANGUAGE'
  | 'SCIENCE'
  | 'ISLAMIAT_QURAN'
  | 'GENERAL';

export function detectSubjectProfile(subjectName: string): SubjectProfile {
  const s = subjectName.toLowerCase();
  if (/islam|islamiyat|islamiat|nazra|nazira|qaida|quran|قرآن|اسلام/.test(s)) return 'ISLAMIAT_QURAN';
  if (/math|mathematics|algebra|geometry/.test(s)) return 'MATHEMATICS';
  if (/english|urdu|sindhi|language|grammar|comprehension/.test(s)) return 'LANGUAGE';
  if (/physics|chemistry|biology|science/.test(s)) return 'SCIENCE';
  return 'GENERAL';
}

export function heuristicChapterAnalysis(input: {
  chapterTitle: string;
  chapterText: string;
  subjectName: string;
  periodMinutes: number;
  activityCount: number;
  activitiesEnabled: boolean;
}) {
  const profile = detectSubjectProfile(input.subjectName);
  const words = input.chapterText.trim().split(/\s+/).filter(Boolean).length;
  const totalMinutes = Math.max(input.periodMinutes * 2, Math.min(600, Math.round(words * 0.35)));
  const portionMinutes = Math.max(input.periodMinutes, Math.min(120, Math.round(totalMinutes / 2)));

  const stagesForProfile: Array<{ stage: LessonStage; share: number }> =
    profile === 'MATHEMATICS'
      ? [
          { stage: LessonStage.INTRODUCTION, share: 0.1 },
          { stage: LessonStage.EXPLANATION, share: 0.25 },
          { stage: LessonStage.WORKED_EXAMPLES, share: 0.25 },
          { stage: LessonStage.GUIDED_PRACTICE, share: 0.2 },
          { stage: LessonStage.WRITTEN_EXERCISES, share: 0.2 },
        ]
      : profile === 'LANGUAGE'
        ? [
            { stage: LessonStage.READING, share: 0.25 },
            { stage: LessonStage.VOCABULARY, share: 0.15 },
            { stage: LessonStage.GRAMMAR, share: 0.2 },
            { stage: LessonStage.COMPREHENSION, share: 0.2 },
            { stage: LessonStage.WRITTEN_EXERCISES, share: 0.2 },
          ]
        : profile === 'ISLAMIAT_QURAN'
          ? [
              { stage: LessonStage.RECITATION, share: 0.3 },
              { stage: LessonStage.EXPLANATION, share: 0.3 },
              { stage: LessonStage.DISCUSSION, share: 0.2 },
              { stage: LessonStage.WRITTEN_EXERCISES, share: 0.2 },
            ]
          : [
              { stage: LessonStage.INTRODUCTION, share: 0.15 },
              { stage: LessonStage.EXPLANATION, share: 0.35 },
              { stage: LessonStage.WORKED_EXAMPLES, share: 0.2 },
              { stage: LessonStage.INDEPENDENT_PRACTICE, share: 0.3 },
            ];

  const stages = stagesForProfile.map((row) => ({
    stage: row.stage,
    minutes: Math.max(3, Math.round(portionMinutes * row.share)),
  }));

  const anchor = input.chapterText.replace(/\s+/g, ' ').trim().slice(0, 80);
  const objectives = [
    `Understand the main ideas in ${input.chapterTitle}`,
    `Apply key concepts from ${input.chapterTitle} in class exercises`,
    `Complete practice aligned with ${input.subjectName} outcomes`,
  ];

  return {
    complexity: words > 2500 ? 'HIGH' : words > 900 ? 'MEDIUM' : 'LOW',
    objectives,
    prerequisites: [] as string[],
    portions: [
      {
        portionKey: 'p1',
        title: input.chapterTitle,
        contentAnchor: anchor.length >= 8 ? anchor : `${input.chapterTitle} content`,
        kind: 'CONCEPT' as const,
        stages,
        minMinutes: Math.max(3, portionMinutes - 10),
        maxMinutes: portionMinutes + 30,
        dependsOn: [] as string[],
        exerciseCount: 0,
        compressible: profile === 'MATHEMATICS' || profile === 'SCIENCE',
      },
    ],
    activitySuggestions:
      input.activitiesEnabled && input.activityCount > 0
        ? [
            {
              title: 'Class activity',
              description: `Short collaborative task for ${input.chapterTitle}`,
              minutes: 15,
              afterPortionKey: 'p1' as string | null,
            },
          ].slice(0, input.activityCount)
        : [],
    revisionMinutes: 0,
    assessmentMinutes: 0,
    practicalRequirements: [] as string[],
    notes: [] as string[],
  };
}
