import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER } from './providers/ai.provider';
import { CursorProvider } from './providers/cursor.provider';
import { OpenAiProvider } from './providers/openai.provider';
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
    LessonProcessingService,
    QuizGenerationService,
    HomeworkGenerationService,
    StudentAnalysisService,
  ],
  exports: [
    LessonProcessingService,
    QuizGenerationService,
    HomeworkGenerationService,
    StudentAnalysisService,
  ],
})
export class AiModule {}
