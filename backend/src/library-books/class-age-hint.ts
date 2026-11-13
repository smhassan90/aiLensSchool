/**
 * Age hint for AI prompts. This is not a grade-to-age map.
 * `grades.level` is a school-specific ordering number and must never be passed here.
 * Only Class 10 / Class X receives an approximate age, because that is the class this planner targets.
 */
export function approximateAgeHint(classLabel: string | null | undefined): string | null {
  const value = (classLabel ?? '').trim();
  if (!value) return null;
  if (/\b(?:class|grade)\s*(?:10|x)\b/i.test(value)) return '15–16';
  return null;
}

export function classContextLines(classLabel: string): string[] {
  const label = classLabel.trim() || 'Class';
  const age = approximateAgeHint(label);
  if (!age) {
    return [
      `Class: ${label}`,
      'No student age is provided. Do not treat a numeric grade level as the student\'s age.',
    ];
  }
  return [
    `Class: ${label}`,
    `Approximate student age: ${age} years. Write classroom tasks for students of about this age.`,
    'Do not treat a numeric grade level as the student\'s age.',
  ];
}

export function buildTeachingPackHeader(input: {
  subjectName: string;
  classLabel: string;
  bookTitle: string;
  chapterTitle: string;
}): string {
  return [
    `Subject: ${input.subjectName}`,
    ...classContextLines(input.classLabel),
    `Book: ${input.bookTitle}`,
    `Chapter: ${input.chapterTitle}`,
  ].join('\n');
}
