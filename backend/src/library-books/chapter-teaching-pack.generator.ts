import { PlannerAnalysisSource } from '@prisma/client';
import { parseModelJson } from '../ai/parse-model-json';
import {
  CHAPTER_TEACHING_PACK_PROMPT_VERSION,
  CHAPTER_TEACHING_PACK_SYSTEM_PROMPT,
} from '../ai/prompts';
import {
  ChapterTeachingPackOutput,
  ChapterTeachingPackSchema,
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
  if (!apiKey) {
    warnings.push({ code: 'AI_NOT_CONFIGURED', message: 'OPENAI_API_KEY not set; using provisional pack.' });
    return {
      pack: heuristicChapterTeachingPack(input),
      source: PlannerAnalysisSource.PROVISIONAL,
      warnings,
      provider: 'heuristic',
      model: 'provisional',
    };
  }

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
    const pack = ChapterTeachingPackSchema.parse(parseModelJson(text));
    return {
      pack,
      source: PlannerAnalysisSource.AI,
      warnings,
      provider: 'openai',
      model: json.model ?? model,
    };
  } catch (error) {
    warnings.push({
      code: 'AI_GENERATION_FAILED',
      message: error instanceof Error ? error.message : 'AI generation failed',
    });
    return {
      pack: ChapterTeachingPackSchema.parse(heuristicChapterTeachingPack(input)),
      source: PlannerAnalysisSource.PROVISIONAL,
      warnings,
      provider: 'heuristic',
      model: 'fallback',
    };
  }
}

export { CHAPTER_TEACHING_PACK_PROMPT_VERSION };
