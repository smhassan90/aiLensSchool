import { TeachingHelpOutput } from '../ai/schemas/teaching-help.schema';

/** Dev-only template when no AI provider key is configured — not content-grounded. */
export function heuristicTeachingHelp(input: {
  lessonTitle: string;
  chapterTitle: string;
  classLabel: string;
  subjectName: string;
  objectives: string[];
  bookTitle?: string | null;
}): TeachingHelpOutput {
  const sourceLabel = input.bookTitle
    ? `${input.bookTitle} — ${input.chapterTitle}`
    : input.chapterTitle;
  const objectives =
    input.objectives.length > 0
      ? input.objectives
      : [`Understand the main ideas in "${input.lessonTitle}".`];

  return {
    overview: {
      subject: input.subjectName,
      classLabel: input.classLabel,
      lessonTitle: input.lessonTitle,
      teachingOverview: `This session introduces "${input.lessonTitle}" from ${input.chapterTitle} for ${input.classLabel}. Focus on clear explanations and short checks for understanding. (Template — configure an AI provider for content-grounded suggestions.)`,
      estimatedDurationMinutes: null,
      durationIsSuggestion: true,
    },
    learningObjectives: objectives.slice(0, 4),
    teacherExplanation: {
      simpleExplanation: `Teach "${input.lessonTitle}" in plain language suited to ${input.classLabel}. Connect new ideas to what students already know from ${input.chapterTitle}.`,
      stepByStep: objectives.length
        ? objectives.map((o, i) => `Step ${i + 1}: Work toward — ${o}`)
        : [
            'Step 1: Recall prior knowledge with a short prompt.',
            'Step 2: Model the concept on the board.',
            'Step 3: Guide a worked example together.',
          ],
      terminology: [],
      examples: [`Use a simple everyday example linked to ${input.chapterTitle}.`],
    },
    classroomDelivery: {
      warmUp: 'Ask one recall question from the previous lesson or a real-life hook related to the topic.',
      teachingSteps: [
        'State the lesson goal in student-friendly language.',
        'Explain the core idea with one visual or demonstration.',
        'Practice one guided example as a class.',
        'Give brief independent practice.',
      ],
      questionsDuringLesson: [
        'What do you already know about this topic?',
        'Can you explain this in your own words?',
        'Where might you use this outside class?',
      ],
      activity: {
        title: 'Pair share',
        materials: 'Notebook and pencil for each pair.',
        steps: ['Pairs answer one guided prompt.', 'Share responses with the class.', 'Clarify misconceptions.'],
        minutes: 10,
      },
      recap: 'Summarize the main idea and preview what comes next.',
    },
    assessment: {
      formativeQuestions: [
        {
          question: 'State one key idea from today’s lesson in a full sentence.',
          expectedAnswer: 'Answers should reflect the stated learning objective.',
          kind: 'understanding',
        },
      ],
      exitTicket: 'Write one thing you learned and one question you still have.',
    },
    differentiation: {
      struggling: ['Break steps into smaller chunks and provide a worked example on the board.'],
      extension: ['Ask students to create a second example and explain each step.'],
    },
    sourceAndConfidence: {
      sourcesUsed: [sourceLabel],
      sourceSupportedClaims: [],
      pedagogicalSuggestions: [
        'Warm-up, pair share, and exit ticket are generic teaching suggestions (not from textbook text).',
      ],
      missingOrAmbiguous: [
        'No AI provider configured — this template is not grounded in retrieved chapter text.',
      ],
      limitations:
        'Template output only. Connect an AI provider and ensure chapter text is available for grounded assistance.',
    },
  };
}
