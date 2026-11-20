import { activitiesRepeatEachOther, activityMismatchesSkill, collectActivityCardIssues, collectClassroomFocusIssues } from './activity-focus';

const chapter =
  'Caliph Haroon-ur-Rashid heard the dispute. The beggar and the rich man each claimed the white horse. The horse neighed when the rich man touched it.';

function focused() {
  return {
    title: 'Whose horse is it?',
    description:
      'Fictional scenario, inspired by this chapter. A shopkeeper and a traveller both claim a white horse. Facts: the horse follows the traveller and pulls away from the shopkeeper. Group 1 defends the shopkeeper. Group 2 defends the traveller. Group 3 judges. Example argument: the horse shows trust, the same kind of test the Caliph used when the rich man touched the horse and it neighed. Example question: what did the horse do?',
    learningObjective: 'Students judge a claim from what the horse does, as the Caliph did.',
    participationTechnique: 'Each student writes one argument, then speaks it in a group of 3.',
    materials: 'None',
    steps: [
      '(6 min) Say the case is not in the textbook, then read the Caliph horse test.',
      '(8 min) Read the fictional case and assign the three groups.',
      '(16 min) Ask a quiet student to read their written argument.',
      '(10 min) The judges give a decision and name the horse test.',
    ],
    expectedOutcome: 'Each student leaves with one argument about the horse, and the judges name the Caliph test.',
    checkUnderstanding: 'The written argument says what the horse did, and the decision matches that evidence.',
    durationMinutes: 40,
  };
}

describe('classroom focus', () => {
  it('accepts one horse-dispute court and rejects a stack of exercises', () => {
    expect(collectClassroomFocusIssues(focused(), chapter)).toEqual([]);

    const piled = {
      ...focused(),
      description: `${focused().description}\nPart A Analyse all 14 verses.\nPart B Write vocabulary sentences.\nPart C Complete the true/false exercise and a modal verb paragraph.\nExercise 2 and Exercise 3.`,
    };
    const issues = collectClassroomFocusIssues(piled, chapter).join(' ');
    expect(issues).toMatch(/more than one central task/);
    expect(issues).toMatch(/textbook exercise/);
    expect(issues).toMatch(/unrelated exercises/);
  });

  it('rejects steps that do not fit the period and a copied outcome', () => {
    const rushed = {
      ...focused(),
      steps: ['(5 min) Start.', '(5 min) Continue.', '(5 min) Finish.'],
    };
    expect(collectClassroomFocusIssues(rushed, chapter).join(' ')).toMatch(/do not add up to 40/);

    const copied = {
      ...focused(),
      checkUnderstanding: focused().expectedOutcome,
    };
    expect(collectClassroomFocusIssues(copied, chapter).join(' ')).toMatch(/repeats the expected outcome/);
  });

  it('rejects a role list that does not match the group size', () => {
    const crowded = {
      ...focused(),
      description:
        'Fictional scenario, inspired by this chapter. Six people argue over one horse. Groups of four or five. Roles: judge, clerk, beggar, rich man, guard, witness. Who should keep the horse? Example answer: the rich man keeps it if the horse walks to him.',
    };
    expect(collectClassroomFocusIssues(crowded, chapter).join(' ')).toMatch(/group size/);
  });

  it('rejects a skill card with no item and accepts one that carries the numbers', () => {
    const ratioChapter = 'Simplify a ratio. Convert 3:4 to an equal ratio by the product of the means.';
    const hollow = {
      ...focused(),
      title: 'Ratio sorting',
      learningObjective: 'Students sort the words for a ratio.',
      description:
        'Students sort word cards about ratios and pass one step to the next person. Nobody writes a full ratio. The teacher gives no number and no worked line. The class only says the names of the terms until the period ends and the board stays empty.',
    };
    expect(activityMismatchesSkill(hollow, ratioChapter)).toBe(true);
    expect(collectActivityCardIssues(hollow).join(' ')).toMatch(/one step passed|relay, hunt|example answer/);
    expect(collectClassroomFocusIssues(hollow, ratioChapter).join(' ')).toMatch(/skill from this chapter/);

    const complete = {
      ...focused(),
      title: 'Find the missing term',
      learningObjective: 'Students can find the missing term in an equal ratio.',
      description:
        'Fictional scenario, inspired by this chapter. A shop cuts ribbon in the ratio 3:4. The short piece is 6 metres. What is the long piece? Worked example: 3:4 = 6:8, because 3 times 8 is 24 and 4 times 6 is 24. The correct answer is 8 metres. Each student calculates the missing length and writes the product check.',
    };
    expect(activityMismatchesSkill(complete, ratioChapter)).toBe(false);
  });

  it('rejects two activities that are the same experience', () => {
    const first = focused();
    const second = { ...focused(), title: 'Horse court again' };
    expect(activitiesRepeatEachOther([first, second])).toMatch(/same experience/);
  });
});
