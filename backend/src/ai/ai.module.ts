import { Module } from '@nestjs/common';
import { AI_PROVIDER } from './providers/ai.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { LessonProcessingService } from './services/lesson-processing.service';
import { QuizGenerationService } from './services/quiz-generation.service';
import { HomeworkGenerationService } from './services/homework-generation.service';
import { StudentAnalysisService } from './services/student-analysis.service';

@Module({
  providers: [
    OpenAiProvider,
    { provide: AI_PROVIDER, useExisting: OpenAiProvider },
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
