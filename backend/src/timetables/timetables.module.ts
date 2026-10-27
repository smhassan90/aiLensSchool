import { Module } from '@nestjs/common';
import { LessonsModule } from '../lessons/lessons.module';
import { FilesModule } from '../files/files.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimetableResolverService } from './timetable-resolver.service';
import { SchoolCalendarService } from './school-calendar.service';
import { SchoolCalendarController } from './school-calendar.controller';
import { TimetablesController } from './timetables.controller';
import { TimetableImportsService } from './timetable-imports.service';
import { TimetableVersionsService } from './timetable-versions.service';

@Module({
  imports: [LessonsModule, FilesModule, AiModule, AuditModule, NotificationsModule],
  providers: [
    TimetableResolverService,
    SchoolCalendarService,
    TimetableImportsService,
    TimetableVersionsService,
  ],
  controllers: [SchoolCalendarController, TimetablesController],
  exports: [TimetableResolverService, SchoolCalendarService],
})
export class TimetablesModule {}
