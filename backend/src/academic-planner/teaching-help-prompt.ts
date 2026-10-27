import { TeachingAssistanceMode } from '../ai/schemas/teaching-help.schema';

export function modeInstruction(mode: TeachingAssistanceMode): string {
  switch (mode) {
    case 'PREPARE_LESSON':
      return 'Mode: PREPARE LESSON — produce a balanced, concise plan covering overview, objectives, explanation, delivery, assessment and differentiation.';
    case 'EXPLAIN_TOPIC':
      return 'Mode: EXPLAIN TOPIC — emphasize teacherExplanation (simple language, step-by-step, terminology, examples). Keep classroomDelivery and assessment shorter.';
    case 'CREATE_QUESTIONS':
      return 'Mode: CREATE QUESTIONS — emphasize assessment.formativeQuestions (mix of recall, understanding, application) and questionsDuringLesson. Include answer keys.';
    case 'CLASSROOM_ACTIVITY':
      return 'Mode: CLASSROOM ACTIVITY — emphasize classroomDelivery.activity with ordinary materials, warm-up, and discussion questions.';
    case 'DIFFERENTIATE':
      return 'Mode: DIFFERENTIATE — emphasize differentiation.struggling and differentiation.extension; include simplified explanation steps.';
    default:
      return 'Mode: PREPARE LESSON';
  }
}
