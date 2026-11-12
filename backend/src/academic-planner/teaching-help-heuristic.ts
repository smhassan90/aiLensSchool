import { TeachingHelpOutput } from '../ai/schemas/teaching-help.schema';
import {
  ActivitySection,
  buildActivityDayScript,
  ideasFromChapterText,
  pickActivityStyle,
  shortTeachingIdeas,
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

function sectionsFromThemes(themes: string[]): ActivitySection[] {
  return themes
    .map((theme) => {
      const text = theme.replace(/\s+/g, ' ').trim();
      return { title: text.slice(0, 90), fact: text.slice(0, 160) };
    })
    .filter((section) => section.title.length >= 8 && section.fact.length >= 8)
    .slice(0, 12);
}

function buildChapterActivityHelp(input: {
  lessonTitle: string;
  chapterTitle: string;
  classLabel: string;
  subjectName: string;
  bookTitle?: string | null;
  themes: string[];
  sections?: ActivitySection[];
  formatIndex?: number;
}): TeachingHelpOutput {
  const sections = input.sections && input.sections.length > 0 ? input.sections : sectionsFromThemes(input.themes);
  const script = buildActivityDayScript({
    chapterTitle: input.chapterTitle,
    sections,
    formatIndex: input.formatIndex ?? 0,
  });
  const sourceLabel = input.bookTitle?.trim() || input.chapterTitle;
  const fit = (text: string, max: number) => {
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    const space = cut.lastIndexOf(' ');
    return (space > 8 ? cut.slice(0, space) : cut).trim();
  };
  const steps = script.steps.map((step) => fit(step, 400)).filter((step) => step.length >= 8);
  const example = fit(script.example, 500);
  const claims = script.boardLines.map((line) => fit(line, 400)).filter((line) => line.length >= 8).slice(0, 8);
  const objective = fit(script.objective, 300);

  return {
    overview: {
      subject: input.subjectName,
      classLabel: input.classLabel,
      lessonTitle: input.lessonTitle.slice(0, 200),
      teachingOverview: fit(script.objective, 1500),
      estimatedDurationMinutes: 40,
      durationIsSuggestion: true,
    },
    learningObjectives: [objective],
    teacherExplanation: {
      simpleExplanation: script.youSay.length >= 20 ? script.youSay.slice(0, 3000) : `${script.youSay} Open the textbook and follow the steps.`,
      stepByStep: steps.slice(0, 10),
      terminology: [],
      examples: [example],
    },
    classroomDelivery: {
      warmUp: script.youSay.slice(0, 800),
      teachingSteps: steps.slice(0, 4),
      questionsDuringLesson: [
        fit(`What textbook fact belongs with ${sections[0]?.title ?? 'the first section'}?`, 300),
        fit(`How does ${sections[1]?.title ?? input.chapterTitle} fit the same activity?`, 300),
      ],
      activity: {
        title: script.formatName,
        materials: script.youNeed,
        steps: steps.slice(0, 6),
        minutes: 40,
      },
      recap: fit(script.doneWhen, 600),
    },
    assessment: {
      formativeQuestions: [
        {
          question: fit(script.doneWhen, 400),
          expectedAnswer: 'Names two sections and one fact from the textbook.',
          kind: 'understanding',
        },
      ],
      exitTicket: 'Write one fact from your section and one fact you heard from another section.',
    },
    differentiation: {
      struggling: ['Give the student the section name and let them finish the sentence from the book.'],
      extension: ['Ask for a second example from today that the class has not used yet.'],
    },
    sourceAndConfidence: {
      sourcesUsed: [sourceLabel.slice(0, 180)],
      sourceSupportedClaims: claims,
      pedagogicalSuggestions: [`Activity format: ${script.formatName}.`],
      missingOrAmbiguous:
        sections.length < 2 ? ['Few sections were found; add the missing textbook headings before class.'] : [],
      limitations: 'Same activity as the planner day. Match the names to the textbook before class.',
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
  sections?: ActivitySection[];
  formatIndex?: number;
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
      sections: input.sections,
      formatIndex: input.formatIndex,
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
