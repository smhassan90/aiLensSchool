import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';

@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
  ) {}

  async findAll(user: AuthUser, query: PaginationDto & { search?: string }) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ParentProfileWhereInput = {
      schoolId,
      ...(query.search
        ? {
            OR: [
              { user: { firstName: { contains: query.search } } },
              { user: { lastName: { contains: query.search } } },
              { user: { email: { contains: query.search } } },
              { user: { username: { contains: query.search } } },
              { user: { phone: { contains: query.search } } },
              { phone: { contains: query.search } },
              {
                students: {
                  some: {
                    student: {
                      OR: [
                        { firstName: { contains: query.search } },
                        { lastName: { contains: query.search } },
                        { studentCode: { contains: query.search } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.parentProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              firstName: true,
              lastName: true,
              phone: true,
              status: true,
            },
          },
          students: {
            include: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  studentCode: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.parentProfile.count({ where }),
    );

    return paginate(items, total, page, limit);
  }

  async getChildren(parentUserId: string) {
    const parent = await this.prisma.parentProfile.findUnique({
      where: { userId: parentUserId },
      include: {
        students: {
          include: {
            student: {
              include: {
                branch: true,
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { grade: true, section: true, academicYear: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_PROFILE_NOT_FOUND',
        message: 'Parent profile not found',
      });
    }
    return parent.students.map((sp) => ({
      relationship: sp.relationship,
      isPrimary: sp.isPrimary,
      student: sp.student,
    }));
  }

  async getParentChildren(parentProfileId: string, user: AuthUser) {
    const parent = await this.prisma.parentProfile.findUnique({
      where: { id: parentProfileId },
      include: {
        students: {
          include: {
            student: {
              include: {
                branch: true,
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { grade: true, section: true, academicYear: true },
                },
              },
            },
          },
        },
      },
    });
    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'Parent not found',
      });
    }
    this.tenant.assertSchoolAccess(user, parent.schoolId);
    return parent.students.map((sp) => ({
      relationship: sp.relationship,
      isPrimary: sp.isPrimary,
      student: sp.student,
    }));
  }

  async assertParentOwnsStudent(parentUserId: string, studentId: string) {
    const parent = await this.prisma.parentProfile.findUnique({
      where: { userId: parentUserId },
      include: { students: true },
    });
    if (!parent || !parent.students.some((sp) => sp.studentId === studentId)) {
      throw new ForbiddenException({
        code: 'CHILD_ACCESS_DENIED',
        message: 'Parent does not have access to this student',
      });
    }
    return parent;
  }

  async getActiveEnrollment(parentUserId: string, studentId: string) {
    await this.assertParentOwnsStudent(parentUserId, studentId);
    return this.prisma.studentEnrollment.findFirst({
      where: { studentId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assertParentChildInSection(parentUserId: string, studentId: string, sectionId: string) {
    const enrollment = await this.getActiveEnrollment(parentUserId, studentId);
    if (!enrollment || enrollment.sectionId !== sectionId) {
      throw new ForbiddenException({
        code: 'CHILD_ACCESS_DENIED',
        message: 'This item is not for the selected child',
      });
    }
    return enrollment;
  }
}
