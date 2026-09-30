import { RoleName, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { personFullName } from '../common/utils/person-name';

export async function listSchoolStaffForAttendance(prisma: PrismaService, schoolId: string) {
  return prisma.user.findMany({
    where: {
      schoolId,
      status: UserStatus.ACTIVE,
      teacherProfile: null,
      parentProfile: null,
      roles: {
        some: {
          role: { name: { in: [RoleName.PRINCIPAL, RoleName.SCHOOL_ADMIN] } },
        },
      },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
    },
  });
}

export function staffDisplayName(row: { firstName: string; lastName: string }) {
  return personFullName(row.firstName, row.lastName);
}
