import { RoleName } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  firstName: string;
  lastName: string;
  schoolId: string | null;
  mustChangePassword?: boolean;
  roles: RoleName[];
}
