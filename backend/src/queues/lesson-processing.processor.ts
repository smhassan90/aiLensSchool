import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LessonsService } from '../lessons/lessons.service';
import { QUEUE_NAMES } from './queue-names';

@Processor(QUEUE_NAMES.LESSON_PROCESSING)
export class LessonProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(LessonProcessingProcessor.name);

  constructor(private readonly lessonsService: LessonsService) {
    super();
  }

  async process(job: Job<{ lessonId: string }>): Promise<void> {
    this.logger.log(`Processing lesson ${job.data.lessonId}`);
    await this.lessonsService.processLessonAsync(job.data.lessonId);
  }
}
