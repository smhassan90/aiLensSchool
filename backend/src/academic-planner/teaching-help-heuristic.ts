import { TeachingHelpOutput } from '../ai/schemas/teaching-help.schema';
import {
  buildChapterActivityScript,
  ideasFromChapterText,
  pickActivityStyle,
  shortTeachingIdeas,
  themeShortLabel,
} from './classroom-activity-styles';

function usableObjectives(objectives: string[]): string[] {
  return shortTeachingIdeas(
    objectives.filter(
      (line) =>
        !/groups recall|make groups of|help me teach|class activity|real-life example|two choices|chapter recap:/i.test(
          line,
        ),
    ),
    5,
  );
}

function isChapterActivityLesson(lessonTitle: string, mode?: string): boolean {
  if (mode === 'CLASSROOM_ACTIVITY') return true;
  return /\bactivity\b/i.test(lessonTitle);
}

function buildChapterActivityHelp(input: {
  lessonTitle: string;
  chapterTitle: string;
  classLabel: string;
  subjectName: string;
  bookTitle?: string | null;
  themes: string[];
  variety?: number;
}): TeachingHelpOutput {
  const labels = input.themes.map(themeShortLabel);
  const sourceLabel = input.bookTitle?.trim() || input.chapterTitle;
  const steps = [
    'Read the numbered parts from the board once.',
    'Groups take one part each; write meaning, one textbook line, one real example.',
    'Groups share for two minutes; you add one missing detail from the book.',
    'Close: one sentence linking at least two parts to the chapter title.',
  ];

  const examples = [
    `You say: "Each group owns one part: ${labels.slice(0, 3).join('; ')}.${labels.length > 3 ? ' …' : ''} Explain it so a Class 6 student understands."`,
    `Good group line: they use their part plus one concrete example (school gate, road, debate in class). Weak: repeating only part 1 or copying one helmet sentence from the book.`,
  ];

  return {
    overview: {
      subject: input.subjectName,
      classLabel: input.classLabel,
      lessonTitle: input.lessonTitle,
      teachingOverview: `Chapter recap for ${input.chapterTitle}. Students work through ${Math.max(labels.length, 3)} main parts, not one topic only.`,
      estimatedDurationMinutes: 40,
      durationIsSuggestion: true,
    },
    learningObjectives: [
      'Each group can explain one part of the chapter in plain words with one real-life example.',
      'The class can say how at least two parts fit the chapter title.',
    ],
    teacherExplanation: {
      simpleExplanation:
        'This period is a recap of the whole chapter. Put each main part on the board and let groups own one part each.',
      stepByStep: steps,
      terminology: [],
      examples,
    },
    classroomDelivery: {
      warmUp: `Ask: "Name three different things we learned in ${input.chapterTitle} — not the same idea three times."`,
      teachingSteps: ['Follow the chapter recap script. Keep your talk short; groups do the thinking.'],
      questionsDuringLesson: [
        'Which part was hardest to explain in your own words?',
        'What example would you use for your part outside school?',
      ],
      activity: {
        title: 'Chapter recap',
        materials: 'Board, textbook, notebooks.',
        steps,
        minutes: 35,
      },
      recap: 'One student links two board parts in a single sentence using the chapter title.',
    },
    assessment: {
      formativeQuestions: [
        {
          question: `Pick your group's part and explain it without reading the chapter title aloud.`,
          expectedAnswer: 'Uses the assigned part plus one accurate example from the chapter themes.',
          kind: 'understanding',
        },
      ],
      exitTicket: 'Write one thing from your part and one thing from another group’s part.',
    },
    differentiation: {
      struggling: ['Give the group the first sentence of their part from the textbook to finish.'],
      extension: ['Ask the group to pose one exam-style question about their part for the class.'],
    },
    sourceAndConfidence: {
      sourcesUsed: [sourceLabel.slice(0, 180)],
      sourceSupportedClaims: input.themes.slice(0, 5),
      pedagogicalSuggestions: ['Chapter recap script. Match board parts to your textbook before class.'],
      missingOrAmbiguous:
        input.themes.length < 2
          ? ['Few teaching points were found; add board parts from the textbook headings.']
          : [],
      limitations:
        input.themes.length < 2
          ? 'Add board parts from textbook headings before class.'
          : 'Short plan from the chapter notes. Verify against the textbook.',
    },
  };
}

export function heuristicTeachingHelp(input: {
  lessonTitle: string;
  chapterTitle: string;
  classLabel: string;
  subjectName: string;
  objectives: string[];
  bookTitle?: string | null;
  mode?: string;
  chapterExcerpt?: string;
  variety?: number;
}): TeachingHelpOutput {
  const fromText = ideasFromChapterText(input.chapterExcerpt, 6);
  const fromObjectives = usableObjectives(input.objectives);
  const themes = shortTeachingIdeas([...fromText, ...fromObjectives], 5);

  if (isChapterActivityLesson(input.lessonTitle, input.mode)) {
    return buildChapterActivityHelp({
      lessonTitle: input.lessonTitle,
      chapterTitle: input.chapterTitle,
      classLabel: input.classLabel,
      subjectName: input.subjectName,
      bookTitle: input.bookTitle,
      themes,
      variety: input.variety,
    });
  }

  const ideas = themes.slice(0, 2);
  const focus = ideas[0] ?? 'the main idea on today’s pages';
  const style = pickActivityStyle(
    `${input.chapterTitle}|${input.lessonTitle}|${input.subjectName}`,
    input.variety ?? 0,
  );
  const sourceLabel = input.bookTitle?.trim() || input.chapterTitle;
  const steps = style.steps(ideas).slice(0, 4);

  return {
    overview: {
      subject: input.subjectName,
      classLabel: input.classLabel,
      lessonTitle: input.lessonTitle,
      teachingOverview: `Explain this in plain words: ${focus}. Then let students try it once.`,
      estimatedDurationMinutes: style.minutes,
      durationIsSuggestion: true,
    },
    learningObjectives: [style.goal],
    teacherExplanation: {
      simpleExplanation: `Say it once, slowly: ${focus}. Then give the class example so they can hear what it sounds like.`,
      stepByStep: steps.slice(0, 3),
      terminology: [],
      examples: style.example(ideas),
    },
    classroomDelivery: {
      warmUp: 'Ask who has seen this idea before in real life (one example, not the chapter title).',
      teachingSteps: [
        `Explain ${focus} with one example from the textbook.`,
        'Do one example together before anyone works alone.',
        'Stop and correct the first misunderstanding you hear.',
      ],
      questionsDuringLesson: [
        'What is the part that matters here?',
        'What would a wrong answer sound like?',
      ],
      activity: {
        title: style.name,
        materials: style.materials,
        steps,
        minutes: style.minutes,
      },
      recap: 'One student states the idea in a single sentence with one example.',
    },
    assessment: {
      formativeQuestions: [
        {
          question: 'Explain today’s idea in your own words with one example.',
          expectedAnswer: 'Uses the idea with an example, not only the chapter name.',
          kind: 'understanding',
        },
      ],
      exitTicket: 'Write one sentence you could teach to a friend about today’s idea.',
    },
    differentiation: {
      struggling: ['Give the student the first few words and let them finish the sentence.'],
      extension: ['Ask for a second example that is not the one already used in class.'],
    },
    sourceAndConfidence: {
      sourcesUsed: [sourceLabel.slice(0, 180)],
      sourceSupportedClaims: ideas,
      pedagogicalSuggestions: [`Activity format: ${style.name}.`],
      missingOrAmbiguous:
        ideas.length > 0 ? [] : ['Chapter text was thin, so the example stays general.'],
      limitations:
        ideas.length > 0
          ? 'Short plan from the chapter notes. Match the wording to the textbook before class.'
          : 'Chapter text was limited. Add one textbook example before you teach.',
    },
  };
}
