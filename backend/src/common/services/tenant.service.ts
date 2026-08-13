import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthUser } from '../types/auth-user.type';

@Injectable()
export class TenantService {
  assertSchoolAccess(user: AuthUser, schoolId: string): void {
    if (user.roles.includes(RoleName.SUPER_ADMIN)) return;
    if (!user.schoolId || user.schoolId !== schoolId) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: 'Access denied for this school',
      });
    }
  }

  requireSchoolId(user: AuthUser): string {
    if (user.roles.includes(RoleName.SUPER_ADMIN) && !user.schoolId) {
      throw new ForbiddenException({
        code: 'SCHOOL_CONTEXT_REQUIRED',
        message: 'School context is required for this operation',
      });
    }
    if (!user.schoolId) {
      throw new ForbiddenException({
        code: 'TENANT_FORBIDDEN',
        message: 'No school associated with this user',
      });
    }
    return user.schoolId;
  }

  assertOwnedOrThrow<T extends { schoolId: string }>(
    user: AuthUser,
    entity: T | null,
    notFoundCode = 'RESOURCE_NOT_FOUND',
  ): T {
    if (!entity) {
      throw new NotFoundException({
        code: notFoundCode,
        message: 'Resource not found',
      });
    }
    this.assertSchoolAccess(user, entity.schoolId);
    return entity;
  }

  isSuperAdmin(user: AuthUser): boolean {
    return user.roles.includes(RoleName.SUPER_ADMIN);
  }

  isTeacher(user: AuthUser): boolean {
    return user.roles.includes(RoleName.TEACHER);
  }

  isParent(user: AuthUser): boolean {
    return user.roles.includes(RoleName.PARENT);
  }

  isSchoolAdmin(user: AuthUser): boolean {
    return user.roles.includes(RoleName.SCHOOL_ADMIN);
  }
}
