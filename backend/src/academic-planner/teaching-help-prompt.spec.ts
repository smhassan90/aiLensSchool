import { modeInstruction } from './teaching-help-prompt';

describe('modeInstruction', () => {
  it('includes mode-specific guidance for each assistance mode', () => {
    expect(modeInstruction('PREPARE_LESSON')).toContain('PREPARE LESSON');
    expect(modeInstruction('EXPLAIN_TOPIC')).toContain('EXPLAIN TOPIC');
    expect(modeInstruction('CREATE_QUESTIONS')).toContain('CREATE QUESTIONS');
    expect(modeInstruction('CLASSROOM_ACTIVITY')).toContain('CLASSROOM ACTIVITY');
    expect(modeInstruction('DIFFERENTIATE')).toContain('DIFFERENTIATE');
  });
});
