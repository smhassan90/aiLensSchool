import { TeachingHelpOutput } from '../ai/schemas/teaching-help.schema';
import {
  ideasFromChapterText,
  pickActivityStyle,
  shortTeachingIdeas,
} from './classroom-activity-styles';

function usableObjectives(objectives: string[]): string[] {
  return shortTeachingIdeas(
    objectives.filter(
      (line) =>
        !/groups recall|make groups of|help me teach|class activity|real-life example/i.test(line),
    ),
    2,
  );
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
  const fromText = ideasFromChapterText(input.chapterExcerpt, 2);
  const fromObjectives = usableObjectives(input.objectives);
  const ideas = shortTeachingIdeas([...fromText, ...fromObjectives], 2);
  const focus = ideas[0] ?? 'the main idea on today’s pages';
  const style = pickActivityStyle(
    `${input.chapterTitle}|${input.lessonTitle}|${input.subjectName}`,
    input.variety ?? 0,
  );
  const isActivity = input.mode === 'CLASSROOM_ACTIVITY';
  const sourceLabel = input.bookTitle?.trim() || input.chapterTitle;
  const steps = style.steps(ideas).slice(0, 4);

  return {
    overview: {
      subject: input.subjectName,
      classLabel: input.classLabel,
      lessonTitle: input.lessonTitle,
      teachingOverview: isActivity
        ? `${style.name}. Students use this idea: ${focus}.`
        : `Explain this in plain words: ${focus}. Then let students try it once.`,
      estimatedDurationMinutes: style.minutes,
      durationIsSuggestion: true,
    },
    learningObjectives: [style.goal],
    teacherExplanation: {
      simpleExplanation: `Say it once, slowly: ${focus}. Ask one student to repeat it without reading the board.`,
      stepByStep: isActivity ? steps : steps.slice(0, 3),
      terminology: [],
      examples: ideas[1] ? [`Connect it to this as well: ${ideas[1]}.`] : [`Stay with this one idea: ${focus}.`],
    },
    classroomDelivery: {
      warmUp: `Ask who has met this before: ${focus}.`,
      teachingSteps: isActivity
        ? [`Run ${style.name}. Keep the talk short and the student work longer.`]
        : [
            `Explain ${focus} with one example from the textbook.`,
            'Do one example together before anyone works alone.',
            'Stop and correct the first misunderstanding you hear.',
          ],
      questionsDuringLesson: [
        `What is the part that matters in this idea: ${focus}?`,
        'What would a wrong answer sound like?',
      ],
      activity: {
        title: style.name,
        materials: style.materials,
        steps,
        minutes: style.minutes,
      },
      recap: `One student states this in a single sentence: ${focus}.`,
    },
    assessment: {
      formativeQuestions: [
        {
          question: `Explain this in your own words: ${focus}.`,
          expectedAnswer: 'A correct answer uses the idea itself, not the chapter name.',
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
