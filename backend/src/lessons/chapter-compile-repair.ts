import { countLatinLetters } from '../common/extract-quality';

const EXERCISE_HEADING =
  /(?:^|\n)\s*(?:\*\*)?Exercise\s*[1-9][0-9]?(?:\*\*)?\b/i;

const OPENING_POEM_CUES = [
  /flung himself/i,
  /lonely mood/i,
  /beginning to sink/i,
  /sought to hear/i,
  /topmost steeple/i,
  /dwell among/i,
  /voice of god/i,
];

function compactLen(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function cueHits(text: string): number {
  return OPENING_POEM_CUES.filter((re) => re.test(text)).length;
}

/** Light cleanup only — keep poem lines and exercise wording intact. */
export function lightCleanCompiledText(text: string): string {
  return (text ?? '')
    .replace(/^\s*Page\s+\d+\s*$/gim, '')
    .replace(/^\s*صفحہ\s*\d+\s*$/gim, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitSourceLessonAndExercises(sourceText: string): {
  lessonBody: string;
  exercises: string;
} {
  const value = (sourceText ?? '').trim();
  if (!value) return { lessonBody: '', exercises: '' };
  const match = value.match(EXERCISE_HEADING);
  if (!match || match.index === undefined) {
    return { lessonBody: value, exercises: '' };
  }
  return {
    lessonBody: value.slice(0, match.index).trim(),
    exercises: value.slice(match.index).trim(),
  };
}

/**
 * When the model drops the opening stanza or empties exercises, restore from OCR source.
 */
export function repairCompiledChapterFromSource(
  sourceText: string,
  compiledBody: string,
  compiledExercises: string,
): { lessonBody: string; exercises: string } {
  const source = lightCleanCompiledText(sourceText);
  const split = splitSourceLessonAndExercises(source);
  const sourceBody = lightCleanCompiledText(split.lessonBody);
  const sourceExercises = lightCleanCompiledText(split.exercises);

  let lessonBody = lightCleanCompiledText(compiledBody);
  let exercises = lightCleanCompiledText(compiledExercises);

  const sourceOpening = cueHits(sourceBody);
  const bodyOpening = cueHits(lessonBody);
  if (sourceOpening >= 2 && bodyOpening < 2 && sourceBody.length >= 80) {
    lessonBody = sourceBody;
  } else if (
    sourceBody.length >= 120 &&
    compactLen(sourceBody) > compactLen(lessonBody) * 1.35 &&
    countLatinLetters(sourceBody) > countLatinLetters(lessonBody) + 80
  ) {
    // Model returned a short mid-poem fragment; prefer the fuller OCR lesson body.
    lessonBody = sourceBody;
  }

  if (
    sourceExercises.length >= 100 &&
    (exercises.length < 80 || compactLen(sourceExercises) > compactLen(exercises) * 1.5)
  ) {
    exercises = sourceExercises;
  }

  return { lessonBody, exercises };
}
