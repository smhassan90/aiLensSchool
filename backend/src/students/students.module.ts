import { Module } from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { CommonModule } from '../common/common.module';
import { AuditModule } from '../audit/audit.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [CommonModule, AuditModule, FilesModule],
  providers: [StudentsService],
  controllers: [StudentsController],
  exports: [StudentsService],
})
export class StudentsModule {}
