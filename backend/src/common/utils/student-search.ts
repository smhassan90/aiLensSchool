import { Prisma } from '@prisma/client';

/** Each word must match somewhere on the student (or a parent). "Abdul H" finds Abdul Hadi. */
export function studentSearchWhere(search?: string): Prisma.StudentWhereInput | undefined {
  const tokens = (search ?? '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return undefined;

  return {
    AND: tokens.map((token) => ({
      OR: [
        { firstName: { contains: token } },
        { lastName: { contains: token } },
        { studentCode: { contains: token } },
        { admissionNumber: { contains: token } },
        {
          parents: {
            some: {
              parent: {
                OR: [
                  { phone: { contains: token } },
                  { user: { firstName: { contains: token } } },
                  { user: { lastName: { contains: token } } },
                  { user: { email: { contains: token } } },
                  { user: { username: { contains: token } } },
                  { user: { phone: { contains: token } } },
                ],
              },
            },
          },
        },
      ],
    })),
  };
}
