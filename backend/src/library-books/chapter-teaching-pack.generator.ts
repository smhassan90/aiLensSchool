import { PlannerAnalysisSource } from '@prisma/client';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import { parseModelJson } from '../ai/parse-model-json';
import {
  CHAPTER_TEACHING_PACK_PROMPT_VERSION,
  CHAPTER_TEACHING_PACK_SYSTEM_PROMPT,
} from '../ai/prompts';
import { buildTeachingPackHeader } from './class-age-hint';
import { assertActivityQuality } from './activity-quality';
import { groundTeachingPack } from './chapter-teaching-pack.ground';
import {
  ChapterTeachingPackOutput,
  ChapterTeachingPackSchema,
  coerceChapterTeachingPack,
  parseChapterTeachingPackJson,
} from './schemas/chapter-teaching-pack.schema';
import { heuristicChapterTeachingPack } from './chapter-teaching-pack.heuristic';

export type GenerateChapterTeachingPackResult = {
  pack: ChapterTeachingPackOutput;
  source: PlannerAnalysisSource;
  warnings: Array<{ code: string; message: string }>;
  provider: string;
  model: string;
};

const FULL_TEXT_LIMIT = 25_000;

const QUESTIONS_ONLY_PROMPT = `Extract classroom questions from the textbook exercises below. Return ONLY JSON: {"questions":[{"sliceKey":"s1","question":"...","expectedAnswer":"...","format":"WRITTEN"}]}.
Rules:
- 6–20 questions, taken from the exercises (keep the exercise wording; shorten only if very long). Cover every section that has exercises.
- Mix formats: mostly WRITTEN, plus ORAL for speaking tasks. format is ORAL, WRITTEN, or QUICK_FIRE.
- expectedAnswer = the correct answer from the text; for open tasks (essay, debate) list what a good answer must include.
- sliceKey = one of the provided section keys (the section the exercise belongs to). Use null only if it fits no section.
- Do not invent facts. No markdown.`;

export async function generateChapterTeachingPack(input: {
  chapterTitle: string;
  chapterText: string;
  subjectName: string;
  classLabel: string;
  bookTitle: string;
  lessonText?: string;
  exercisesText?: string;
}): Promise<GenerateChapterTeachingPackResult> {
  const warnings: GenerateChapterTeachingPackResult['warnings'] = [];
  const compiled = input.chapterText.trim();
  if (compiled.length < 200) {
    warnings.push({ code: 'CHAPTER_CONTENT_SHORT', message: 'Chapter text is short; using provisional pack.' });
    return {
      pack: heuristicChapterTeachingPack(input),
      source: PlannerAnalysisSource.PROVISIONAL,
      warnings,
      provider: 'heuristic',
      model: 'provisional',
    };
  }

  const header = buildTeachingPackHeader({
    subjectName: input.subjectName,
    classLabel: input.classLabel,
    bookTitle: input.bookTitle,
    chapterTitle: input.chapterTitle,
  });

  let lastError: Error | null = null;
  let correction = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await requestCompletePack(input, header, compiled, warnings, correction);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Teaching pack generation failed');
      correction = lastError.message;
    }
  }
  throw lastError ?? new Error('Teaching pack generation failed');
}

function acceptPack(
  pack: GenerateChapterTeachingPackResult['pack'],
  compiled: string,
  warnings: GenerateChapterTeachingPackResult['warnings'],
  provider: string,
  model: string,
  correction: string,
): GenerateChapterTeachingPackResult {
  const grounded = groundTeachingPack(pack, compiled);
  try {
    assertActivityQuality(grounded.activities, compiled);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Activity quality failed';
    throw new Error(correction ? `${message}. Previous attempt: ${correction.slice(0, 400)}` : message);
  }
  return { pack: grounded, source: PlannerAnalysisSource.AI, warnings, provider, model };
}

async function requestCompletePack(
  input: {
    chapterTitle: string;
    lessonText?: string;
    exercisesText?: string;
  },
  header: string,
  compiled: string,
  warnings: GenerateChapterTeachingPackResult['warnings'],
  correction: string,
): Promise<GenerateChapterTeachingPackResult> {
  const repair = correction
    ? `\n\nThe previous activities were rejected. Rewrite only the activities so they pass this check: ${correction.slice(0, 1200)}\nKeep the activities specific to different sections. Do not use a generic unit recap.`
    : '';
  try {
    if (compiled.length <= FULL_TEXT_LIMIT) {
      const { pack, provider, model } = await requestTeachingPack(
        CHAPTER_TEACHING_PACK_SYSTEM_PROMPT,
        `${header}${repair}\n\n--- CHAPTER TEXT ---\n${compiled}\n--- END CHAPTER TEXT ---`,
      );
      return acceptPack(pack, compiled, warnings, provider, model, correction);
    }

    const lessonSource = (input.lessonText ?? '').trim() || compiled;
    let lessonBody = lessonSource;
    if (lessonBody.length > FULL_TEXT_LIMIT) {
      lessonBody = lessonBody.slice(0, FULL_TEXT_LIMIT);
      warnings.push({
        code: 'LESSON_TEXT_TRUNCATED',
        message: 'Lesson text exceeded 25,000 characters; only the first 25,000 were sent.',
      });
    }

    const first = await requestTeachingPack(
      CHAPTER_TEACHING_PACK_SYSTEM_PROMPT,
      `${header}${repair}\n\n--- LESSON TEXT ---\n${lessonBody}\n--- END LESSON TEXT ---`,
    );

    let questions = first.pack.questions;
    const exercises = (input.exercisesText ?? '').trim();
    if (exercises) {
      let exerciseBody = exercises;
      if (exerciseBody.length > FULL_TEXT_LIMIT) {
        exerciseBody = exerciseBody.slice(0, FULL_TEXT_LIMIT);
        warnings.push({
          code: 'EXERCISES_TEXT_TRUNCATED',
          message: 'Exercises text exceeded 25,000 characters; only the first 25,000 were sent.',
        });
      }
      const sliceList = first.pack.readingSlices.map((slice) => `${slice.sliceKey}: ${slice.title}`).join('\n');
      try {
        const extracted = await requestQuestionList(
          `${header}\n\nSections:\n${sliceList}\n\n--- EXERCISES ---\n${exerciseBody}\n--- END EXERCISES ---`,
        );
        if (extracted.length) questions = extracted.slice(0, 40);
      } catch (error) {
        warnings.push({
          code: 'EXERCISE_QUESTIONS_FAILED',
          message: error instanceof Error ? error.message : 'Exercise question pass failed',
        });
      }
    }

    const pack = ChapterTeachingPackSchema.parse(
      coerceChapterTeachingPack({ ...first.pack, questions: questions.slice(0, 40) }),
    );
    return acceptPack(pack, compiled, warnings, first.provider, first.model, correction);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Teaching pack generation failed';
    throw new Error(message);
  }
}

export { CHAPTER_TEACHING_PACK_PROMPT_VERSION };

async function requestTeachingPack(system: string, user: string): Promise<{
  pack: ChapterTeachingPackOutput;
  provider: string;
  model: string;
}> {
  const { text, provider, model } = await requestModelText(system, user);
  return { pack: parseChapterTeachingPackJson(text), provider, model };
}

const ExtractedQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        sliceKey: z.string().regex(/^s\d{1,2}$/).nullable().optional(),
        question: z.string().min(5).max(600),
        expectedAnswer: z.string().min(2).max(1200),
        format: z.enum(['ORAL', 'WRITTEN', 'QUICK_FIRE']),
      }),
    )
    .min(1)
    .max(40),
});

async function requestQuestionList(user: string): Promise<ChapterTeachingPackOutput['questions']> {
  const { text } = await requestModelText(QUESTIONS_ONLY_PROMPT, user);
  const raw = parseModelJson(text) as { questions?: unknown } | unknown;
  const questions = Array.isArray(raw) ? raw : (raw as { questions?: unknown })?.questions;
  const validated = ExtractedQuestionsSchema.parse(
    coerceChapterTeachingPack({
      complexity: 'MEDIUM',
      summary: 'Questions extracted from the unit exercises for validation only.',
      teacherGuide: ['Check each exercise answer against the textbook.'],
      readingSlices: [
        {
          sliceKey: 's1',
          title: 'Exercises',
          readingFrom: 'From the exercises',
          explainPoints: ['Use the textbook answers.'],
        },
      ],
      questions,
      activities: [],
      revisionPoints: [{ point: 'Review each section of the unit.' }],
    }),
  );
  return validated.questions;
}

async function requestModelText(
  system: string,
  user: string,
): Promise<{ text: string; provider: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const cursorKey = process.env.CURSOR_API_KEY?.trim();
  const errors: string[] = [];

  if (!apiKey && !cursorKey) {
    throw new Error('No OPENAI_API_KEY or CURSOR_API_KEY');
  }

  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          max_tokens: 8192,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI ${response.status}: ${errText.slice(0, 400)}`);
      }
      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
      };
      const text = json.choices?.[0]?.message?.content ?? '';
      if (!text.trim()) throw new Error('OpenAI returned empty teaching pack JSON');
      return { text, provider: 'openai', model: json.model ?? model };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'OpenAI generation failed');
    }
  }

  if (cursorKey) {
    try {
      const cursor = await generateTeachingPackViaCursor(system, user);
      return { text: cursor.text, provider: 'cursor', model: cursor.model };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Cursor generation failed');
    }
  }

  throw new Error(errors.join(' | ') || 'Teaching pack generation failed');
}

async function generateTeachingPackViaCursor(
  system: string,
  user: string,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY not set');
  }
  const model =
    process.env.CURSOR_JSON_MODEL?.trim() ||
    process.env.CURSOR_MODEL?.trim() ||
    'composer-2.5';
  const { Agent, JsonlLocalAgentStore } = await import('@cursor/sdk');
  const id = `chapter-pack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cwd = join(tmpdir(), 'ailens-cursor-cwd', id);
  const storeDir = join(tmpdir(), 'ailens-cursor-store', id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(storeDir, { recursive: true });

  const timeoutMs =
    Number(process.env.CHAPTER_TEACHING_PACK_CURSOR_TIMEOUT_MS ?? '180000') || 180_000;
  const prompt = `${system}\n\n${user}\n\nReturn ONLY valid JSON. Do not edit files or run tools.`;
  const result = (await Promise.race([
    Agent.prompt(prompt, {
      apiKey,
      model: { id: model },
      local: {
        cwd,
        store: new JsonlLocalAgentStore(storeDir),
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Cursor teaching pack generation timed out')), timeoutMs),
    ),
  ])) as { status: string; result?: string; model?: { id?: string } };

  if (result.status !== 'finished') {
    throw new Error(`Cursor agent ${result.status || 'failed'} before returning pack JSON`);
  }
  const text = typeof result.result === 'string' ? result.result : '';
  if (!text.trim()) {
    throw new Error('Cursor agent returned empty teaching pack JSON');
  }
  return { text, model: result.model?.id ?? model };
}
