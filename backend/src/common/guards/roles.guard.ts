import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../types/auth-user.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string; user?: AuthUser }>();
    if (request?.method === 'OPTIONS') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const user = request.user;
    if (!user?.roles?.length) return false;
    if (requiredRoles.some((role) => user.roles.includes(role))) return true;
    // Principal uses the school portal. Writes still need @RequirePermission.
    if (requiredRoles.includes(RoleName.SCHOOL_ADMIN) && user.roles.includes(RoleName.PRINCIPAL)) {
      return true;
    }
    return false;
  }
}
