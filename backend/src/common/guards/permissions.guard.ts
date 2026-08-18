import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../types/auth-user.type';
import { hasStaffPermission, StaffPermission } from '../permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string; user?: AuthUser }>();
    if (request?.method === 'OPTIONS') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const needed = this.reflector.getAllAndOverride<StaffPermission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!needed?.length) return true;

    const user = request.user;
    if (!user) return false;
    const allowed = needed.some((perm) => hasStaffPermission(user.roles, user.permissions, perm));
    if (allowed) return true;
    throw new ForbiddenException({
      code: 'MISSING_PERMISSION',
      message: 'You do not have access to this action. Ask the school admin to enable it on your account.',
    });
  }
}
