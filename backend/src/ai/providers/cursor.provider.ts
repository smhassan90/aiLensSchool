import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiCompletionResult, AiProvider } from './ai.provider';
import { LessonOutput, LessonOutputSchema } from '../schemas/lesson-output.schema';
import { QuizOutput, QuizOutputSchema } from '../schemas/quiz-output.schema';
import {
  HOMEWORK_GENERATION_PROMPT,
  LESSON_PROCESSING_PROMPT,
  QUIZ_GENERATION_PROMPT,
  STUDENT_ANALYSIS_PROMPT,
} from '../prompts';
import { mockQuestionsForMix, quizMixInstructions, resolveQuizMix } from '../quiz-mix';

@Injectable()
export class CursorProvider implements AiProvider {
  private readonly logger = new Logger(CursorProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('CURSOR_API_KEY')?.trim() || undefined;
    this.model = this.config.get<string>('CURSOR_MODEL') ?? 'composer-2.5';
  }

  async processLesson(input: {
    sourceText: string;
    subjectName?: string;
    gradeName?: string;
  }): Promise<AiCompletionResult<LessonOutput>> {
    if (!this.apiKey) {
      return this.mockLesson(input.sourceText);
    }

    const content = await this.complete(
      LESSON_PROCESSING_PROMPT,
      `Subject: ${input.subjectName ?? 'General'}\nGrade: ${input.gradeName ?? 'N/A'}\n\nSource:\n${input.sourceText}`,
    );
    const parsed = LessonOutputSchema.parse(JSON.parse(this.extractJson(content.text)));
    return { data: parsed, ...content.meta };
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
  }): Promise<AiCompletionResult<{ title: string; description: string }>> {
    if (!this.apiKey) {
      return {
        data: {
          title: `${input.subjectName ?? 'Subject'} practice`,
          description: `Complete exercises based on: ${input.lessonSummary.slice(0, 120)}`,
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
      `Subject: ${input.subjectName ?? 'General'}\n\n${input.lessonSummary}`,
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

  private async complete(system: string, user: string) {
    const { Agent } = await import('@cursor/sdk');
    const result = await Agent.prompt(
      `${system}\n\n${user}\n\nReturn ONLY valid JSON. Do not edit files or run tools.`,
      {
        apiKey: this.apiKey,
        model: { id: this.model },
        local: { cwd: process.cwd() },
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

  private mockLesson(sourceText: string): AiCompletionResult<LessonOutput> {
    this.logger.warn('CURSOR_API_KEY missing — returning deterministic mock lesson output');
    const snippet = sourceText.slice(0, 80).replace(/\s+/g, ' ').trim() || 'Untitled topic';
    return {
      data: LessonOutputSchema.parse({
        chapterName: 'Chapter 1',
        topicName: snippet.slice(0, 40) || 'Introduction',
        summary: `Lesson covers key ideas from the provided material: ${snippet}`,
        concepts: ['Core concept A', 'Core concept B', 'Practice application'],
        pageFrom: 1,
        pageTo: 3,
        teacherNotesSuggestion: 'Review vocabulary and assign short practice questions.',
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
