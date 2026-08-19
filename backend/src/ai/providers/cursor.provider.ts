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
import { isFakeExtractText, looksLikeRealLessonText } from '../../common/extract-quality';
import { isServerlessRuntime, readEnv } from '../../common/env';

@Injectable()
export class CursorProvider implements AiProvider {
  private readonly logger = new Logger(CursorProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = readEnv('CURSOR_API_KEY') || this.config.get<string>('CURSOR_API_KEY')?.trim() || undefined;
    this.model = this.config.get<string>('CURSOR_MODEL') ?? 'composer-2.5';
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
      ? `Subject: ${input.subjectName ?? 'General'}\nGrade: ${input.gradeName ?? 'N/A'}\n\n${input.sourceText}\n\nRead the attached textbook page photo(s) and extract the lesson.`
      : `Subject: ${input.subjectName ?? 'General'}\nGrade: ${input.gradeName ?? 'N/A'}\n\nClean and format this OCR lesson text:\n${input.sourceText}`;

    try {
      const content = await this.withTimeout(
        input.images?.length
          ? this.completeWithImages(LESSON_PROCESSING_PROMPT, userPrompt, input.images)
          : this.complete(LESSON_PROCESSING_PROMPT, userPrompt),
        input.images?.length ? 50_000 : 25_000,
        'Lesson extraction',
      );
      const parsed = LessonOutputSchema.parse(JSON.parse(this.extractJson(content.text)));
      if (isFakeExtractText(parsed.summary)) {
        if (input.images?.length && isFakeExtractText(input.sourceText)) {
          throw new Error('Cursor did not read the textbook photos');
        }
        return this.textFallback(input);
      }
      return { data: parsed, ...content.meta };
    } catch (error) {
      this.logger.warn(
        `Lesson AI cleanup failed, using formatted OCR: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (input.images?.length && isFakeExtractText(input.sourceText)) {
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
  }): Promise<AiCompletionResult<{ title: string; description: string }>> {
    if (!this.apiKey) {
      return {
        data: {
          title: `${input.subjectName ?? 'Subject'} practice`,
          description: input.styleInstruction
            ? `${input.styleInstruction}\n\nComplete exercises based on: ${input.lessonSummary.slice(0, 240)}`
            : `Complete exercises based on: ${input.lessonSummary.slice(0, 120)}`,
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
      sayToTeacher: 'Thank you for the work you are doing. Let’s keep lessons and attendance updated every school day, then we can look at quiz scores together.',
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
    const { Agent, JsonlLocalAgentStore } = await import('@cursor/sdk');
    const runtime = this.prepareLocalRuntime();
    const agent = await Agent.create({
      apiKey: this.apiKey,
      model: { id: this.model },
      local: {
        cwd: runtime.cwd,
        store: new JsonlLocalAgentStore(runtime.storeDir),
      },
    });
    try {
      const run = await agent.send({
        text: `${system}\n\n${user}\n\nReturn ONLY valid JSON. Do not edit files or run tools.`,
        images: images.slice(0, 5).map((image) => ({
          data: image.buffer.toString('base64'),
          mimeType: image.mimeType,
        })),
      });
      const result = await run.wait();
      if (result.status !== 'finished') {
        throw new Error(`Cursor agent ${result.status || 'failed'} before reading the page photos`);
      }
      const text =
        typeof result.result === 'string'
          ? result.result
          : result.result
            ? JSON.stringify(result.result)
            : '';
      if (!text.trim()) {
        throw new Error('Cursor agent returned an empty result for the page photos.');
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
    } finally {
      agent.close();
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
    if (looksLikeRealLessonText(text)) {
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
