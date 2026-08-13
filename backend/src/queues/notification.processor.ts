import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationService, CreateNotificationInput } from '../notifications/notifications.service';
import { QUEUE_NAMES } from './queue-names';

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly notifications: NotificationService) {
    super();
  }

  async process(job: Job<CreateNotificationInput>): Promise<void> {
    this.logger.log(`Dispatching notification to user ${job.data.userId}`);
    await this.notifications.createAndQueue(job.data);
  }
}
