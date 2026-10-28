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
import { resolveHeadTeacherSectionIds } from '../head-teachers/head-teacher-sections';

export type PlannerActor = {
  userId: string;
  schoolId: string;
  isTeacher: boolean;
  isPrincipalOrAdmin: boolean;
  isHeadTeacher: boolean;
  teacherProfileId: string | null;
  headSectionIds: string[];
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
    const [teacher, headSectionIds] = await Promise.all([
      this.prisma.teacherProfile.findFirst({
        where: { userId: user.id, schoolId },
        select: { id: true },
      }),
      resolveHeadTeacherSectionIds(this.prisma, schoolId, user.id),
    ]);
    return {
      userId: user.id,
      schoolId,
      isTeacher: roles.includes('TEACHER'),
      isPrincipalOrAdmin:
        roles.includes('PRINCIPAL') || roles.includes('SCHOOL_ADMIN') || roles.includes('SUPER_ADMIN'),
      isHeadTeacher: headSectionIds.length > 0,
      teacherProfileId: teacher?.id ?? null,
      headSectionIds,
    };
  }

  assertCanCreate(
    actor: PlannerActor,
    section: Pick<Section, 'id'>,
    classSubject: Pick<ClassSubject, 'teacherId' | 'assistantTeacherId'>,
    plannerTeacherId: string,
    classTeacherId: string | null,
  ) {
    if (actor.isPrincipalOrAdmin) return;

    const allowedPlannerTeacherIds = [
      classSubject.teacherId,
      classSubject.assistantTeacherId,
      classTeacherId,
    ].filter((id): id is string => Boolean(id));

    if (actor.headSectionIds.includes(section.id)) {
      if (!allowedPlannerTeacherIds.includes(plannerTeacherId)) {
        throw new ForbiddenException({
          code: 'PLANNER_FORBIDDEN',
          message: 'Choose the subject teacher, assistant, or class teacher for this planner.',
        });
      }
      return;
    }

    const isSubjectTeacher =
      actor.teacherProfileId != null &&
      (classSubject.teacherId === actor.teacherProfileId ||
        classSubject.assistantTeacherId === actor.teacherProfileId);

    if (isSubjectTeacher) {
      if (plannerTeacherId !== actor.teacherProfileId) {
        throw new ForbiddenException({
          code: 'PLANNER_FORBIDDEN',
          message: 'You can only create a planner assigned to yourself for this subject.',
        });
      }
      return;
    }

    if (
      actor.teacherProfileId != null &&
      classTeacherId === actor.teacherProfileId &&
      plannerTeacherId === actor.teacherProfileId
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

  assertCanArchive(actor: PlannerActor, planner: Pick<AcademicPlanner, 'createdById' | 'teacherId' | 'archivedAt'>) {
    if (planner.archivedAt) {
      throw new ForbiddenException({ code: 'PLANNER_ALREADY_ARCHIVED', message: 'This planner is already archived.' });
    }
    if (actor.isPrincipalOrAdmin) return;
    if (planner.createdById === actor.userId) return;
    if (actor.teacherProfileId && planner.teacherId === actor.teacherProfileId) return;
    throw new ForbiddenException({ code: 'PLANNER_FORBIDDEN', message: 'You cannot delete this planner.' });
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
