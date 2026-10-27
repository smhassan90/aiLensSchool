import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  NotificationType,
  PlannerApprovalAction,
  PlannerStatus,
  PlannerVersionOrigin,
  PlannerVersionStatus,
  RoleName,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notifications.service';
import { PlannerAccessService } from './planner-access.service';
import { AcademicPlannersService } from './academic-planners.service';
import { PlannerRecoveryService } from './planner-recovery.service';
import { canTransitionVersion, isVersionEditable } from './planner-status';
import { ScheduleSummary } from './planner-types';
import { gradeClassLabel } from '../common/utils/section-class-label';
import { teacherDisplayName } from '../common/utils/person-name';

@Injectable()
export class PlannerApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly access: PlannerAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly planners: AcademicPlannersService,
    private readonly recovery: PlannerRecoveryService,
  ) {}

  async listApprovals(user: AuthUser) {
    const actor = await this.access.resolveActor(user);
    this.access.assertCanDecide(actor);

    const versions = await this.prisma.academicPlannerVersion.findMany({
      where: { schoolId: actor.schoolId, status: PlannerVersionStatus.SUBMITTED },
      include: {
        _count: { select: { chapters: true } },
        planner: {
          include: {
            subject: { select: { name: true } },
            section: { select: { name: true, grade: { select: { name: true } } } },
            teacher: { select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const recoveries: typeof versions = [];
    const planners = versions
      .filter((v) => v.submittedById !== actor.userId)
      .filter((v) => {
        if (v.origin === PlannerVersionOrigin.RECOVERY) {
          recoveries.push(v);
          return false;
        }
        return true;
      })
      .map((v) => ({
        plannerId: v.plannerId,
        versionId: v.id,
        title: v.planner.title,
        classLabel: gradeClassLabel(v.planner.section),
        subjectName: v.planner.subject.name,
        teacherName: teacherDisplayName(
          v.planner.teacher.user.firstName,
          v.planner.teacher.user.lastName,
          v.planner.teacher.gender,
        ),
        examType: v.planner.examType,
        examDate: v.planner.examDate.toISOString().slice(0, 10),
        chapterCount: v._count.chapters,
        submittedAt: v.submittedAt?.toISOString() ?? null,
        summary: v.summary as ScheduleSummary | null,
        submittedById: v.submittedById,
      }));

    return {
      planners,
      recoveries: recoveries.map((v) => ({
        plannerId: v.plannerId,
        versionId: v.id,
        classLabel: gradeClassLabel(v.planner.section),
        subjectName: v.planner.subject.name,
        teacherName: teacherDisplayName(
          v.planner.teacher.user.firstName,
          v.planner.teacher.user.lastName,
          v.planner.teacher.gender,
        ),
        submittedAt: v.submittedAt?.toISOString() ?? null,
        summary: v.summary as ScheduleSummary | null,
        impact: v.impact,
        changeReason: v.changeReason,
      })),
    };
  }

  async getPlannerDetail(user: AuthUser, plannerId: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const planner = await this.prisma.academicPlanner.findFirst({
      where: { id: plannerId, schoolId },
      include: {
        subject: true,
        section: { include: { grade: true } },
        teacher: { include: { user: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            status: true,
            origin: true,
            submittedAt: true,
            decidedAt: true,
            createdAt: true,
          },
        },
        approvalEvents: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!planner) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });
    }
    return {
      planner: {
        id: planner.id,
        title: planner.title,
        status: planner.status,
        examDate: planner.examDate.toISOString().slice(0, 10),
        classLabel: gradeClassLabel(planner.section),
        subject: planner.subject.name,
        teacher: teacherDisplayName(
          planner.teacher.user.firstName,
          planner.teacher.user.lastName,
          planner.teacher.gender,
        ),
        workingVersionId: planner.workingVersionId,
        approvedVersionId: planner.approvedVersionId,
      },
      versions: planner.versions,
      approvalEvents: planner.approvalEvents,
    };
  }

  async submit(
    user: AuthUser,
    plannerId: string,
    versionId: string,
    expectedRevision: number,
    acknowledgeRisk?: boolean,
    note?: string,
  ) {
    const actor = await this.access.resolveActor(user);
    const schoolId = actor.schoolId;
    const { planner, version } = await this.loadPlannerVersion(schoolId, plannerId, versionId);
    this.access.assertCanSubmit(actor, planner);

    if (!isVersionEditable(version.status)) {
      throw new ConflictException({ code: 'VERSION_NOT_EDITABLE', message: 'Version cannot be submitted' });
    }

    const summary = version.summary as ScheduleSummary | null;
    if (!summary) {
      throw new UnprocessableEntityException({
        code: 'CHAPTER_NOT_ANALYZED',
        message: 'Generate the schedule before submitting',
      });
    }
    if (summary.feasibility !== 'FEASIBLE' && !acknowledgeRisk) {
      throw new UnprocessableEntityException({
        error: {
          code: 'RISK_ACKNOWLEDGEMENT_REQUIRED',
          message: 'Schedule is at risk or infeasible; acknowledge to submit',
          details: { feasibility: summary.feasibility, shortfallMinutes: summary.shortfallMinutes },
        },
      });
    }

    await this.recovery.assertRecoverySubmitReady(schoolId, planner, version);

    const submittedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const cas = await tx.academicPlannerVersion.updateMany({
        where: {
          id: versionId,
          revision: expectedRevision,
          status: { in: [PlannerVersionStatus.DRAFT, PlannerVersionStatus.CHANGES_REQUESTED] },
        },
        data: {
          status: PlannerVersionStatus.SUBMITTED,
          submittedById: actor.userId,
          submittedAt,
          revision: { increment: 1 },
        },
      });
      if (cas.count === 0) {
        throw new ConflictException({
          error: { code: 'PLANNER_VERSION_CONFLICT', message: 'Version conflict', details: { currentRevision: version.revision } },
        });
      }

      const lock = await tx.academicPlanner.updateMany({
        where: { id: plannerId, lockRevision: planner.lockRevision },
        data: {
          status: PlannerStatus.SUBMITTED,
          lockRevision: { increment: 1 },
        },
      });
      if (lock.count === 0) {
        throw new ConflictException({ code: 'PLANNER_VERSION_CONFLICT', message: 'Planner lock conflict' });
      }

      await tx.plannerApprovalEvent.create({
        data: {
          schoolId,
          plannerId,
          versionId,
          action: PlannerApprovalAction.SUBMITTED,
          fromStatus: version.status,
          toStatus: PlannerVersionStatus.SUBMITTED,
          actorUserId: actor.userId,
          comment: note?.trim() || null,
        },
      });
    });

    void this.notifyApprovers(schoolId, plannerId, version.origin === PlannerVersionOrigin.RECOVERY);
    this.audit.log({
      actorUserId: actor.userId,
      schoolId,
      action: 'PLANNER_SUBMITTED',
      entityType: 'AcademicPlanner',
      entityId: plannerId,
      metadata: { versionId, note },
    });

    return this.planners.getVersionPayload(user, plannerId, versionId);
  }

  async withdraw(user: AuthUser, plannerId: string, versionId: string, expectedRevision: number) {
    const actor = await this.access.resolveActor(user);
    const schoolId = actor.schoolId;
    const { planner, version } = await this.loadPlannerVersion(schoolId, plannerId, versionId);

    if (version.status !== PlannerVersionStatus.SUBMITTED) {
      throw new ConflictException({ code: 'VERSION_NOT_SUBMITTED', message: 'Only submitted versions can be withdrawn' });
    }
    const isOwner =
      actor.isPrincipalOrAdmin ||
      planner.createdById === actor.userId ||
      (actor.teacherProfileId != null && planner.teacherId === actor.teacherProfileId);
    if (!isOwner) {
      throw new ForbiddenException({ code: 'PLANNER_FORBIDDEN', message: 'You cannot withdraw this submission' });
    }
    if (version.submittedById !== actor.userId && !actor.isPrincipalOrAdmin) {
      throw new ForbiddenException({ code: 'PLANNER_FORBIDDEN', message: 'Only the submitter can withdraw' });
    }

    await this.prisma.$transaction(async (tx) => {
      const cas = await tx.academicPlannerVersion.updateMany({
        where: { id: versionId, status: PlannerVersionStatus.SUBMITTED, revision: expectedRevision },
        data: {
          status: PlannerVersionStatus.DRAFT,
          revision: { increment: 1 },
          submittedById: null,
          submittedAt: null,
        },
      });
      if (cas.count === 0) {
        const current = await tx.academicPlannerVersion.findUnique({ where: { id: versionId } });
        if (current?.status !== PlannerVersionStatus.SUBMITTED) {
          throw new ConflictException({ code: 'ALREADY_DECIDED', message: 'This version is no longer submitted' });
        }
        throw new ConflictException({ code: 'PLANNER_VERSION_CONFLICT', message: 'Version conflict' });
      }

      const lock = await tx.academicPlanner.updateMany({
        where: { id: plannerId, lockRevision: planner.lockRevision },
        data: {
          status: PlannerStatus.DRAFT,
          lockRevision: { increment: 1 },
        },
      });
      if (lock.count === 0) {
        throw new ConflictException({ code: 'PLANNER_VERSION_CONFLICT', message: 'Planner lock conflict' });
      }

      await tx.plannerApprovalEvent.create({
        data: {
          schoolId,
          plannerId,
          versionId,
          action: PlannerApprovalAction.WITHDRAWN,
          fromStatus: PlannerVersionStatus.SUBMITTED,
          toStatus: PlannerVersionStatus.DRAFT,
          actorUserId: actor.userId,
          comment: null,
        },
      });
    });

    this.audit.log({
      actorUserId: actor.userId,
      schoolId,
      action: 'PLANNER_WITHDRAWN',
      entityType: 'AcademicPlanner',
      entityId: plannerId,
      metadata: { versionId },
    });

    return this.planners.getVersionPayload(user, plannerId, versionId);
  }

  async approve(user: AuthUser, plannerId: string, versionId: string, expectedRevision: number, comment?: string) {
    return this.decide(user, plannerId, versionId, expectedRevision, 'approve', comment);
  }

  async reject(user: AuthUser, plannerId: string, versionId: string, expectedRevision: number, comment: string) {
    if (!comment?.trim() || comment.trim().length < 3) {
      throw new BadRequestException({ code: 'COMMENT_REQUIRED', message: 'A rejection reason is required' });
    }
    return this.decide(user, plannerId, versionId, expectedRevision, 'reject', comment);
  }

  async requestChanges(
    user: AuthUser,
    plannerId: string,
    versionId: string,
    expectedRevision: number,
    comment: string,
  ) {
    if (!comment?.trim() || comment.trim().length < 3) {
      throw new BadRequestException({ code: 'COMMENT_REQUIRED', message: 'A comment is required' });
    }
    return this.decide(user, plannerId, versionId, expectedRevision, 'request-changes', comment);
  }

  async publishDirect(user: AuthUser, plannerId: string, versionId: string, expectedRevision: number) {
    const actor = await this.access.resolveActor(user);
    const schoolId = actor.schoolId;
    const { planner, version } = await this.loadPlannerVersion(schoolId, plannerId, versionId);
    this.access.assertCanPublishDirect(actor, version);

    if (version.status !== PlannerVersionStatus.DRAFT) {
      throw new ConflictException({ code: 'VERSION_NOT_EDITABLE', message: 'Only drafts can be published directly' });
    }

    await this.prisma.$transaction(async (tx) => {
      const cas = await tx.academicPlannerVersion.updateMany({
        where: { id: versionId, revision: expectedRevision, status: PlannerVersionStatus.DRAFT },
        data: {
          status: PlannerVersionStatus.APPROVED,
          decidedById: actor.userId,
          decidedAt: new Date(),
          revision: { increment: 1 },
        },
      });
      if (cas.count === 0) {
        throw new ConflictException({ code: 'PLANNER_VERSION_CONFLICT', message: 'Version conflict' });
      }
      if (planner.approvedVersionId) {
        await tx.academicPlannerVersion.updateMany({
          where: { id: planner.approvedVersionId, status: PlannerVersionStatus.APPROVED },
          data: { status: PlannerVersionStatus.SUPERSEDED },
        });
      }
      await tx.academicPlanner.updateMany({
        where: { id: plannerId, lockRevision: planner.lockRevision },
        data: {
          approvedVersionId: versionId,
          workingVersionId: null,
          status: PlannerStatus.PUBLISHED,
          lockRevision: { increment: 1 },
        },
      });
      await tx.plannerApprovalEvent.create({
        data: {
          schoolId,
          plannerId,
          versionId,
          action: PlannerApprovalAction.PUBLISHED_DIRECTLY,
          fromStatus: PlannerVersionStatus.DRAFT,
          toStatus: PlannerVersionStatus.APPROVED,
          actorUserId: actor.userId,
        },
      });
    });
    this.audit.log({
      actorUserId: actor.userId,
      schoolId,
      action: 'PLANNER_PUBLISHED_DIRECTLY',
      entityType: 'AcademicPlanner',
      entityId: plannerId,
    });
    return this.planners.getVersionPayload(user, plannerId, versionId);
  }

  private async decide(
    user: AuthUser,
    plannerId: string,
    versionId: string,
    expectedRevision: number,
    action: 'approve' | 'reject' | 'request-changes',
    comment?: string,
  ) {
    const actor = await this.access.resolveActor(user);
    this.access.assertCanDecide(actor);
    const schoolId = actor.schoolId;
    const { planner, version } = await this.loadPlannerVersion(schoolId, plannerId, versionId);

    if (version.submittedById === actor.userId) {
      throw new ForbiddenException({ code: 'SELF_APPROVAL_FORBIDDEN', message: 'You cannot review your own submission' });
    }

    const transition = canTransitionVersion(PlannerVersionStatus.SUBMITTED, action);
    if (!transition.allowed || !transition.to) {
      throw new ConflictException({ code: 'ALREADY_DECIDED', message: 'This version is not awaiting a decision' });
    }

    if (action === 'approve') {
      await this.recovery.assertRecoveryApproveReady(schoolId, planner, version);
      await this.finalizeApproval(actor, planner, version, versionId, expectedRevision, PlannerApprovalAction.APPROVED, comment);
    } else {
      await this.prisma.$transaction(async (tx) => {
        const cas = await tx.academicPlannerVersion.updateMany({
          where: { id: versionId, status: PlannerVersionStatus.SUBMITTED, revision: expectedRevision },
          data: {
            status: transition.to,
            decidedById: actor.userId,
            decidedAt: new Date(),
            decisionComment: comment?.trim() ?? null,
            revision: { increment: 1 },
          },
        });
        if (cas.count === 0) {
          const current = await tx.academicPlannerVersion.findUnique({ where: { id: versionId } });
          if (current?.status !== PlannerVersionStatus.SUBMITTED) {
            throw new ConflictException({ code: 'ALREADY_DECIDED', message: 'Already decided' });
          }
          throw new ConflictException({ code: 'PLANNER_VERSION_CONFLICT', message: 'Version conflict' });
        }

        const plannerStatus =
          action === 'reject' ? PlannerStatus.REJECTED : PlannerStatus.CHANGES_REQUESTED;
        await tx.academicPlanner.update({
          where: { id: plannerId },
          data: {
            status: plannerStatus,
            workingVersionId: action === 'reject' ? null : versionId,
            lockRevision: { increment: 1 },
          },
        });

        await tx.plannerApprovalEvent.create({
          data: {
            schoolId,
            plannerId,
            versionId,
            action: action === 'reject' ? PlannerApprovalAction.REJECTED : PlannerApprovalAction.CHANGES_REQUESTED,
            fromStatus: PlannerVersionStatus.SUBMITTED,
            toStatus: transition.to,
            actorUserId: actor.userId,
            comment: comment?.trim() ?? null,
          },
        });
      });

      void this.notifyCreator(
        schoolId,
        planner.createdById,
        planner.teacher.userId,
        action === 'reject' ? 'rejected' : 'changes_requested',
        plannerId,
      );
      this.audit.log({
        actorUserId: actor.userId,
        schoolId,
        action: action === 'reject' ? 'PLANNER_REJECTED' : 'PLANNER_CHANGES_REQUESTED',
        entityType: 'AcademicPlanner',
        entityId: plannerId,
        metadata: { versionId, comment },
      });
    }

    return this.planners.getVersionPayload(user, plannerId, versionId);
  }

  private async finalizeApproval(
    actor: Awaited<ReturnType<PlannerAccessService['resolveActor']>>,
    planner: {
      id: string;
      lockRevision: number;
      approvedVersionId: string | null;
      createdById: string;
      teacher: { userId: string };
    },
    version: { id: string; revision: number; basedOnVersionId: string | null; origin: PlannerVersionOrigin },
    versionId: string,
    expectedRevision: number,
    approvalAction: PlannerApprovalAction,
    comment?: string,
  ) {
    const schoolId = actor.schoolId;

    await this.prisma.$transaction(async (tx) => {
      const cas = await tx.academicPlannerVersion.updateMany({
        where: { id: versionId, status: PlannerVersionStatus.SUBMITTED, revision: expectedRevision },
        data: {
          status: PlannerVersionStatus.APPROVED,
          decidedById: actor.userId,
          decidedAt: new Date(),
          decisionComment: comment?.trim() ?? null,
          revision: { increment: 1 },
        },
      });
      if (cas.count === 0) {
        const current = await tx.academicPlannerVersion.findUnique({ where: { id: versionId } });
        if (current?.status !== PlannerVersionStatus.SUBMITTED) {
          throw new ConflictException({ code: 'ALREADY_DECIDED', message: 'Already decided' });
        }
        throw new ConflictException({ code: 'PLANNER_VERSION_CONFLICT', message: 'Version conflict' });
      }

      if (
        version.origin !== PlannerVersionOrigin.INITIAL &&
        version.basedOnVersionId &&
        planner.approvedVersionId &&
        version.basedOnVersionId !== planner.approvedVersionId
      ) {
        throw new ConflictException({ code: 'BASELINE_CHANGED', message: 'Baseline version changed' });
      }

      if (planner.approvedVersionId) {
        await tx.academicPlannerVersion.updateMany({
          where: { id: planner.approvedVersionId, status: PlannerVersionStatus.APPROVED },
          data: { status: PlannerVersionStatus.SUPERSEDED },
        });
      }

      const lock = await tx.academicPlanner.updateMany({
        where: { id: planner.id, lockRevision: planner.lockRevision },
        data: {
          approvedVersionId: versionId,
          workingVersionId: null,
          status: PlannerStatus.PUBLISHED,
          lockRevision: { increment: 1 },
        },
      });
      if (lock.count === 0) {
        throw new ConflictException({ code: 'PLANNER_VERSION_CONFLICT', message: 'Planner lock conflict' });
      }

      await tx.plannerApprovalEvent.create({
        data: {
          schoolId,
          plannerId: planner.id,
          versionId,
          action: approvalAction,
          fromStatus: PlannerVersionStatus.SUBMITTED,
          toStatus: PlannerVersionStatus.APPROVED,
          actorUserId: actor.userId,
          comment: comment?.trim() ?? null,
        },
      });
    });

    void this.notifyCreator(schoolId, planner.createdById, planner.teacher.userId, 'approved', planner.id);
    this.audit.log({
      actorUserId: actor.userId,
      schoolId,
      action: 'PLANNER_APPROVED',
      entityType: 'AcademicPlanner',
      entityId: planner.id,
      metadata: { versionId },
    });
  }

  private async loadPlannerVersion(schoolId: string, plannerId: string, versionId: string) {
    const planner = await this.prisma.academicPlanner.findFirst({
      where: { id: plannerId, schoolId },
      include: { teacher: { select: { userId: true } } },
    });
    if (!planner) {
      throw new NotFoundException({ code: 'PLANNER_NOT_FOUND', message: 'Planner not found' });
    }
    const version = await this.prisma.academicPlannerVersion.findFirst({
      where: { id: versionId, plannerId, schoolId },
    });
    if (!version) {
      throw new NotFoundException({ code: 'PLANNER_VERSION_NOT_FOUND', message: 'Version not found' });
    }
    return { planner, version };
  }

  private async notifyApprovers(schoolId: string, plannerId: string, recovery: boolean) {
    const userIds = await this.approverUserIds(schoolId);
    if (!userIds.length) return;
    await this.notifications.createForUsers(userIds, {
      schoolId,
      type: recovery ? NotificationType.SCHEDULE_CHANGE_SUBMITTED : NotificationType.PLANNER_SUBMITTED,
      title: recovery ? 'Schedule change submitted' : 'Planner submitted for approval',
      body: 'An academic planner is waiting for your review.',
      data: { plannerId },
      deepLink: `/school/planner/approvals`,
    });
  }

  private async notifyCreator(
    schoolId: string,
    createdById: string,
    teacherUserId: string,
    kind: 'approved' | 'rejected' | 'changes_requested',
    plannerId: string,
  ) {
    const userIds = [...new Set([createdById, teacherUserId].filter(Boolean))];
    const title =
      kind === 'approved'
        ? 'Planner approved'
        : kind === 'rejected'
          ? 'Planner rejected'
          : 'Changes requested on planner';
    await this.notifications.createForUsers(userIds, {
      schoolId,
      type: NotificationType.PLANNER_DECISION,
      title,
      body: title,
      data: { plannerId, kind },
      deepLink: `/teacher/planner/${plannerId}`,
    });
  }

  private async approverUserIds(schoolId: string): Promise<string[]> {
    const principals = await this.prisma.userRole.findMany({
      where: { schoolId, role: { name: RoleName.PRINCIPAL } },
      select: { userId: true },
    });
    if (principals.length) return principals.map((p) => p.userId);
    const admins = await this.prisma.userRole.findMany({
      where: { schoolId, role: { name: RoleName.SCHOOL_ADMIN } },
      select: { userId: true },
    });
    return admins.map((a) => a.userId);
  }
}
