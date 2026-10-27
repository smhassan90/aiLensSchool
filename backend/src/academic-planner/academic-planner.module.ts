import { Module } from '@nestjs/common';
import { TimetablesModule } from '../timetables/timetables.module';
import { AiModule } from '../ai/ai.module';
import { LibraryBooksModule } from '../library-books/library-books.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HeadTeachersModule } from '../head-teachers/head-teachers.module';
import { AcademicPlannersController } from './academic-planners.controller';
import { AcademicPlannersService } from './academic-planners.service';
import { PlannerAccessService } from './planner-access.service';
import { PlannerContentService } from './planner-content.service';
import { AcademicPlannersWorkflowService } from './academic-planners-workflow.service';
import { PlannerApprovalService } from './planner-approval.service';
import { TeachingRecordsService } from './teaching-records.service';
import { ClassroomRoundsService } from './classroom-rounds.service';
import { ClassroomRoundsController } from './classroom-rounds.controller';
import { PlannerReportsService } from './planner-reports.service';
import { PlannerReportsController } from './planner-reports.controller';
import { PlannerTeachingHelpService } from './planner-teaching-help.service';
import { PlannerRecoveryService } from './planner-recovery.service';
import { TeachingHelpUsageService } from './teaching-help-usage';

@Module({
  imports: [TimetablesModule, AiModule, LibraryBooksModule, AuditModule, NotificationsModule, HeadTeachersModule],
  controllers: [AcademicPlannersController, ClassroomRoundsController, PlannerReportsController],
  providers: [
    AcademicPlannersService,
    PlannerAccessService,
    PlannerContentService,
    AcademicPlannersWorkflowService,
    PlannerApprovalService,
    TeachingRecordsService,
    ClassroomRoundsService,
    PlannerReportsService,
    PlannerTeachingHelpService,
    TeachingHelpUsageService,
    PlannerRecoveryService,
  ],
  exports: [AcademicPlannersService, PlannerAccessService],
})
export class AcademicPlannerModule {}
