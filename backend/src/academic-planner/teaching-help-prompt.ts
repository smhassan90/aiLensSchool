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
      return 'Mode: CLASSROOM ACTIVITY — the teacher needs one short activity, not a full lesson write-up. Put the useful detail in classroomDelivery.activity (3–4 steps) and 1–2 worked examples in teacherExplanation.examples (board line + good student line). Keep overview and assessment to a few lines. Do not build stations that quote the textbook.';
    case 'DIFFERENTIATE':
      return 'Mode: DIFFERENTIATE — emphasize differentiation.struggling and differentiation.extension; include simplified explanation steps.';
    default:
      return 'Mode: PREPARE LESSON';
  }
}
