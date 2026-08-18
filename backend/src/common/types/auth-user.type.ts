import { RoleName } from '@prisma/client';
import { StaffPermission } from '../permissions';

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  firstName: string;
  lastName: string;
  schoolId: string | null;
  mustChangePassword?: boolean;
  roles: RoleName[];
  permissions?: StaffPermission[];
}
