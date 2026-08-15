import { LessonOutput } from '../schemas/lesson-output.schema';
import { QuizOutput } from '../schemas/quiz-output.schema';

export interface AiCompletionResult<T> {
  data: T;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface AiProvider {
  processLesson(input: {
    sourceText: string;
    subjectName?: string;
    gradeName?: string;
  }): Promise<AiCompletionResult<LessonOutput>>;

  generateQuiz(input: {
    lessonSummaries: string[];
    subjectName?: string;
    questionCount?: number;
    quickGenerate?: boolean;
    mcqCount?: number;
    fillBlankCount?: number;
    shortAnswerCount?: number;
  }): Promise<AiCompletionResult<QuizOutput>>;

  generateHomework(input: {
    lessonSummary: string;
    subjectName?: string;
  }): Promise<AiCompletionResult<{ title: string; description: string }>>;

  analyzeStudent(input: {
    resultsSummary: string;
  }): Promise<
    AiCompletionResult<{ summary: string; strengths: string[]; weaknesses: string[] }>
  >;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
