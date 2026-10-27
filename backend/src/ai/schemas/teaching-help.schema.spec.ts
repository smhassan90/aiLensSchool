import { TeachingHelpOutputSchema } from './teaching-help.schema';

const minimalValid = {
  overview: {
    subject: 'Math',
    classLabel: 'Grade 8',
    lessonTitle: 'Fractions intro',
    teachingOverview: 'This lesson introduces basic fraction concepts using examples from the chapter.',
    estimatedDurationMinutes: null,
    durationIsSuggestion: true,
  },
  learningObjectives: ['Students can identify numerator and denominator.'],
  teacherExplanation: {
    simpleExplanation: 'A fraction shows parts of a whole. We read the top as parts and bottom as total equal parts.',
    stepByStep: ['Show one whole divided into equal parts.'],
    terminology: [],
    examples: ['Half of a pizza is 1/2.'],
  },
  classroomDelivery: {
    warmUp: 'Ask what students know about sharing food equally.',
    teachingSteps: ['Define numerator and denominator on the board.'],
    questionsDuringLesson: ['How many equal parts do we have?'],
    activity: null,
    recap: 'Restate the definition of a fraction.',
  },
  assessment: {
    formativeQuestions: [
      {
        question: 'What does the denominator tell us?',
        expectedAnswer: 'How many equal parts in the whole.',
        kind: 'understanding',
      },
    ],
    exitTicket: 'Write one fraction and label numerator and denominator.',
  },
  differentiation: { struggling: [], extension: [] },
  sourceAndConfidence: {
    sourcesUsed: ['Math Book — Chapter 3'],
    sourceSupportedClaims: [],
    pedagogicalSuggestions: ['Warm-up is a teaching suggestion.'],
    missingOrAmbiguous: [],
    limitations: 'Based on provided excerpt only.',
  },
};

describe('TeachingHelpOutputSchema', () => {
  it('accepts valid structured output', () => {
    const parsed = TeachingHelpOutputSchema.parse(minimalValid);
    expect(parsed.learningObjectives).toHaveLength(1);
  });

  it('rejects malformed output', () => {
    expect(() =>
      TeachingHelpOutputSchema.parse({ ...minimalValid, learningObjectives: [] }),
    ).toThrow();
  });
});
