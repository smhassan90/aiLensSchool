import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AcademicPlanner,
  AcademicPlannerVersion,
  ClassSubject,
  PlannerVersionOrigin,
  PlannerVersionStatus,
  Section,
} from '@prisma/client';
import { isVersionEditable } from './planner-status';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';

export type PlannerActor = {
  userId: string;
  schoolId: string;
  isTeacher: boolean;
  isPrincipalOrAdmin: boolean;
  isHeadTeacher: boolean;
  teacherProfileId: string | null;
};

@Injectable()
export class PlannerAccessService {
  constructor(
    private readonly tenant: TenantService,
    private readonly prisma: PrismaService,
  ) {}

  async resolveActor(user: AuthUser): Promise<PlannerActor> {
    const schoolId = this.tenant.requireSchoolId(user);
    const roles = user.roles ?? [];
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { userId: user.id, schoolId },
      select: { id: true, headTeacherAssignment: { select: { id: true } } },
    });
    return {
      userId: user.id,
      schoolId,
      isTeacher: roles.includes('TEACHER'),
      isPrincipalOrAdmin:
        roles.includes('PRINCIPAL') || roles.includes('SCHOOL_ADMIN') || roles.includes('SUPER_ADMIN'),
      isHeadTeacher: Boolean(teacher?.headTeacherAssignment),
      teacherProfileId: teacher?.id ?? null,
    };
  }

  assertCanCreate(
    actor: PlannerActor,
    section: Pick<Section, 'id'>,
    classSubject: Pick<ClassSubject, 'teacherId' | 'assistantTeacherId'>,
    teacherId: string,
  ) {
    if (actor.isPrincipalOrAdmin) return;
    if (actor.teacherProfileId && actor.teacherProfileId === teacherId) return;
    if (
      actor.teacherProfileId &&
      (classSubject.teacherId === actor.teacherProfileId ||
        classSubject.assistantTeacherId === actor.teacherProfileId)
    ) {
      return;
    }
    throw new ForbiddenException({
      code: 'PLANNER_FORBIDDEN',
      message: 'You cannot create a planner for this class and subject.',
    });
  }

  assertCanSubmit(actor: PlannerActor, planner: Pick<AcademicPlanner, 'createdById' | 'teacherId'>) {
    if (actor.isPrincipalOrAdmin) return;
    if (planner.createdById === actor.userId) return;
    if (actor.teacherProfileId && planner.teacherId === actor.teacherProfileId) return;
    throw new ForbiddenException({ code: 'PLANNER_FORBIDDEN', message: 'You cannot submit this planner' });
  }

  assertCanDecide(actor: PlannerActor) {
    if (!actor.isPrincipalOrAdmin) {
      throw new ForbiddenException({ code: 'PLANNER_FORBIDDEN', message: 'Only principals or admins can review planners' });
    }
  }

  assertCanPublishDirect(
    actor: PlannerActor,
    version: Pick<AcademicPlannerVersion, 'createdById' | 'status'>,
  ) {
    if (!actor.isPrincipalOrAdmin) {
      throw new ForbiddenException({ code: 'PLANNER_FORBIDDEN', message: 'Only principals or admins can publish directly' });
    }
    if (version.createdById !== actor.userId) {
      throw new ForbiddenException({ code: 'PLANNER_FORBIDDEN', message: 'You can only publish your own draft directly' });
    }
    if (version.status !== PlannerVersionStatus.DRAFT) {
      throw new ForbiddenException({ code: 'VERSION_NOT_EDITABLE', message: 'Only drafts can be published directly' });
    }
  }

  computePermissions(
    actor: PlannerActor,
    planner: Pick<AcademicPlanner, 'createdById' | 'teacherId' | 'approvedVersionId'>,
    version: Pick<
      AcademicPlannerVersion,
      'id' | 'status' | 'createdById' | 'submittedById' | 'summary' | 'origin'
    >,
  ) {
    const editable = isVersionEditable(version.status);
    const isOwner =
      actor.isPrincipalOrAdmin ||
      planner.createdById === actor.userId ||
      (actor.teacherProfileId != null && planner.teacherId === actor.teacherProfileId);

    return {
      canEdit: editable && isOwner,
      canSubmit: editable && isOwner && Boolean(version.summary),
      canWithdraw: version.status === PlannerVersionStatus.SUBMITTED && isOwner,
      canDecide:
        actor.isPrincipalOrAdmin &&
        version.status === PlannerVersionStatus.SUBMITTED &&
        version.submittedById !== actor.userId,
      canPublishDirectly:
        actor.isPrincipalOrAdmin &&
        version.status === PlannerVersionStatus.DRAFT &&
        version.createdById === actor.userId,
      canCreateRevision: Boolean(planner.approvedVersionId) && actor.isPrincipalOrAdmin,
      canRequestRecovery:
        Boolean(planner.approvedVersionId) &&
        isOwner &&
        version.status === PlannerVersionStatus.APPROVED &&
        planner.approvedVersionId === version.id,
      canRegenerateRecovery:
        version.origin === PlannerVersionOrigin.RECOVERY &&
        editable &&
        isOwner &&
        Boolean(version.summary),
      canRecord: Boolean(planner.approvedVersionId),
    };
  }
}
