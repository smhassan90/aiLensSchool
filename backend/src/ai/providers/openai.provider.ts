import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiCompletionResult,
  AiProvider,
  LessonImageInput,
} from './ai.provider';
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
    this.apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim() || undefined;
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  hasVision() {
    return Boolean(this.apiKey);
  }

  async processLesson(input: {
    sourceText: string;
    subjectName?: string;
    gradeName?: string;
    images?: LessonImageInput[];
  }): Promise<AiCompletionResult<LessonOutput>> {
    if (!this.apiKey) {
      // Mock path ONLY when OPENAI_API_KEY is missing — enables local E2E without billed AI.
      return this.mockLesson(input.sourceText, input.images?.length);
    }

    const content = await this.chat(
      LESSON_PROCESSING_PROMPT,
      `Subject: ${input.subjectName ?? 'General'}\nGrade: ${input.gradeName ?? 'N/A'}\n\nSource:\n${input.sourceText}\n\nTranscribe the full page. Do not write a short retelling.`,
      input.images,
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
    quickGenerate?: boolean;
    mcqCount?: number;
    fillBlankCount?: number;
    shortAnswerCount?: number;
  }): Promise<AiCompletionResult<QuizOutput>> {
    const mix = resolveQuizMix(input);
    if (!this.apiKey) {
      // Mock path ONLY when OPENAI_API_KEY is missing — enables local E2E without billed AI.
      return this.mockQuiz(input.subjectName, mix);
    }

    const content = await this.chat(
      QUIZ_GENERATION_PROMPT,
      `Subject: ${input.subjectName ?? 'General'}\n${quizMixInstructions(mix)}\n\nLessons:\n${input.lessonSummaries.join('\n---\n')}`,
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
    gradeName?: string;
    styleInstruction?: string;
  }): Promise<AiCompletionResult<{ title: string; description: string }>> {
    if (!this.apiKey) {
      // Mock path ONLY when OPENAI_API_KEY is missing.
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

    const content = await this.chat(
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
      sayToTeacher:
        'Thank you for the work you are doing. Let’s keep lessons and quizzes updated, then we can look at results together.',
    };
    if (!this.apiKey) {
      return { data: fallback, provider: 'mock', model: 'deterministic-mock', inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
    }
    try {
      const content = await this.chat(TEACHER_COACH_PROMPT, input.facts);
      const parsed = JSON.parse(this.extractJson(content.text)) as typeof fallback;
      return {
        data: parsed,
        provider: 'openai',
        model: content.model,
        inputTokens: content.inputTokens,
        outputTokens: content.outputTokens,
        estimatedCost: this.estimateCost(content.inputTokens, content.outputTokens),
      };
    } catch {
      return { data: fallback, provider: 'mock', model: 'deterministic-mock', inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
    }
  }

  private mockLesson(sourceText: string, imageCount = 0): AiCompletionResult<LessonOutput> {
    this.logger.warn('OPENAI_API_KEY missing — returning deterministic mock lesson output');
    const snippet = sourceText.slice(0, 80).replace(/\s+/g, ' ').trim() || 'Untitled topic';
    const photoNote = imageCount
      ? `Content taken from ${imageCount} photographed textbook page(s). Original photos were not saved. `
      : '';
    return {
      data: LessonOutputSchema.parse({
        chapterName: 'Chapter 1',
        topicName: snippet.slice(0, 40) || 'Introduction',
        summary: `${photoNote}Lesson covers key ideas from the provided material: ${snippet}`,
        concepts: ['Core concept A', 'Core concept B', 'Practice application'],
        pageFrom: 1,
        pageTo: Math.max(3, imageCount || 3),
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
    this.logger.warn('OPENAI_API_KEY missing — returning deterministic mock quiz output');
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

  private async chat(system: string, user: string, images?: LessonImageInput[]) {
    const userContent =
      images?.length
        ? [
            { type: 'text', text: user },
            ...images.slice(0, 10).map((image) => ({
              type: 'image_url',
              image_url: {
                url: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
              },
            })),
          ]
        : user;

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
          { role: 'user', content: userContent },
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
