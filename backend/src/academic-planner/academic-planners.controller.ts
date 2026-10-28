import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { AcademicPlannersService } from './academic-planners.service';
import { AcademicPlannersWorkflowService } from './academic-planners-workflow.service';
import { PlannerApprovalService } from './planner-approval.service';
import { TeachingRecordsService } from './teaching-records.service';
import { PlannerTeachingHelpService } from './planner-teaching-help.service';
import { PlannerRecoveryService } from './planner-recovery.service';
import { CreatePlannerDto } from './dto/planner.dto';
import { AnalyzeChapterDto, GenerateScheduleDto } from './dto/planner-edit.dto';
import {
  MovePlannerLessonDto,
  RegeneratePlannerLessonDto,
  UpdatePlannerLessonDto,
} from './dto/planner-lesson.dto';
import { PlannerCommentRequiredDto, PlannerDecisionDto, SubmitPlannerDto } from './dto/planner-approval.dto';
import { UpsertTeachingRecordDto } from './dto/teaching-record.dto';
import { CreateRecoveryProposalDto, RegenerateRecoveryProposalDto } from './dto/planner-recovery.dto';
import { TeachingHelpRequestDto } from './dto/teaching-help.dto';

@Controller({ path: 'academic-planners', version: '1' })
@Roles(RoleName.SCHOOL_ADMIN, RoleName.TEACHER, RoleName.PRINCIPAL)
export class AcademicPlannersController {
  constructor(
    private readonly planners: AcademicPlannersService,
    private readonly workflow: AcademicPlannersWorkflowService,
    private readonly approval: PlannerApprovalService,
    private readonly teachingRecords: TeachingRecordsService,
    private readonly teachingHelpService: PlannerTeachingHelpService,
    private readonly recovery: PlannerRecoveryService,
  ) {}

  @Get('options')
  getOptions(
    @CurrentUser() user: AuthUser,
    @Query('sectionId') sectionId: string,
    @Query('subjectId') subjectId: string,
  ) {
    return this.workflow.getOptions(user, sectionId, subjectId);
  }

  @Get('books/:bookId/chapters')
  listBookChapters(@CurrentUser() user: AuthUser, @Param('bookId') bookId: string) {
    return this.workflow.listBookChapters(user, bookId);
  }

  @Get('approvals')
  listApprovals(@CurrentUser() user: AuthUser) {
    return this.approval.listApprovals(user);
  }

  @Get('my-day')
  myDay(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.teachingRecords.myDay(user, date);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('sectionId') sectionId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('scope') scope?: string,
  ) {
    return this.workflow.list(user, { status, sectionId, subjectId, teacherId, scope });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePlannerDto) {
    return this.planners.create(user, dto);
  }

  @Delete(':id')
  archivePlanner(@CurrentUser() user: AuthUser, @Param('id') plannerId: string) {
    return this.planners.archive(user, plannerId);
  }

  @Get(':id')
  getPlanner(@CurrentUser() user: AuthUser, @Param('id') plannerId: string) {
    return this.approval.getPlannerDetail(user, plannerId);
  }

  @Get(':id/v/:versionId')
  getVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.planners.getVersionPayload(user, plannerId, versionId);
  }

  @Post(':id/v/:versionId/chapters/:chapterKey/analyze')
  analyzeChapter(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Param('chapterKey') chapterKey: string,
    @Body() dto: AnalyzeChapterDto,
  ) {
    return this.workflow.analyzeChapter(
      user,
      plannerId,
      versionId,
      chapterKey,
      dto.expectedRevision,
      dto.force,
    );
  }

  @Post(':id/v/:versionId/generate')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Body() dto: GenerateScheduleDto,
  ) {
    return this.workflow.generate(user, plannerId, versionId, dto.expectedRevision);
  }

  @Patch(':id/v/:versionId/lessons/:lessonKey')
  updateLesson(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Param('lessonKey') lessonKey: string,
    @Body() dto: UpdatePlannerLessonDto,
  ) {
    const { expectedRevision, ...body } = dto;
    return this.workflow.updateLesson(user, plannerId, versionId, lessonKey, expectedRevision, body);
  }

  @Post(':id/v/:versionId/lessons/:lessonKey/move')
  moveLesson(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Param('lessonKey') lessonKey: string,
    @Body() dto: MovePlannerLessonDto,
  ) {
    return this.workflow.moveLessonToSlot(user, plannerId, versionId, lessonKey, dto.expectedRevision, {
      date: dto.date,
      periodNumber: dto.periodNumber,
    });
  }

  @Post(':id/v/:versionId/lessons/:lessonKey/regenerate')
  regenerateLesson(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Param('lessonKey') lessonKey: string,
    @Body() dto: RegeneratePlannerLessonDto,
  ) {
    return this.workflow.regenerateLesson(user, plannerId, versionId, lessonKey, dto.expectedRevision, {
      regenerateActivity: dto.regenerateActivity,
    });
  }

  @Post(':id/v/:versionId/withdraw')
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Body() dto: PlannerDecisionDto,
  ) {
    return this.approval.withdraw(user, plannerId, versionId, dto.expectedRevision);
  }

  @Post(':id/v/:versionId/submit')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Body() dto: SubmitPlannerDto,
  ) {
    return this.approval.submit(
      user,
      plannerId,
      versionId,
      dto.expectedRevision,
      dto.acknowledgeRisk,
      dto.note,
    );
  }

  @Post(':id/v/:versionId/approve')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Body() dto: PlannerDecisionDto,
  ) {
    return this.approval.approve(user, plannerId, versionId, dto.expectedRevision, dto.comment);
  }

  @Post(':id/v/:versionId/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Body() dto: PlannerCommentRequiredDto,
  ) {
    return this.approval.reject(user, plannerId, versionId, dto.expectedRevision, dto.comment);
  }

  @Post(':id/v/:versionId/request-changes')
  requestChanges(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Body() dto: PlannerCommentRequiredDto,
  ) {
    return this.approval.requestChanges(user, plannerId, versionId, dto.expectedRevision, dto.comment);
  }

  @Put(':id/records')
  upsertRecord(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Body() dto: UpsertTeachingRecordDto,
  ) {
    return this.teachingRecords.upsertRecord(user, plannerId, dto);
  }

  @Get(':id/records')
  listRecords(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.teachingRecords.listRecords(user, plannerId, from, to);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/lessons/:lessonKey/teaching-help')
  getTeachingHelp(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('lessonKey') lessonKey: string,
    @Body() body: TeachingHelpRequestDto,
  ) {
    return this.teachingHelpService.teachingHelp(
      user,
      plannerId,
      lessonKey,
      body?.versionId,
      body?.mode,
      body?.question,
    );
  }

  @Get(':id/recovery-eligible')
  recoveryEligible(@CurrentUser() user: AuthUser, @Param('id') plannerId: string) {
    return this.recovery.listEligible(user, plannerId);
  }

  @Post(':id/recovery-proposals')
  recoveryProposal(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Body() dto: CreateRecoveryProposalDto,
  ) {
    return this.recovery.proposeRecovery(user, plannerId, dto);
  }

  @Post(':id/v/:versionId/recovery-regenerate')
  recoveryRegenerate(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Body() dto: RegenerateRecoveryProposalDto,
  ) {
    return this.recovery.regenerateRecovery(user, plannerId, versionId, dto.expectedRevision, dto);
  }

  @Post(':id/v/:versionId/publish-direct')
  publishDirect(
    @CurrentUser() user: AuthUser,
    @Param('id') plannerId: string,
    @Param('versionId') versionId: string,
    @Body() dto: PlannerDecisionDto,
  ) {
    return this.approval.publishDirect(user, plannerId, versionId, dto.expectedRevision);
  }
}
