import { countLatinLetters } from '../common/extract-quality';
import { stripInterleavedWeblinkSidebar } from './sidebar-layout-ocr';

const EXERCISE_HEADING =
  /(?:^|\n)\s*(?:\*\*)?Exercise\s*[1-9][0-9]?(?:\*\*)?\b/i;

const OPENING_POEM_CUES = [
  /flung\s+h?\s*imself/i,
  /lonely mood/i,
  /beginning to sink/i,
  /sought to hear/i,
  /topmost steeple/i,
  /dwell among/i,
  /voice of god/i,
  /cobweb home/i,
  /silken filmy/i,
  /Bravo/i,
  /native cot/i,
  /give it all up/i,
  /grieved as man/i,
  /great deed/i,
  /ceiling dome/i,
];

function compactLen(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function cueHits(text: string): number {
  return OPENING_POEM_CUES.filter((re) => re.test(text)).length;
}

/** Light cleanup only — keep poem lines and exercise wording intact. */
export function lightCleanCompiledText(text: string): string {
  return stripInterleavedWeblinkSidebar(
    (text ?? '')
      .replace(/^\s*Page\s+\d+\s*$/gim, '')
      .replace(/^\s*صفحہ\s*\d+\s*$/gim, '')
      .replace(/\bflung\s+h\s+imself\b/gi, 'flung himself')
      .replace(/\bEzercise\b/gi, 'Exercise')
      .replace(/\bExercise[\u2018\u2019'`´']\s*(?=\d)/gi, 'Exercise ')
      .replace(/\bKing Bruce:\s+/g, 'King Bruce ')
      .replace(/\bwhy should not\s+1\?/gi, 'why should not I?')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
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

/** Model sometimes puts only Exercise 4/5/6 into lessonBody (or LessonOutput.summary). */
export function looksLikeExercisesOnlyBody(text: string): boolean {
  const value = (text ?? '').trim();
  if (!value) return true;
  if (EXERCISE_HEADING.test(`\n${value}`)) return true;
  if (cueHits(value) >= 2) return false;
  if (/pre-reading|reading text|flung|lonely mood|beginning to sink/i.test(value)) {
    return false;
  }
  // Continuation of Exercise 4 (items 9–14) then Exercise 5…
  if (
    /^\s*\d{1,2}\.\s+\S/.test(value) &&
    /Exercise\s*[5-9]\b/i.test(value) &&
    cueHits(value) < 2
  ) {
    return true;
  }
  return false;
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

  // Wrong schema: model put everything in "summary" and left body empty / exercise-only.
  if (looksLikeExercisesOnlyBody(lessonBody) && sourceBody.length >= 80) {
    const bodyWasExercises = lessonBody;
    lessonBody = sourceBody;
    if (sourceExercises.length >= 80) {
      exercises = sourceExercises;
    } else if (exercises.length < 80 && /Exercise\s*\d/i.test(bodyWasExercises)) {
      exercises = bodyWasExercises;
    }
  }

  const sourceOpening = cueHits(sourceBody);
  const bodyOpening = cueHits(lessonBody);
  if (sourceOpening >= 2 && bodyOpening < 2 && sourceBody.length >= 80) {
    lessonBody = sourceBody;
  } else if (
    sourceOpening > bodyOpening &&
    sourceBody.length >= 120 &&
    compactLen(sourceBody) >= compactLen(lessonBody)
  ) {
    // Source OCR has more poem cues (mid/end stanzas) than the model body.
    lessonBody = sourceBody;
  } else if (
    sourceBody.length >= 120 &&
    compactLen(sourceBody) > compactLen(lessonBody) * 1.25 &&
    countLatinLetters(sourceBody) > countLatinLetters(lessonBody) + 60
  ) {
    // Model returned a short mid-poem fragment; prefer the fuller OCR lesson body.
    lessonBody = sourceBody;
  }

  const sourceExerciseCount = (sourceExercises.match(/\bExercise\s*[1-9]\d?\b/gi) ?? []).length;
  const compiledExerciseCount = (exercises.match(/\bExercise\s*[1-9]\d?\b/gi) ?? []).length;
  if (
    sourceExercises.length >= 100 &&
    (exercises.length < 80 ||
      compactLen(sourceExercises) > compactLen(exercises) * 1.35 ||
      (sourceExerciseCount > compiledExerciseCount && sourceExerciseCount >= 3))
  ) {
    exercises = sourceExercises;
  }

  return { lessonBody, exercises };
}
