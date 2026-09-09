import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AiCompletionResult, AiProvider, LessonImageInput } from './ai.provider';
import { LessonOutput, LessonOutputSchema } from '../schemas/lesson-output.schema';
import { QuizOutput, QuizOutputSchema } from '../schemas/quiz-output.schema';
import {
  HOMEWORK_GENERATION_PROMPT,
  LESSON_PROCESSING_PROMPT,
  QUIZ_GENERATION_PROMPT,
  STUDENT_ANALYSIS_PROMPT,
  TEACHER_COACH_PROMPT,
} from '../prompts';
import { mockQuestionsForMix, quizMixInstructions, resolveQuizMix } from '../quiz-mix';
import { isFakeExtractText, isGarbledRtlOcr, looksLikeRealLessonText } from '../../common/extract-quality';
import { isServerlessRuntime, readEnv } from '../../common/env';

@Injectable()
export class CursorProvider implements AiProvider {
  private readonly logger = new Logger(CursorProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly visionModel: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = readEnv('CURSOR_API_KEY') || this.config.get<string>('CURSOR_API_KEY')?.trim() || undefined;
    this.model = this.config.get<string>('CURSOR_MODEL') ?? 'auto';
    this.visionModel =
      this.config.get<string>('CURSOR_VISION_MODEL')?.trim() ||
      (this.model === 'auto' ? 'composer-2.5' : this.model);
  }

  async processLesson(input: {
    sourceText: string;
    subjectName?: string;
    gradeName?: string;
    images?: LessonImageInput[];
  }): Promise<AiCompletionResult<LessonOutput>> {
    if (!this.apiKey) {
      return this.textFallback(input);
    }

    const userPrompt = input.images?.length
      ? `Subject: ${input.subjectName ?? 'General'}\nGrade: ${input.gradeName ?? 'N/A'}\n\n${input.sourceText}\n\nTranscribe every word on the attached textbook page photo(s). Keep English in English. Keep Urdu/Arabic (including Quran/Hadith lines) in Unicode Arabic script — never Latin gibberish like "SNUB" or "@2 A nid)". The summary field must be the full page, not a short retelling.`
      : `Subject: ${input.subjectName ?? 'General'}\nGrade: ${input.gradeName ?? 'N/A'}\n\nKeep this entire OCR lesson text. Do not shorten it:\n${input.sourceText}`;

    try {
      const content = input.images?.length
        ? await this.completeWithImages(LESSON_PROCESSING_PROMPT, userPrompt, input.images)
        : await this.withTimeout(
            this.complete(LESSON_PROCESSING_PROMPT, userPrompt),
            25_000,
            'Lesson extraction',
          );
      const parsed = LessonOutputSchema.parse(JSON.parse(this.extractJson(content.text)));
      if (isFakeExtractText(parsed.summary) || isGarbledRtlOcr(parsed.summary)) {
        if (input.images?.length) {
          throw new Error('Cursor did not read the textbook photos as readable text');
        }
        return this.textFallback(input);
      }
      // Prefer longer OCR only when it is clean and we did not send photos.
      if (
        !input.images?.length &&
        looksLikeRealLessonText(input.sourceText) &&
        !isGarbledRtlOcr(input.sourceText) &&
        input.sourceText.replace(/\s+/g, '').length >
          parsed.summary.replace(/\s+/g, '').length * 1.2
      ) {
        parsed.summary = input.sourceText;
      }
      return { data: parsed, ...content.meta };
    } catch (error) {
      this.logger.warn(
        `Lesson AI cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (input.images?.length) {
        throw error;
      }
      return this.textFallback(input);
    }
  }

  async generateQuiz(input: {
    lessonSummaries: string[];
    subjectName?: string;
    questionCount?: number;
    quickGenerate?: boolean;
    mcqCount?: number;
    fillBlankCount?: number;
    trueFalseCount?: number;
    shortAnswerCount?: number;
  }): Promise<AiCompletionResult<QuizOutput>> {
    const mix = resolveQuizMix(input);
    if (!this.apiKey) {
      return this.mockQuiz(input.subjectName, mix);
    }

    const content = await this.complete(
      QUIZ_GENERATION_PROMPT,
      `Subject: ${input.subjectName ?? 'General'}\n${quizMixInstructions(mix)}\n\nTopics:\n${input.lessonSummaries.join('\n---\n')}`,
    );
    try {
      const parsed = QuizOutputSchema.parse(JSON.parse(this.extractJson(content.text)));
      return { data: parsed, ...content.meta };
    } catch {
      this.logger.error('Failed to parse quiz JSON from Cursor');
      throw new Error('Quiz generation returned invalid JSON. Please try again.');
    }
  }

  async generateHomework(input: {
    lessonSummary: string;
    subjectName?: string;
    gradeName?: string;
    styleInstruction?: string;
  }): Promise<
    AiCompletionResult<{
      title: string;
      description: string;
      answerKey?: string;
      questions?: Array<{
        type: string;
        questionText: string;
        marks: number;
        correctAnswer?: string;
        options?: Array<{ optionText: string; isCorrect: boolean }>;
      }>;
    }>
  > {
    if (!this.apiKey) {
      return {
        data: {
          title: `${input.subjectName ?? 'Subject'} practice`,
          description: '1. The main idea of today’s lesson is _____.\n2. Today’s lesson is important. True or False?',
          answerKey: '1. concept\n2. TRUE',
          questions: [
            {
              type: 'FILL_IN_THE_BLANK',
              questionText: 'The main idea of today’s lesson is _____.',
              marks: 1,
              correctAnswer: 'concept',
            },
            {
              type: 'TRUE_FALSE',
              questionText: 'Today’s lesson is important.',
              marks: 1,
              correctAnswer: 'TRUE',
              options: [
                { optionText: 'TRUE', isCorrect: true },
                { optionText: 'FALSE', isCorrect: false },
              ],
            },
          ],
        },
        provider: 'mock',
        model: 'deterministic-mock',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      };
    }

    const content = await this.complete(
      HOMEWORK_GENERATION_PROMPT,
      [
        `Subject: ${input.subjectName ?? 'General'}`,
        input.gradeName ? `Grade: ${input.gradeName}` : '',
        input.styleInstruction ? `Teacher style instruction: ${input.styleInstruction}` : '',
        '',
        input.lessonSummary,
      ]
        .filter((line) => line !== '')
        .join('\n'),
    );
    const parsed = JSON.parse(this.extractJson(content.text)) as {
      title: string;
      description: string;
      answerKey?: string;
      questions?: Array<{
        type: string;
        questionText: string;
        marks: number;
        correctAnswer?: string;
        options?: Array<{ optionText: string; isCorrect: boolean }>;
      }>;
    };
    return { data: parsed, ...content.meta };
  }

  async analyzeStudent(input: {
    resultsSummary: string;
  }): Promise<
    AiCompletionResult<{ summary: string; strengths: string[]; weaknesses: string[] }>
  > {
    if (!this.apiKey) {
      return {
        data: {
          summary: 'Student shows steady progress with room to improve recall.',
          strengths: ['Consistent effort', 'Basic concept grasp'],
          weaknesses: ['Multi-step problems'],
        },
        provider: 'mock',
        model: 'deterministic-mock',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      };
    }

    const content = await this.complete(STUDENT_ANALYSIS_PROMPT, input.resultsSummary);
    const parsed = JSON.parse(this.extractJson(content.text)) as {
      summary: string;
      strengths: string[];
      weaknesses: string[];
    };
    return { data: parsed, ...content.meta };
  }

  async coach(input: { facts: string }): Promise<
    AiCompletionResult<{
      headline: string;
      verdict: 'strong' | 'mixed' | 'needs_support';
      cards: Array<{ title: string; body: string; tone: 'good' | 'watch' | 'act' }>;
      strengths: string[];
      improvements: string[];
      discussTonight: string[];
      sayToTeacher: string;
    }>
  > {
    const fallback = {
      headline: 'Check lessons, attendance and quiz scores together',
      verdict: 'mixed' as const,
      cards: [
        { title: 'What is going well', body: 'Use the numbers on this page as the source of truth.', tone: 'good' as const },
        { title: 'What to watch', body: 'If lessons or attendance are missing, start there before talking about results.', tone: 'watch' as const },
      ],
      strengths: ['Keep using the numbers on this page as the source of truth.'],
      improvements: ['If lessons or quizzes are missing, start there in the next meeting.'],
      discussTonight: [
        'Ask which course feels hardest for students this term.',
        'Compare quiz averages with term results in each class they teach.',
        'Check whether every class has lessons and quizzes, not only the stronger one.',
      ],
      sayToTeacher: 'Thank you for the work you are doing. Let’s keep lessons and quizzes updated, then we can look at results together.',
    };
    if (!this.apiKey) {
      return { data: fallback, provider: 'mock', model: 'deterministic-mock', inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
    }
    try {
      const content = await this.complete(TEACHER_COACH_PROMPT, input.facts);
      const parsed = JSON.parse(this.extractJson(content.text)) as typeof fallback;
      return { data: parsed, ...content.meta };
    } catch {
      return { data: fallback, provider: 'mock', model: 'deterministic-mock', inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
    }
  }

  private prepareLocalRuntime() {
    const cwd = join(tmpdir(), 'ailens-cursor-cwd');
    const storeDir = join(tmpdir(), 'ailens-cursor-store');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(storeDir, { recursive: true });
    if (isServerlessRuntime()) {
      const home = join(tmpdir(), 'ailens-cursor-home');
      mkdirSync(join(home, '.cursor', 'projects'), { recursive: true });
      process.env.HOME = home;
      process.env.USERPROFILE = home;
    }
    return { cwd, storeDir };
  }

  private async completeWithImages(system: string, user: string, images: LessonImageInput[]) {
    const pages = images.slice(0, 3);
    const summaries: string[] = [];
    let chapterName: string | undefined;
    let topicName: string | undefined;
    const concepts: string[] = [];

    for (let index = 0; index < pages.length; index++) {
      const page = await this.shrinkLessonImage(pages[index]);
      this.logger.log(
        `Cursor vision page ${index + 1}/${pages.length} (${Math.round(page.buffer.length / 1024)}KB)`,
      );
      const pageText = await this.withTimeout(
        this.transcribeSinglePage(system, user, page, index + 1, pages.length),
        75_000,
        `Lesson page ${index + 1}`,
      );
      try {
        const parsed = LessonOutputSchema.parse(JSON.parse(this.extractJson(pageText)));
        if (!chapterName && parsed.chapterName) chapterName = parsed.chapterName;
        if (!topicName && parsed.topicName) topicName = parsed.topicName;
        if (parsed.summary?.trim()) {
          summaries.push(
            pages.length > 1 ? `Page ${index + 1}\n${parsed.summary.trim()}` : parsed.summary.trim(),
          );
        }
        for (const concept of parsed.concepts ?? []) {
          if (concept && !concepts.includes(concept)) concepts.push(concept);
        }
      } catch {
        const raw = pageText.trim();
        if (raw) {
          summaries.push(pages.length > 1 ? `Page ${index + 1}\n${raw}` : raw);
        }
      }
    }

    const summary = summaries.join('\n\n').trim();
    if (!summary) {
      throw new Error('Cursor agent returned an empty result for the page photos.');
    }
    const merged = JSON.stringify({
      chapterName,
      topicName,
      summary,
      concepts: concepts.slice(0, 8),
      teacherNotesSuggestion: 'Review the transcribed page and adjust key points if needed.',
    });
    return {
      text: merged,
      meta: {
        provider: 'cursor',
        model: this.visionModel,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      },
    };
  }

  private async transcribeSinglePage(
    system: string,
    user: string,
    image: LessonImageInput,
    pageNum: number,
    pageCount: number,
  ) {
    const { writeFile, unlink } = await import('fs/promises');
    const { Agent, JsonlLocalAgentStore } = await import('@cursor/sdk');
    const runtime = this.prepareLocalRuntime();
    const fileName = `page-${pageNum}.jpg`;
    const filePath = join(runtime.cwd, fileName);
    await writeFile(filePath, image.buffer);
    const agent = await Agent.create({
      apiKey: this.apiKey,
      model: { id: this.visionModel },
      local: {
        cwd: runtime.cwd,
        store: new JsonlLocalAgentStore(runtime.storeDir),
      },
    });
    try {
      const run = await agent.send({
        text: `${system}\n\n${user}\n\nTranscribe the attached textbook photo (page ${pageNum} of ${pageCount}) into the JSON schema. Keep English as English and Urdu/Arabic as Unicode script. Return ONLY valid JSON. Do not use tools. Do not read or write files.`,
        images: [
          {
            data: image.buffer.toString('base64'),
            mimeType: image.mimeType,
          },
        ],
      });
      const result = await run.wait();
      if (result.status !== 'finished') {
        throw new Error(`Cursor agent ${result.status || 'failed'} before reading page ${pageNum}`);
      }
      const text =
        typeof result.result === 'string'
          ? result.result
          : result.result
            ? JSON.stringify(result.result)
            : '';
      if (!text.trim()) {
        throw new Error(`Cursor agent returned an empty result for page ${pageNum}.`);
      }
      return text;
    } finally {
      agent.close();
      try {
        await unlink(filePath);
      } catch {
        // temp image cleanup is best-effort
      }
    }
  }

  private async shrinkLessonImage(image: LessonImageInput): Promise<LessonImageInput> {
    try {
      const sharpModule = await import('sharp');
      // Nest/CJS interop: sharp may be the function itself or under .default
      const sharpFn = (sharpModule as unknown as { default?: (i: Buffer) => import('sharp').Sharp })
        .default
        ? (sharpModule as unknown as { default: (i: Buffer) => import('sharp').Sharp }).default
        : (sharpModule as unknown as (i: Buffer) => import('sharp').Sharp);
      const buffer = await sharpFn(image.buffer)
        .rotate()
        .resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 62, mozjpeg: true })
        .toBuffer();
      return {
        buffer,
        mimeType: 'image/jpeg',
        filename: (image.filename ?? 'page').replace(/\.\w+$/, '') + '.jpg',
      };
    } catch (error) {
      this.logger.warn(
        `Image shrink skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
      return image;
    }
  }

  private async complete(system: string, user: string) {
    const { Agent, JsonlLocalAgentStore } = await import('@cursor/sdk');
    const runtime = this.prepareLocalRuntime();
    const result = await Agent.prompt(
      `${system}\n\n${user}\n\nReturn ONLY valid JSON. Do not edit files or run tools.`,
      {
        apiKey: this.apiKey,
        model: { id: this.model },
        local: {
          cwd: runtime.cwd,
          store: new JsonlLocalAgentStore(runtime.storeDir),
        },
      },
    );

    if (result.status !== 'finished') {
      throw new Error(`Cursor agent ${result.status || 'failed'} before returning quiz JSON`);
    }

    const text =
      typeof result.result === 'string'
        ? result.result
        : result.result
          ? JSON.stringify(result.result)
          : '';
    if (!text.trim()) {
      throw new Error('Cursor agent returned an empty result. Try generating the quiz again.');
    }

    return {
      text,
      meta: {
        provider: 'cursor',
        model: result.model?.id ?? this.model,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      },
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private textFallback(input: {
    sourceText: string;
    subjectName?: string;
    gradeName?: string;
    images?: LessonImageInput[];
  }): AiCompletionResult<LessonOutput> {
    const text = input.sourceText.trim();
    if (looksLikeRealLessonText(text) && !isGarbledRtlOcr(text)) {
      const firstLine = text.split(/\n/).map((line) => line.trim()).find((line) => line.length > 2 && !/^Page\s+\d+/i.test(line));
      return {
        data: LessonOutputSchema.parse({
          chapterName: input.subjectName,
          topicName: firstLine?.slice(0, 80) || `${input.subjectName ?? 'Lesson'}`,
          summary: text,
          concepts: [],
          teacherNotesSuggestion: 'Review the formatted lesson and adjust key points if needed.',
        }),
        provider: 'ocr',
        model: 'page-text',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      };
    }
    return this.mockLesson(input.sourceText, input.images?.length, input.subjectName, input.gradeName);
  }

  private mockLesson(
    sourceText: string,
    imageCount = 0,
    subjectName?: string,
    gradeName?: string,
  ): AiCompletionResult<LessonOutput> {
    const snippet = sourceText.slice(0, 240).replace(/\s+/g, ' ').trim();
    const photoNote = imageCount
      ? `Content taken from ${imageCount} photographed textbook page(s) for ${subjectName ?? 'this subject'}${gradeName ? ` (${gradeName})` : ''}. Original photos were not saved.`
      : 'Lesson covers key ideas from the provided material.';
    return {
      data: LessonOutputSchema.parse({
        chapterName: subjectName ? `${subjectName} chapter` : 'Chapter 1',
        topicName: snippet.slice(0, 60) || `${subjectName ?? 'Lesson'} — today's pages`,
        summary: [photoNote, snippet].filter(Boolean).join(' '),
        concepts: ['Main idea from the photographed pages', 'Key terms', 'Practice application'],
        pageFrom: 1,
        pageTo: Math.max(imageCount || 1, 1),
        teacherNotesSuggestion: 'Review the extracted content and adjust before generating homework and diary.',
      }),
      provider: 'mock',
      model: 'deterministic-mock',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    };
  }

  private mockQuiz(
    subjectName: string | undefined,
    mix: ReturnType<typeof resolveQuizMix>,
  ): AiCompletionResult<QuizOutput> {
    this.logger.warn('CURSOR_API_KEY missing — returning deterministic mock quiz output');
    return {
      data: QuizOutputSchema.parse({
        title: `${subjectName ?? 'Subject'} Quiz`,
        description: 'Auto-generated draft quiz for teacher review (mock AI).',
        questions: mockQuestionsForMix(subjectName, mix),
      }),
      provider: 'mock',
      model: 'deterministic-mock',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    };
  }

  private extractJson(text: string): string {
    const trimmed = text.trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fenced?.[1]) return fenced[1].trim();
    if (trimmed.startsWith('{')) return trimmed;
    const match = /\{[\s\S]*\}/.exec(trimmed);
    if (!match) {
      throw new Error('Cursor agent did not return JSON for the quiz');
    }
    return match[0];
  }
}
