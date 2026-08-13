import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notifications/notifications.service';
import { QUEUE_NAMES } from './queue-names';

interface QuizReminderJob {
  quizId: string;
  reminderNumber: number;
}

@Processor(QUEUE_NAMES.QUIZ_REMINDERS)
export class QuizReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(QuizReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  async process(job: Job<QuizReminderJob>): Promise<void> {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: job.data.quizId },
      include: {
        assignments: true,
        attempts: true,
      },
    });
    if (!quiz || quiz.status !== 'PUBLISHED') return;

    const settings = await this.prisma.schoolSettings.findUnique({
      where: { schoolId: quiz.schoolId },
    });
    const maxReminders = settings?.maxQuizReminders ?? 2;
    if (job.data.reminderNumber > maxReminders) return;

    const attempted = new Set(quiz.attempts.filter((a) => a.submittedAt).map((a) => a.studentId));
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { sectionId: quiz.sectionId, status: 'ACTIVE' },
      include: {
        student: {
          include: { parents: { include: { parent: true } } },
        },
      },
    });

    for (const enrollment of enrollments) {
      if (attempted.has(enrollment.studentId)) continue;
      for (const link of enrollment.student.parents) {
        await this.notifications.createAndQueue({
          schoolId: quiz.schoolId,
          userId: link.parent.userId,
          type: NotificationType.QUIZ_REMINDER,
          title: `Reminder: ${quiz.title}`,
          body: 'Your child has a quiz that is still incomplete.',
          deepLink: `/quiz/${quiz.id}`,
        });
      }
    }

    this.logger.log(`Sent quiz reminder #${job.data.reminderNumber} for ${quiz.id}`);
  }
}
