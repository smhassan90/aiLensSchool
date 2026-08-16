import { Module } from '@nestjs/common';
import { FeesService } from './fees.service';
import { FeesController } from './fees.controller';
import { CommonModule } from '../common/common.module';
import { AuditModule } from '../audit/audit.module';
import { ParentsModule } from '../parents/parents.module';

@Module({
  imports: [CommonModule, AuditModule, ParentsModule],
  providers: [FeesService],
  controllers: [FeesController],
  exports: [FeesService],
})
export class FeesModule {}
