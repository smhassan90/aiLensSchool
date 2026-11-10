import { Module } from '@nestjs/common';
import { AcademicsService } from './academics.service';
import { AcademicsController } from './academics.controller';
import { CommonModule } from '../common/common.module';
import { AuditModule } from '../audit/audit.module';
import { TimetablesModule } from '../timetables/timetables.module';
import { LibraryBooksModule } from '../library-books/library-books.module';
@Module({
  imports: [CommonModule, AuditModule, TimetablesModule, LibraryBooksModule],
  providers: [AcademicsService],
  controllers: [AcademicsController],
  exports: [AcademicsService],
})
export class AcademicsModule {}
