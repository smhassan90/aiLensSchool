import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readEnv } from '../common/env';
import { AI_PROVIDER, FAST_AI_PROVIDER } from './providers/ai.provider';
import { CursorProvider } from './providers/cursor.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { ChapterCompileService } from './services/chapter-compile.service';
import { LessonProcessingService } from './services/lesson-processing.service';
import { QuizGenerationService } from './services/quiz-generation.service';
import { HomeworkGenerationService } from './services/homework-generation.service';
import { StudentAnalysisService } from './services/student-analysis.service';

@Module({
  providers: [
    CursorProvider,
    OpenAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [ConfigService, CursorProvider, OpenAiProvider],
      useFactory: (
        config: ConfigService,
        cursor: CursorProvider,
        openai: OpenAiProvider,
      ) => ((config.get<string>('AI_PROVIDER') ?? 'cursor') === 'openai' ? openai : cursor),
    },
    {
      provide: FAST_AI_PROVIDER,
      inject: [ConfigService, CursorProvider, OpenAiProvider],
      useFactory: (
        config: ConfigService,
        cursor: CursorProvider,
        openai: OpenAiProvider,
      ) => {
        // Exam/quiz/homework JSON: prefer OpenAI when configured — Cursor agent
        // often exceeds even a raised timeout and returns "Exam generation timed out".
        const prefer = (
          config.get<string>('FAST_AI_PROVIDER') ??
          readEnv('FAST_AI_PROVIDER') ??
          ''
        )
          .trim()
          .toLowerCase();
        if (prefer === 'cursor') return cursor;
        if (openai.hasJson()) return openai;
        return cursor;
      },
    },
    LessonProcessingService,
    ChapterCompileService,
    QuizGenerationService,
    HomeworkGenerationService,
    StudentAnalysisService,
  ],
  exports: [
    AI_PROVIDER,
    FAST_AI_PROVIDER,
    LessonProcessingService,
    ChapterCompileService,
    QuizGenerationService,
    HomeworkGenerationService,
    StudentAnalysisService,
  ],
})
export class AiModule {}
