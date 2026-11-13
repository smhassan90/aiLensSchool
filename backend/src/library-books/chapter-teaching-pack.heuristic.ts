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

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : text.slice(0, max).trim();
}

function activityForSlice(
  slice: ChapterTeachingPackOutput['readingSlices'][number],
  title: string,
): ChapterTeachingPackOutput['activities'][number] {
  const line = clip(slice.readingFrom, 180);
  return {
    sliceKey: slice.sliceKey,
    title: clip(title, 160),
    learningObjective: clip(`Students can explain one idea from ${slice.title} using the textbook.`, 400),
    description: clip(`Use this line from ${slice.title}: ${line}`, 1200),
    materials: 'Textbook and notebooks',
    steps: [
      clip(`Read this line with the class: ${line}`, 400),
      'Ask each student to say what the line means in their own words.',
      'Correct one answer using the textbook line, not a new example.',
    ],
    participationTechnique: clip(
      `Student might say: "${clip(line, 80)}" You add: "Keep the meaning the textbook gives for ${slice.title}."`,
      800,
    ),
    expectedOutcome: clip(`Each student can say one fact from ${slice.title}.`, 400),
    durationMinutes: 15,
  };
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
    readingSlices.push({
      sliceKey: `s${readingSlices.length + 1}`,
      title: clip(chunk.length > 1 ? `${input.chapterTitle} — part ${i + 1}` : input.chapterTitle, 160),
      readingFrom: clip(chunk[0]!.slice(0, 200), 800),
      readingTo: clip(chunk[chunk.length - 1]!.slice(-200), 800) || null,
      explainPoints: chunk.slice(0, 4).map((p) => clip(p, 220)),
    });
  }

  if (!readingSlices.length) {
    const opening = clip(input.chapterText.slice(0, 200) || input.chapterTitle, 200);
    readingSlices.push({
      sliceKey: 's1',
      title: clip(input.chapterTitle, 160),
      readingFrom: opening.length >= 8 ? opening : clip(`${input.chapterTitle} from the textbook.`, 200),
      readingTo: clip(input.chapterText.slice(-200), 800) || null,
      explainPoints: [
        clip(`Introduce the main ideas of ${input.chapterTitle}.`, 220),
        clip(`Walk through key terms in ${input.subjectName} using the textbook.`, 220),
      ],
    });
  }

  const questions: ChapterTeachingPackOutput['questions'] = readingSlices.flatMap((slice, idx) => [
    {
      sliceKey: slice.sliceKey,
      question: clip(`What are the main points in ${slice.title}?`, 600),
      expectedAnswer: clip(slice.explainPoints[0] ?? 'See the textbook section covered in this slice.', 400),
      format: 'ORAL' as const,
    },
    {
      sliceKey: slice.sliceKey,
      question: clip(`Answer in writing: summarize ${slice.title} in 3–4 sentences.`, 600),
      expectedAnswer: clip(slice.explainPoints.join(' '), 400),
      format: 'WRITTEN' as const,
    },
    ...(idx === 0
      ? [
          {
            sliceKey: slice.sliceKey,
            question: 'Quick check: name two ideas from today’s reading.',
            expectedAnswer: clip(
              slice.explainPoints.slice(0, 2).join('; ') || 'Teacher accepts an answer that matches the textbook.',
              400,
            ),
            format: 'QUICK_FIRE' as const,
          },
        ]
      : []),
  ]);

  const first = readingSlices[0]!;
  const sectionNames = readingSlices.map((slice) => slice.title).join(', ');
  const activities: ChapterTeachingPackOutput['activities'] = [
    {
      sliceKey: null,
      title: 'Unit recap',
      learningObjective: clip(`Students can recall each section of ${input.chapterTitle}.`, 400),
      description: clip(
        `Write these section names on the board: ${sectionNames}. Each group owns one section and writes its meaning, one textbook line, and one real-life example.`,
        1200,
      ),
      materials: 'Board, textbook, notebooks',
      steps: [
        'Write the section names on the board and give each group one section.',
        'Each group writes the meaning, one textbook line, and one real-life example.',
        'Groups read their lines. Add one fact they missed from the textbook.',
      ],
      participationTechnique: clip(
        `Student might say: "${clip(first.readingFrom, 80)}" You add: "Use the line the textbook gives for ${first.title}."`,
        800,
      ),
      expectedOutcome: clip(`The class can name every section of ${input.chapterTitle}.`, 400),
      durationMinutes: 20,
    },
    ...readingSlices.slice(0, 4).map((slice) => activityForSlice(slice, slice.title)),
  ];
  if (activities.length < 3) {
    activities.push(activityForSlice(first, `${first.title} check`));
  }

  const revisionPoints: ChapterTeachingPackOutput['revisionPoints'] = readingSlices.flatMap((slice) =>
    slice.explainPoints.slice(0, 2).map((point) => ({
      sliceKey: slice.sliceKey,
      point: clip(point, 300),
    })),
  );
  if (!revisionPoints.length) {
    revisionPoints.push({ sliceKey: 's1', point: clip(`Review the main idea of ${input.chapterTitle}.`, 300) });
  }

  return {
    complexity,
    summary: clip(
      `This ${input.classLabel} ${input.subjectName} chapter "${input.chapterTitle}" covers ${readingSlices
        .map((slice) => slice.title)
        .join(', ')}. Teach each section from the textbook, then use the saved activities.`,
      4000,
    ),
    teacherGuide: readingSlices.flatMap((slice) => slice.explainPoints).slice(0, 12),
    readingSlices,
    questions,
    activities: activities.slice(0, 5),
    revisionPoints,
  };
}
