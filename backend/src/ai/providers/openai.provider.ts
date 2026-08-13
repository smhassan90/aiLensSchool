import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiCompletionResult,
  AiProvider,
} from './ai.provider';
import { LessonOutput, LessonOutputSchema } from '../schemas/lesson-output.schema';
import { QuizOutput, QuizOutputSchema } from '../schemas/quiz-output.schema';
import {
  HOMEWORK_GENERATION_PROMPT,
  LESSON_PROCESSING_PROMPT,
  QUIZ_GENERATION_PROMPT,
  STUDENT_ANALYSIS_PROMPT,
} from '../prompts';

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

@Injectable()
export class OpenAiProvider implements AiProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY') || undefined;
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async processLesson(input: {
    sourceText: string;
    subjectName?: string;
    gradeName?: string;
  }): Promise<AiCompletionResult<LessonOutput>> {
    if (!this.apiKey) {
      // Mock path ONLY when OPENAI_API_KEY is missing — enables local E2E without billed AI.
      return this.mockLesson(input.sourceText);
    }

    const content = await this.chat(
      LESSON_PROCESSING_PROMPT,
      `Subject: ${input.subjectName ?? 'General'}\nGrade: ${input.gradeName ?? 'N/A'}\n\nSource:\n${input.sourceText}`,
    );
    const parsed = LessonOutputSchema.parse(JSON.parse(this.extractJson(content.text)));
    return {
      data: parsed,
      provider: 'openai',
      model: content.model,
      inputTokens: content.inputTokens,
      outputTokens: content.outputTokens,
      estimatedCost: this.estimateCost(content.inputTokens, content.outputTokens),
    };
  }

  async generateQuiz(input: {
    lessonSummaries: string[];
    subjectName?: string;
    questionCount?: number;
  }): Promise<AiCompletionResult<QuizOutput>> {
    if (!this.apiKey) {
      // Mock path ONLY when OPENAI_API_KEY is missing — enables local E2E without billed AI.
      return this.mockQuiz(input.subjectName, input.questionCount ?? 5);
    }

    const content = await this.chat(
      QUIZ_GENERATION_PROMPT,
      `Subject: ${input.subjectName ?? 'General'}\nQuestion count: ${input.questionCount ?? 5}\n\nLessons:\n${input.lessonSummaries.join('\n---\n')}`,
    );
    const parsed = QuizOutputSchema.parse(JSON.parse(this.extractJson(content.text)));
    return {
      data: parsed,
      provider: 'openai',
      model: content.model,
      inputTokens: content.inputTokens,
      outputTokens: content.outputTokens,
      estimatedCost: this.estimateCost(content.inputTokens, content.outputTokens),
    };
  }

  async generateHomework(input: {
    lessonSummary: string;
    subjectName?: string;
  }): Promise<AiCompletionResult<{ title: string; description: string }>> {
    if (!this.apiKey) {
      // Mock path ONLY when OPENAI_API_KEY is missing.
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

    const content = await this.chat(
      HOMEWORK_GENERATION_PROMPT,
      `Subject: ${input.subjectName ?? 'General'}\n\n${input.lessonSummary}`,
    );
    const parsed = JSON.parse(this.extractJson(content.text)) as {
      title: string;
      description: string;
    };
    return {
      data: parsed,
      provider: 'openai',
      model: content.model,
      inputTokens: content.inputTokens,
      outputTokens: content.outputTokens,
      estimatedCost: this.estimateCost(content.inputTokens, content.outputTokens),
    };
  }

  async analyzeStudent(input: {
    resultsSummary: string;
  }): Promise<
    AiCompletionResult<{ summary: string; strengths: string[]; weaknesses: string[] }>
  > {
    if (!this.apiKey) {
      // Mock path ONLY when OPENAI_API_KEY is missing.
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

    const content = await this.chat(STUDENT_ANALYSIS_PROMPT, input.resultsSummary);
    const parsed = JSON.parse(this.extractJson(content.text)) as {
      summary: string;
      strengths: string[];
      weaknesses: string[];
    };
    return {
      data: parsed,
      provider: 'openai',
      model: content.model,
      inputTokens: content.inputTokens,
      outputTokens: content.outputTokens,
      estimatedCost: this.estimateCost(content.inputTokens, content.outputTokens),
    };
  }

  private mockLesson(sourceText: string): AiCompletionResult<LessonOutput> {
    this.logger.warn('OPENAI_API_KEY missing — returning deterministic mock lesson output');
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

  private mockQuiz(subjectName?: string, count = 5): AiCompletionResult<QuizOutput> {
    this.logger.warn('OPENAI_API_KEY missing — returning deterministic mock quiz output');
    const questions = Array.from({ length: Math.min(Math.max(count, 1), 10) }, (_, i) => ({
      type: 'MCQ' as const,
      questionText: `${subjectName ?? 'Subject'} question ${i + 1}: What is the main idea?`,
      marks: 1,
      correctAnswer: 'Option A',
      options: [
        { optionText: 'Option A', isCorrect: true },
        { optionText: 'Option B', isCorrect: false },
        { optionText: 'Option C', isCorrect: false },
        { optionText: 'Option D', isCorrect: false },
      ],
    }));
    return {
      data: QuizOutputSchema.parse({
        title: `${subjectName ?? 'Subject'} Quiz`,
        description: 'Auto-generated draft quiz for teacher review (mock AI).',
        questions,
      }),
      provider: 'mock',
      model: 'deterministic-mock',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
    };
  }

  private async chat(system: string, user: string) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${errText}`);
    }

    const json = (await response.json()) as OpenAiChatResponse;
    const text = json.choices?.[0]?.message?.content ?? '{}';
    return {
      text,
      model: json.model ?? this.model,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  }

  private extractJson(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) return trimmed;
    const match = /\{[\s\S]*\}/.exec(trimmed);
    return match ? match[0] : '{}';
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    // Rough gpt-4o-mini estimate USD
    return Number(((inputTokens * 0.00000015) + (outputTokens * 0.0000006)).toFixed(6));
  }
}
