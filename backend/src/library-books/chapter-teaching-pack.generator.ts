import { PlannerAnalysisSource } from '@prisma/client';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseModelJson } from '../ai/parse-model-json';
import {
  CHAPTER_TEACHING_PACK_PROMPT_VERSION,
  CHAPTER_TEACHING_PACK_SYSTEM_PROMPT,
} from '../ai/prompts';
import {
  ChapterTeachingPackOutput,
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

export async function generateChapterTeachingPack(input: {
  chapterTitle: string;
  chapterText: string;
  subjectName: string;
  classLabel: string;
  bookTitle: string;
}): Promise<GenerateChapterTeachingPackResult> {
  const warnings: GenerateChapterTeachingPackResult['warnings'] = [];
  const trimmed = input.chapterText.trim();
  if (trimmed.length < 200) {
    warnings.push({ code: 'CHAPTER_CONTENT_SHORT', message: 'Chapter text is short; using provisional pack.' });
    return {
      pack: heuristicChapterTeachingPack(input),
      source: PlannerAnalysisSource.PROVISIONAL,
      warnings,
      provider: 'heuristic',
      model: 'provisional',
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const cursorKey = process.env.CURSOR_API_KEY?.trim();

  const user = [
    `Subject: ${input.subjectName}`,
    `Class: ${input.classLabel}`,
    `Book: ${input.bookTitle}`,
    `Chapter: ${input.chapterTitle}`,
    '',
    '--- CHAPTER TEXT ---',
    trimmed.slice(0, 28000),
    '--- END CHAPTER TEXT ---',
  ].join('\n');

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
            { role: 'system', content: CHAPTER_TEACHING_PACK_SYSTEM_PROMPT },
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
      const text = json.choices?.[0]?.message?.content ?? '{}';
      const pack = parseChapterTeachingPackJson(text);
      return {
        pack,
        source: PlannerAnalysisSource.AI,
        warnings,
        provider: 'openai',
        model: json.model ?? model,
      };
    } catch (error) {
      warnings.push({
        code: 'OPENAI_GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'OpenAI generation failed',
      });
    }
  } else if (!cursorKey) {
    warnings.push({
      code: 'AI_NOT_CONFIGURED',
      message: 'No OPENAI_API_KEY or CURSOR_API_KEY; using provisional pack.',
    });
    return {
      pack: heuristicChapterTeachingPack(input),
      source: PlannerAnalysisSource.PROVISIONAL,
      warnings,
      provider: 'heuristic',
      model: 'provisional',
    };
  }

  if (cursorKey) {
    try {
      const { text, model: cursorModel } = await generateTeachingPackViaCursor(
        CHAPTER_TEACHING_PACK_SYSTEM_PROMPT,
        user,
      );
      const pack = parseChapterTeachingPackJson(text);
      return {
        pack,
        source: PlannerAnalysisSource.AI,
        warnings,
        provider: 'cursor',
        model: cursorModel,
      };
    } catch (error) {
      warnings.push({
        code: 'AI_GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'Cursor generation failed',
      });
    }
  }

  return {
    pack: heuristicChapterTeachingPack(input),
    source: PlannerAnalysisSource.PROVISIONAL,
    warnings,
    provider: 'heuristic',
    model: 'fallback',
  };
}

export { CHAPTER_TEACHING_PACK_PROMPT_VERSION };

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
