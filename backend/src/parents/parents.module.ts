import { Module } from '@nestjs/common';
import { ParentsService } from './parents.service';
import { ParentsController } from './parents.controller';
import { CommonModule } from '../common/common.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [CommonModule, AuditModule],
  providers: [ParentsService],
  controllers: [ParentsController],
  exports: [ParentsService],
})
export class ParentsModule {}
