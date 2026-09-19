import { Module } from '@nestjs/common';
import { HeadTeachersService } from './head-teachers.service';
import { HeadTeachersController } from './head-teachers.controller';
import { CommonModule } from '../common/common.module';
import { AuditModule } from '../audit/audit.module';
import { TeachersModule } from '../teachers/teachers.module';
import { AcademicsModule } from '../academics/academics.module';
import { InsightsModule } from '../insights/insights.module';

@Module({
  imports: [CommonModule, AuditModule, TeachersModule, AcademicsModule, InsightsModule],
  providers: [HeadTeachersService],
  controllers: [HeadTeachersController],
  exports: [HeadTeachersService],
})
export class HeadTeachersModule {}
