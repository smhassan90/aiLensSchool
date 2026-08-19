export const LESSON_PROCESSING_PROMPT = `You are an educational assistant for a school management system.
You may receive OCR text and/or photographed textbook pages.
Return the FULL page as lesson content. Do not write a short synopsis.
Rules:
- If photos are attached, transcribe every visible heading, paragraph, question, example, and caption.
- If OCR text is provided, keep every paragraph. Fix spelling and line breaks only. Do not condense, paraphrase, or omit.
- The JSON field "summary" is the complete lesson text from the page, not an abstract. It must be as long as the source page.
- Use clear headings, Q./A. pairs, Hadith/quotes, and Activity lines when they appear on the page.
- Separate pages with a blank line and a "Page N" heading if multiple pages are present.
- Do not mention photos, OCR, or that images were not saved.
- concepts must be 4-8 short, complete key points from the actual page (not placeholders).
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
Given homework topic titles and lesson summaries, generate age-appropriate quiz questions.
Follow the question-type instructions in the user message exactly.
The quiz title must be a short student-facing headline (max 8 words) suggested by you from the topics. Do not concatenate homework titles with commas. The teacher does not name the quiz.
Return ONLY valid JSON matching:
{
  "title": string,
  "description": string?,
  "questions": [
    {
      "type": "MCQ" | "FILL_IN_THE_BLANK" | "SHORT_ANSWER",
      "questionText": string,
      "marks": number,
      "correctAnswer": string?,
      "options": [{ "optionText": string, "isCorrect": boolean }]?
    }
  ]
}`;

export const HOMEWORK_GENERATION_PROMPT = `Generate homework from the lesson content.
Follow the teacher's style instruction if one is provided. Adapt difficulty, length, and vocabulary to that instruction and the grade.
Do not invent a separate lesson summary. Use the extracted lesson text and key points only.
Return JSON: { "title": string, "description": string }`;

export const STUDENT_ANALYSIS_PROMPT = `Analyze student quiz performance and return JSON:
{ "summary": string, "strengths": string[], "weaknesses": string[] }`;

export const TEACHER_COACH_PROMPT = `You brief a busy school principal about ONE teacher, just before a short conversation.
The principal can already see the score bars. Do not restate the rank or repeat obvious totals.
Your job is to surface what a principal cannot notice by walking the corridor:
- Which class + subject is strong vs dragging (name them)
- Term/exam average vs quiz average in the same course (mismatch means teaching to quizzes, not exams — or the reverse)
- A course with missing lessons or missing quizzes while this teacher’s other courses are fine
- Students in one class not attempting quizzes
- Student attendance only as a talking point, never as blame
Write for tonight or the weekend. Be specific and kind.
Return ONLY JSON:
{
  "headline": string,
  "verdict": "strong" | "mixed" | "needs_support",
  "cards": [{ "title": string, "body": string, "tone": "good" | "watch" | "act" }],
  "strengths": string[],
  "improvements": string[],
  "discussTonight": string[],
  "sayToTeacher": string
}
Rules:
- headline max 10 words, about the pattern not the score
- at most 3 cards, each body max 24 words, each must name a class and subject if the facts allow
- strengths: 2 short bullets of genuine good things, with class/subject
- improvements: 2–3 bullets of weaknesses to raise kindly, with class/subject
- discussTonight: exactly 3 bullets the principal can say in the meeting. Each names a course (class + subject) or a result pattern. Do not say "look at the dashboard".
- sayToTeacher is 1–2 spoken sentences, kind, naming the course that needs attention
- Never invent missing numbers. If teacher attendance is not marked, skip it.`;
