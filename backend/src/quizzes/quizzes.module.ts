import { Module, forwardRef } from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { QuizzesController } from './quizzes.controller';
import { CommonModule } from '../common/common.module';
import { AuditModule } from '../audit/audit.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ParentsModule } from '../parents/parents.module';

@Module({
  imports: [
    CommonModule,
    AuditModule,
    AiModule,
    forwardRef(() => NotificationsModule),
    ParentsModule,
  ],
  providers: [QuizzesService],
  controllers: [QuizzesController],
  exports: [QuizzesService],
})
export class QuizzesModule {}
