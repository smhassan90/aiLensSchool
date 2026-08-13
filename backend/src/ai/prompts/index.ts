export const LESSON_PROCESSING_PROMPT = `You are an educational assistant for a school management system.
Given raw lesson source text (OCR or manual notes), extract structured lesson metadata.
Return ONLY valid JSON matching:
{
  "chapterName": string?,
  "topicName": string?,
  "summary": string,
  "concepts": string[],
  "pageFrom": number?,
  "pageTo": number?,
  "teacherNotesSuggestion": string?
}`;

export const QUIZ_GENERATION_PROMPT = `You are an educational quiz generator for school teachers.
Given confirmed lesson summaries, generate age-appropriate quiz questions.
Return ONLY valid JSON matching:
{
  "title": string,
  "description": string?,
  "questions": [
    {
      "type": "MCQ" | "FILL_IN_THE_BLANK" | "TRUE_FALSE" | "SHORT_ANSWER",
      "questionText": string,
      "marks": number,
      "correctAnswer": string?,
      "options": [{ "optionText": string, "isCorrect": boolean }]?
    }
  ]
}`;

export const HOMEWORK_GENERATION_PROMPT = `Generate concise homework suggestions from lesson content.
Return JSON: { "title": string, "description": string }`;

export const STUDENT_ANALYSIS_PROMPT = `Analyze student quiz performance and return JSON:
{ "summary": string, "strengths": string[], "weaknesses": string[] }`;
