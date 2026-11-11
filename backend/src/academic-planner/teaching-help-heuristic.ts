import { TeachingHelpOutput } from '../ai/schemas/teaching-help.schema';
import {
  ideasFromChapterText,
  pickActivityStyle,
  shortTeachingIdeas,
  themeShortLabel,
  workedPartExamples,
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
  const partCount = Math.max(labels.length, 3);
  const sourceLabel = input.bookTitle?.trim() || input.chapterTitle;
  const steps = [
    'Read each numbered part on the board slowly (about one minute).',
    'Each group takes one part. They write: simple meaning, one line from the book, one real example (school, road, or home).',
    'Each group shares for about two minutes. You add one fact they missed.',
    'One student joins two parts in one short sentence.',
  ];

  const partExamples = workedPartExamples(input.themes);
  const examples = [
    `You say: “Today we close the unit. I numbered ${partCount} parts on the board. Your group explains your part in easy words — not only the first topic in the book.”`,
    ...partExamples,
  ];

  return {
    overview: {
      subject: input.subjectName,
      classLabel: input.classLabel,
      lessonTitle: input.lessonTitle,
      teachingOverview: `Whole-unit recap: students explain ${partCount} main parts in simple words, with a real example for each part.`,
      estimatedDurationMinutes: 40,
      durationIsSuggestion: true,
    },
    learningObjectives: [
      'Each group explains one part in plain words and gives one real example.',
      'The class can name how two different parts fit the unit title.',
    ],
    teacherExplanation: {
      simpleExplanation:
        'Put the main parts on the board. Groups own one part each. Your job is to listen, then add one missing line from the textbook.',
      stepByStep: steps,
      terminology: [],
      examples,
    },
    classroomDelivery: {
      warmUp: 'Ask: “Name three different things from this unit — not the same thing three times.”',
      teachingSteps: ['Keep your talk short. Groups do most of the explaining.'],
      questionsDuringLesson: [
        'Which part was hardest to say in your own words?',
        'What example from home or school fits your part?',
      ],
      activity: {
        title: 'Chapter recap',
        materials: 'Board, textbook, notebooks.',
        steps,
        minutes: 35,
      },
      recap: 'One student links two board parts in one sentence (e.g. road safety and debate rules).',
    },
    assessment: {
      formativeQuestions: [
        {
          question: 'Explain your group’s part in your own words, with one example.',
          expectedAnswer: 'Names the part clearly and gives one example that matches the textbook idea.',
          kind: 'understanding',
        },
      ],
      exitTicket: 'Write one point from your part and one point you heard from another group.',
    },
    differentiation: {
      struggling: ['Give the group the first sentence of their part from the book to finish in simple words.'],
      extension: ['Ask the group to write one short exam-style question about their part.'],
    },
    sourceAndConfidence: {
      sourcesUsed: [sourceLabel.slice(0, 180)],
      sourceSupportedClaims: input.themes.slice(0, 5),
      pedagogicalSuggestions: [
        'Student work template (copy on the board): Part name | Simple meaning | One line from the book | One home/school example — each group fills one row set.',
        'Match board part names to your textbook headings before class.',
      ],
      missingOrAmbiguous:
        input.themes.length < 2
          ? ['Few teaching points were found; add board parts from the textbook headings.']
          : [],
      limitations: 'Draft from chapter notes — check names and examples in your textbook before class.',
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
