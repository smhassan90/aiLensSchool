import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName, TeacherStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateTeacherDto } from './dto/create-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
  ) {}

  async create(dto: CreateTeacherDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const email = dto.email.toLowerCase();

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, schoolId },
    });
    if (!branch) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'Email already registered',
      });
    }

    const existingCode = await this.prisma.teacherProfile.findUnique({
      where: { schoolId_employeeCode: { schoolId, employeeCode: dto.employeeCode } },
    });
    if (existingCode) {
      throw new ConflictException({
        code: 'EMPLOYEE_CODE_EXISTS',
        message: 'Employee code already exists',
      });
    }

    const teacherRole = await this.prisma.role.findUnique({ where: { name: RoleName.TEACHER } });
    if (!teacherRole) {
      throw new ConflictException({ code: 'ROLE_MISSING', message: 'TEACHER role missing' });
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const teacherUser = await tx.user.create({
        data: {
          email,
          username: email.split('@')[0],
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          schoolId,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.userRole.create({
        data: { userId: teacherUser.id, roleId: teacherRole.id, schoolId },
      });

      const profile = await tx.teacherProfile.create({
        data: {
          userId: teacherUser.id,
          schoolId,
          branchId: dto.branchId,
          employeeCode: dto.employeeCode,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          status: TeacherStatus.ACTIVE,
        },
      });

      if (dto.subjects?.length) {
        for (const s of dto.subjects) {
          await tx.teacherSubject.create({
            data: {
              teacherId: profile.id,
              subjectId: s.subjectId,
              branchId: dto.branchId,
              academicYearId: s.academicYearId,
            },
          });
        }
      }

      if (dto.classSubjects?.length) {
        for (const cs of dto.classSubjects) {
          await tx.classSubject.upsert({
            where: {
              sectionId_subjectId_academicYearId: {
                sectionId: cs.sectionId,
                subjectId: cs.subjectId,
                academicYearId: cs.academicYearId,
              },
            },
            create: {
              sectionId: cs.sectionId,
              subjectId: cs.subjectId,
              academicYearId: cs.academicYearId,
              branchId: dto.branchId,
              teacherId: profile.id,
            },
            update: { teacherId: profile.id },
          });
        }
      }

      return { user: teacherUser, profile };
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'TEACHER_CREATED',
      entityType: 'TeacherProfile',
      entityId: result.profile.id,
    });

    return {
      id: result.profile.id,
      userId: result.user.id,
      email: result.user.email,
      employeeCode: result.profile.employeeCode,
      branchId: result.profile.branchId,
    };
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & { search?: string; branchId?: string; status?: TeacherStatus },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.TeacherProfileWhereInput = {
      schoolId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { employeeCode: { contains: query.search } },
              { user: { firstName: { contains: query.search } } },
              { user: { lastName: { contains: query.search } } },
              { user: { email: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.teacherProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          employeeCode: true,
          status: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              status: true,
            },
          },
          branch: { select: { id: true, name: true } },
        },
      }),
      this.prisma.teacherProfile.count({ where }),
    );

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
          },
        },
        branch: true,
        teacherSubjects: { include: { subject: true, academicYear: true } },
        classSubjects: {
          include: { section: true, subject: true, academicYear: true },
        },
        assistantClassSubjects: {
          include: { section: true, subject: true, academicYear: true },
        },
      },
    });
    return this.tenant.assertOwnedOrThrow(user, teacher, 'TEACHER_NOT_FOUND');
  }

  async myClasses(user: AuthUser) {
    const classSelect = {
      sectionId: true,
      subjectId: true,
      academicYearId: true,
      branchId: true,
      section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
      subject: { select: { id: true, name: true } },
    } as const;
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: {
        classSubjects: { select: classSelect },
        assistantClassSubjects: { select: classSelect },
      },
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'TEACHER_PROFILE_NOT_FOUND',
        message: 'Teacher profile not found',
      });
    }
    return [
      ...profile.classSubjects.map((item) => ({ ...item, role: 'TEACHER' as const })),
      ...profile.assistantClassSubjects.map((item) => ({ ...item, role: 'ASSISTANT' as const })),
    ];
  }

  async getProfileByUserId(userId: string) {
    return this.prisma.teacherProfile.findUnique({ where: { userId } });
  }
}
