import type { ChapterTeachingPackOutput } from './schemas/chapter-teaching-pack.schema';

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 40);
}

export function heuristicChapterTeachingPack(input: {
  chapterTitle: string;
  chapterText: string;
  subjectName: string;
  classLabel: string;
}): ChapterTeachingPackOutput {
  const words = wordCount(input.chapterText);
  const complexity: ChapterTeachingPackOutput['complexity'] =
    words > 2500 ? 'HIGH' : words > 900 ? 'MEDIUM' : 'LOW';

  const paragraphs = splitParagraphs(input.chapterText);
  const chunkCount = complexity === 'HIGH' ? 4 : complexity === 'MEDIUM' ? 3 : 2;
  const chunkSize = Math.max(1, Math.ceil(paragraphs.length / chunkCount));

  const readingSlices: ChapterTeachingPackOutput['readingSlices'] = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = paragraphs.slice(i * chunkSize, (i + 1) * chunkSize);
    if (!chunk.length && i === 0) {
      chunk.push(input.chapterText.slice(0, 400).trim() || input.chapterTitle);
    }
    if (!chunk.length) continue;
    const sliceKey = `s${i + 1}` as const;
    readingSlices.push({
      sliceKey,
      title: chunk.length > 1 ? `${input.chapterTitle} — part ${i + 1}` : input.chapterTitle,
      readingFrom: chunk[0]!.slice(0, 200),
      readingTo: chunk[chunk.length - 1]!.slice(-200) || null,
      explainPoints: chunk.slice(0, 4).map((p) => p.slice(0, 220)),
    });
  }

  if (!readingSlices.length) {
    readingSlices.push({
      sliceKey: 's1',
      title: input.chapterTitle,
      readingFrom: input.chapterText.slice(0, 200) || input.chapterTitle,
      readingTo: input.chapterText.slice(-200) || null,
      explainPoints: [
        `Introduce the main ideas of ${input.chapterTitle}.`,
        `Walk through key terms in ${input.subjectName} using the textbook.`,
      ],
    });
  }

  const questions: ChapterTeachingPackOutput['questions'] = readingSlices.flatMap((slice, idx) => [
    {
      sliceKey: slice.sliceKey,
      question: `What are the main points in ${slice.title}?`,
      expectedAnswer: slice.explainPoints[0] ?? 'See textbook section covered in this slice.',
      format: 'ORAL' as const,
    },
    {
      sliceKey: slice.sliceKey,
      question: `Answer in writing: summarize ${slice.title} in 3–4 sentences.`,
      expectedAnswer: slice.explainPoints.join(' ').slice(0, 400),
      format: 'WRITTEN' as const,
    },
    ...(idx === 0
      ? [
          {
            sliceKey: slice.sliceKey,
            question: 'Quick check: name two ideas from today’s reading.',
            expectedAnswer: slice.explainPoints.slice(0, 2).join('; ') || 'Teacher accepts accurate student responses.',
            format: 'QUICK_FIRE' as const,
          },
        ]
      : []),
  ]);

  const activities: ChapterTeachingPackOutput['activities'] = readingSlices.map((slice) => ({
    sliceKey: slice.sliceKey,
    title: `Discuss ${slice.title}`,
    description: `Students stand in a circle. Each shares one sentence from the reading; teacher corrects gently.`,
    participationTechnique:
      'Go round the circle so every student speaks once; use a talking piece so only one voice at a time.',
    materials: null,
  }));

  const revisionPoints: ChapterTeachingPackOutput['revisionPoints'] = readingSlices.flatMap((slice) =>
    slice.explainPoints.slice(0, 2).map((point) => ({
      sliceKey: slice.sliceKey,
      point: point.slice(0, 300),
    })),
  );

  return {
    complexity,
    summary: `This ${input.classLabel} ${input.subjectName} chapter "${input.chapterTitle}" covers ${readingSlices.length} teaching slice(s). Focus on reading the textbook, explaining key points, checking with questions, and a short whole-class activity each cycle.`,
    teacherGuide: readingSlices.flatMap((s) => s.explainPoints).slice(0, 12),
    readingSlices,
    questions,
    activities,
    revisionPoints,
  };
}
