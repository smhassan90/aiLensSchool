import type { TeachingHelpOutput } from '../ai/schemas/teaching-help.schema';

function fit(value: string, min: number, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  const padded = text.length >= min ? text : `${text || 'Saved activity'} from this planner lesson.`.slice(0, max);
  return padded.slice(0, max);
}

function numberedSteps(notes: string): string[] {
  const fromNumbers = notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+\S/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, ''))
    .filter((line) => line.length >= 8);
  if (fromNumbers.length) return fromNumbers.slice(0, 6).map((step) => fit(step, 8, 400));
  return [fit(notes, 8, 400)];
}

/**
 * Help me teach for an activity day uses the instructions already saved on the lesson.
 */
export function teachingHelpFromSavedActivityNotes(input: {
  lessonTitle: string;
  chapterTitle: string;
  classLabel: string;
  subjectName: string;
  notes: string;
}): TeachingHelpOutput {
  const notes = input.notes.trim();
  const title =
    notes
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length >= 3 && !line.endsWith(':')) ?? input.lessonTitle;
  const steps = numberedSteps(notes);
  const materials = notes.match(/You need:\s*(.+)/i)?.[1]?.trim() || 'Textbook and notebooks';
  const duration = Number(notes.match(/Duration:\s*(\d+)/i)?.[1] ?? 20);
  const objective =
    notes.match(/Learning objective:\s*(.+)/i)?.[1]?.trim() || title;
  return {
    overview: {
      subject: fit(input.subjectName || 'Subject', 1, 120),
      classLabel: fit(input.classLabel || 'Class', 1, 120),
      lessonTitle: fit(input.lessonTitle, 1, 200),
      teachingOverview: fit(
        `Use the activity saved on this planner day: ${title}. Follow the instructions stored with the lesson.`,
        20,
        1500,
      ),
      estimatedDurationMinutes: Math.min(180, Math.max(5, duration || 20)),
      durationIsSuggestion: true,
    },
    learningObjectives: [fit(objective, 8, 300)],
    teacherExplanation: {
      simpleExplanation: fit(notes, 20, 3000),
      stepByStep: steps.slice(0, 10),
      terminology: [],
      examples: [],
    },
    classroomDelivery: {
      warmUp: fit(`Tell the class the activity name: ${title}.`, 8, 800),
      teachingSteps: steps.slice(0, 10),
      questionsDuringLesson: [fit(`What does ${title} ask you to do?`, 8, 300)],
      activity: {
        title: fit(title, 3, 160),
        materials: fit(materials, 3, 400),
        steps: steps.slice(0, 6),
        minutes: Math.min(120, Math.max(5, duration || 20)),
      },
      recap: 'Ask two students to say what they learned from this activity.',
    },
    assessment: {
      formativeQuestions: [
        {
          question: fit(`What did this activity ask you to do in ${input.chapterTitle}?`, 8, 400),
          expectedAnswer: fit(title, 1, 400),
          kind: 'recall',
        },
      ],
      exitTicket: fit(`Write one thing you did in ${title}.`, 8, 400),
    },
    differentiation: { struggling: [], extension: [] },
    sourceAndConfidence: {
      sourcesUsed: ['Saved planner activity instructions'],
      sourceSupportedClaims: [],
      pedagogicalSuggestions: [],
      missingOrAmbiguous: [],
      limitations: 'These instructions are the activity saved on the planner lesson.',
    },
  };
}
