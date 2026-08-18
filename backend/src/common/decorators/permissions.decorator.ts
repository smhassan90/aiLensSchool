import { SetMetadata } from '@nestjs/common';
import { StaffPermission } from '../permissions';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...permissions: StaffPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
