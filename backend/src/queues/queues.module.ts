import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { LessonProcessingProcessor } from './lesson-processing.processor';
import { NotificationProcessor } from './notification.processor';
import { QuizReminderProcessor } from './quiz-reminder.processor';
import { LessonsModule } from '../lessons/lessons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QUEUE_NAMES } from './queue-names';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.LESSON_PROCESSING },
      { name: QUEUE_NAMES.AI_GENERATION },
      { name: QUEUE_NAMES.NOTIFICATIONS },
      { name: QUEUE_NAMES.QUIZ_REMINDERS },
      { name: QUEUE_NAMES.BILLING },
      { name: QUEUE_NAMES.FILE_PROCESSING },
    ),
    forwardRef(() => LessonsModule),
    NotificationsModule,
  ],
  providers: [LessonProcessingProcessor, NotificationProcessor, QuizReminderProcessor],
})
export class QueuesModule {}
