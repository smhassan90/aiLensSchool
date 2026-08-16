import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { PageOcrService } from './page-ocr.service';
import { CommonModule } from '../common/common.module';
import { AuditModule } from '../audit/audit.module';
import { AiModule } from '../ai/ai.module';
import { ParentsModule } from '../parents/parents.module';

@Module({
  imports: [CommonModule, AuditModule, AiModule, ParentsModule],
  providers: [LessonsService, PageOcrService],
  controllers: [LessonsController],
  exports: [LessonsService],
})
export class LessonsModule {}
