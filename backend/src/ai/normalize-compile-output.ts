import {
  ChapterCompileOutput,
  ChapterCompileOutputSchema,
} from './schemas/chapter-compile.schema';
import { parseModelJson } from './parse-model-json';
import {
  looksLikeExercisesOnlyBody,
  splitSourceLessonAndExercises,
} from '../lessons/chapter-compile-repair';

/**
 * Accept chapter-compile JSON, or a mistaken LessonOutput { summary, concepts } shape.
 */
export function normalizeCompileModelOutput(
  rawText: string,
  sourceText?: string,
): ChapterCompileOutput {
  const parsed = parseModelJson(rawText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyntaxError('Compile output is not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.lessonBody === 'string') {
    return ChapterCompileOutputSchema.parse({
      chapterName: obj.chapterName,
      topicName: obj.topicName,
      lessonBody: obj.lessonBody,
      exercises: typeof obj.exercises === 'string' ? obj.exercises : '',
      concepts: Array.isArray(obj.concepts) ? obj.concepts : [],
    });
  }

  // Model returned LessonOutput-style fields instead of lessonBody/exercises.
  if (typeof obj.summary === 'string' && obj.summary.trim()) {
    const summary = obj.summary.trim();
    let lessonBody = summary;
    let exercises = typeof obj.exercises === 'string' ? obj.exercises : '';
    if (!exercises.trim()) {
      const split = splitSourceLessonAndExercises(summary);
      lessonBody = split.lessonBody;
      exercises = split.exercises;
    }
    if (looksLikeExercisesOnlyBody(lessonBody) && sourceText?.trim()) {
      const fromSource = splitSourceLessonAndExercises(sourceText);
      if (fromSource.lessonBody.length >= 80) {
        lessonBody = fromSource.lessonBody;
        if (!exercises.trim() && fromSource.exercises) exercises = fromSource.exercises;
      }
    }
    return ChapterCompileOutputSchema.parse({
      chapterName: obj.chapterName,
      topicName: obj.topicName,
      lessonBody,
      exercises,
      concepts: Array.isArray(obj.concepts) ? obj.concepts : [],
    });
  }

  throw new SyntaxError('Compile output missing lessonBody/summary');
}
