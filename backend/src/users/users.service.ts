import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
        school: { select: { id: true, name: true, code: true } },
        teacherProfile: true,
        parentProfile: true,
      },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const { passwordHash: _passwordHash, ...safe } = user;
    return {
      ...safe,
      roles: user.roles.map((r) => r.role.name),
    };
  }

  async findAll(query: PaginationDto & { search?: string; schoolId?: string; status?: UserStatus }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput = {
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search } },
              { firstName: { contains: query.search } },
              { lastName: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          schoolId: true,
          lastLoginAt: true,
          createdAt: true,
          roles: { include: { role: true } },
          school: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(
      items.map((u) => ({
        ...u,
        roles: u.roles.map((r) => r.role.name),
      })),
      total,
      page,
      limit,
    );
  }
}
