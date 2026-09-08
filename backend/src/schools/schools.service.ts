import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  Prisma,
  RoleName,
  SchoolStatus,
  SubscriptionStatus,
  TeacherStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { examsForPattern, normalizeExamPapers } from '../academics/exam-patterns';
import { SetupSchoolDto } from './dto/setup-school.dto';
import { syncClassFeeStructures } from '../fees/class-fees';
import { teacherDisplayName } from '../common/utils/person-name';

@Injectable()
export class SchoolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
  ) {}

  async createSchoolWithAdmin(dto: CreateSchoolDto, actor: AuthUser) {
    const existing = await this.prisma.school.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException({
        code: 'SCHOOL_CODE_EXISTS',
        message: 'School code already exists',
      });
    }

    const adminEmail = dto.admin.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) {
      throw new ConflictException({
        code: 'ADMIN_EMAIL_EXISTS',
        message: 'Admin email already exists',
      });
    }

    const defaultPlan = await this.prisma.pricingPlan.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!defaultPlan) {
      throw new BadRequestException({
        code: 'NO_PRICING_PLAN',
        message: 'No active pricing plan configured. Seed the database first.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.admin.password, 12);
    const schoolAdminRole = await this.prisma.role.findUnique({
      where: { name: RoleName.SCHOOL_ADMIN },
    });
    if (!schoolAdminRole) {
      throw new BadRequestException({
        code: 'ROLE_MISSING',
        message: 'SCHOOL_ADMIN role not found. Seed roles first.',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: dto.name,
          code: dto.code.toUpperCase(),
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          country: dto.country,
          status: SchoolStatus.ACTIVE,
          pricingPlanId: defaultPlan.id,
        },
      });

      const branch = dto.branch
        ? await tx.branch.create({
            data: {
              schoolId: school.id,
              name: dto.branch.name,
              code: dto.branch.code.toUpperCase(),
              address: dto.branch.address,
              phone: dto.branch.phone,
            },
          })
        : null;

      await tx.schoolSettings.create({
        data: { schoolId: school.id },
      });

      await tx.schoolSubscription.create({
        data: {
          schoolId: school.id,
          pricingPlanId: defaultPlan.id,
          status: SubscriptionStatus.TRIAL,
          startsAt: new Date(),
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const admin = await tx.user.create({
        data: {
          email: adminEmail,
          username: adminEmail.split('@')[0],
          passwordHash,
          firstName: dto.admin.firstName,
          lastName: dto.admin.lastName,
          phone: dto.admin.phone,
          schoolId: school.id,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.userRole.create({
        data: {
          userId: admin.id,
          roleId: schoolAdminRole.id,
          schoolId: school.id,
        },
      });

      return { school, branch, admin: { id: admin.id, email: admin.email } };
    });

    await this.audit.log({
      actorUserId: actor.id,
      schoolId: result.school.id,
      action: 'SCHOOL_CREATED',
      entityType: 'School',
      entityId: result.school.id,
      metadata: { code: result.school.code },
    });

    return result;
  }

  async findAll(query: PaginationDto & { search?: string; status?: SchoolStatus }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SchoolWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { code: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.school.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { branches: true, students: true, teachers: true, parents: true } },
          subscription: true,
        },
      }),
      this.prisma.school.count({ where }),
    );

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: {
        branches: true,
        settings: true,
        subscription: { include: { pricingPlan: true } },
        _count: { select: { students: true, teachers: true, parents: true } },
      },
    });
    if (!school) {
      throw new NotFoundException({ code: 'SCHOOL_NOT_FOUND', message: 'School not found' });
    }
    this.tenant.assertSchoolAccess(user, school.id);
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto, user: AuthUser) {
    await this.findOne(id, user);
    const school = await this.prisma.school.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email?.toLowerCase(),
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        logo: dto.logo,
        status: dto.status,
      },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId: id,
      action: 'SCHOOL_UPDATED',
      entityType: 'School',
      entityId: id,
    });
    return school;
  }

  async setStatus(id: string, status: SchoolStatus, user: AuthUser) {
    const school = await this.prisma.school.update({
      where: { id },
      data: { status },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId: id,
      action: status === SchoolStatus.SUSPENDED ? 'SCHOOL_SUSPENDED' : 'SCHOOL_STATUS_CHANGED',
      entityType: 'School',
      entityId: id,
      metadata: { status },
    });
    return school;
  }

  async dashboardStats() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [
      totalSchools,
      activeSchools,
      inactiveSchools,
      totalBranches,
      totalStudents,
      totalTeachers,
      totalParents,
      overdueInvoices,
      aiAgg,
      notificationCount,
      monthlyRevenue,
    ] = await Promise.all([
      this.prisma.school.count(),
      this.prisma.school.count({ where: { status: SchoolStatus.ACTIVE } }),
      this.prisma.school.count({
        where: { status: { in: [SchoolStatus.INACTIVE, SchoolStatus.SUSPENDED] } },
      }),
      this.prisma.branch.count(),
      this.prisma.student.count({ where: { status: 'ACTIVE' } }),
      this.prisma.teacherProfile.count({ where: { status: 'ACTIVE' } }),
      this.prisma.parentProfile.count(),
      this.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
      this.prisma.aIRequest.aggregate({
        _count: true,
        _sum: { estimatedCost: true },
      }),
      this.prisma.notification.count({ where: { sentAt: { not: null } } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED', paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalSchools,
      activeSchools,
      inactiveSchools,
      totalBranches,
      totalStudents,
      totalTeachers,
      totalParents,
      monthlyRevenue: monthlyRevenue._sum.amount ?? 0,
      overdueInvoices,
      aiRequests: aiAgg._count,
      aiEstimatedCost: aiAgg._sum.estimatedCost ?? 0,
      notificationsSent: notificationCount,
    };
  }

  async runSetup(user: AuthUser, dto: SetupSchoolDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      include: { branches: { take: 1 } },
    });
    const branchId = school?.branches[0]?.id;
    if (!school || !branchId) {
      throw new BadRequestException({ code: 'NO_BRANCH', message: 'Create a branch first' });
    }

    const exams = dto.exams?.length
      ? normalizeExamPapers(dto.exams)
      : examsForPattern('ASSESSMENTS_MID_FINAL');
    if (!exams.length) {
      throw new BadRequestException({
        code: 'EXAMS_REQUIRED',
        message: 'Add at least one exam paper',
      });
    }

    const teacherRole = await this.prisma.role.findUnique({ where: { name: RoleName.TEACHER } });
    if (!teacherRole) {
      throw new BadRequestException({ code: 'ROLE_MISSING', message: 'TEACHER role missing' });
    }

    const existingTeacherCount = await this.prisma.teacherProfile.count({ where: { schoolId } });
    const schoolSlug = slugCode(school.code);
    const minQuizzes = dto.minQuizzes && dto.minQuizzes > 0 ? dto.minQuizzes : 4;

    const preparedTeachers = await Promise.all(
      dto.teachers.map(async (input, index) => {
        const firstName = input.firstName.trim();
        const lastName = (input.lastName ?? '').trim();
        const phone = input.phone.trim();
        const employeeCode = `T-${String(existingTeacherCount + index + 1).padStart(3, '0')}`;
        const password = teacherPassword(firstName, phone);
        const email = teacherEmail(schoolSlug, phone, employeeCode);
        return {
          key: input.key,
          firstName,
          lastName,
          gender: input.gender ?? null,
          phone,
          employeeCode,
          email,
          password,
          passwordHash: await bcrypt.hash(password, 12),
        };
      }),
    );

    const result = await this.prisma.$transaction(
      async (tx) => {
      const year = await tx.academicYear.upsert({
        where: { id: `setup-${schoolId}` },
        create: {
          id: `setup-${schoolId}`,
          schoolId,
          branchId,
          name: dto.yearName,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          isCurrent: true,
        },
        update: {
          name: dto.yearName,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          isCurrent: true,
        },
      });

      await tx.examConfig.deleteMany({ where: { academicYearId: year.id } });
      await tx.examConfig.createMany({
        data: exams.map((exam) => ({
          schoolId,
          academicYearId: year.id,
          name: exam.name,
          maxMarks: exam.maxMarks,
          sequence: exam.sequence,
          startDate: exam.startDate ? new Date(exam.startDate) : null,
          endDate: exam.endDate ? new Date(exam.endDate) : null,
        })),
      });

      const reusedKeys = new Set<string>();
      const teacherIds = new Map<string, string>();
      for (const teacher of preparedTeachers) {
        const existingUser =
          (await tx.user.findFirst({
            where: { schoolId, phone: teacher.phone, teacherProfile: { isNot: null } },
            include: { teacherProfile: true },
          })) ??
          (await tx.user.findUnique({
            where: { email: teacher.email },
            include: { teacherProfile: true },
          }));

        if (existingUser?.teacherProfile) {
          teacherIds.set(teacher.key, existingUser.teacherProfile.id);
          reusedKeys.add(teacher.key);
          continue;
        }

        const teacherUser = await tx.user.create({
          data: {
            email: teacher.email,
            username: teacher.email.split('@')[0],
            passwordHash: teacher.passwordHash,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            phone: teacher.phone,
            schoolId,
            status: UserStatus.ACTIVE,
            mustChangePassword: true,
          },
        });
        await tx.userRole.create({
          data: { userId: teacherUser.id, roleId: teacherRole.id, schoolId },
        });
        const profile = await tx.teacherProfile.create({
          data: {
            userId: teacherUser.id,
            schoolId,
            branchId,
            employeeCode: teacher.employeeCode,
            gender: teacher.gender,
            status: TeacherStatus.ACTIVE,
          },
        });
        teacherIds.set(teacher.key, profile.id);
      }

      const stageIds = new Map<string, string>();
      for (const [index, stageInput] of dto.stages.entries()) {
        const name = stageInput.name.trim();
        const coordinatorId = stageInput.coordinatorKey
          ? teacherIds.get(stageInput.coordinatorKey) ?? null
          : null;
        const stage = await tx.schoolStage.upsert({
          where: { schoolId_name: { schoolId, name } },
          create: {
            schoolId,
            name,
            sortOrder: index,
            coordinatorId,
          },
          update: { sortOrder: index, coordinatorId },
        });
        stageIds.set(stageInput.key, stage.id);
      }

      const usedSubjectCodes = new Set<string>();
      const existingCodes = await tx.subject.findMany({
        where: { schoolId },
        select: { code: true },
      });
      existingCodes.forEach((row) => usedSubjectCodes.add(row.code));

      for (const [classIndex, classInput] of dto.classes.entries()) {
        const stageId = stageIds.get(classInput.stageKey);
        if (!stageId) {
          throw new BadRequestException({
            code: 'STAGE_MISSING',
            message: `Class "${classInput.name}" is missing its school section`,
          });
        }
        const classTeacherId = classInput.classTeacherKey
          ? teacherIds.get(classInput.classTeacherKey) ?? null
          : null;
        const admissionFee =
          classInput.admissionFee && classInput.admissionFee > 0 ? classInput.admissionFee : null;
        const tuitionFee =
          classInput.tuitionFee && classInput.tuitionFee > 0 ? classInput.tuitionFee : null;

        const grade = await tx.grade.upsert({
          where: { schoolId_name: { schoolId, name: classInput.name.trim() } },
          create: {
            schoolId,
            stageId,
            name: classInput.name.trim(),
            level: classIndex + 1,
            admissionFee: admissionFee ?? undefined,
            tuitionFee: tuitionFee ?? undefined,
          },
          update: {
            stageId,
            level: classIndex + 1,
            admissionFee: admissionFee ?? undefined,
            tuitionFee: tuitionFee ?? undefined,
          },
        });

        const section = await tx.section.upsert({
          where: { branchId_gradeId_name: { branchId, gradeId: grade.id, name: 'A' } },
          create: {
            schoolId,
            branchId,
            gradeId: grade.id,
            name: 'A',
            classTeacherId,
          },
          update: { classTeacherId },
        });

        for (const subjectInput of classInput.subjects) {
          const subjectName = subjectInput.name.trim();
          const code = uniqueSubjectCode(subjectName, classIndex, usedSubjectCodes);
          usedSubjectCodes.add(code);
          const subject = await tx.subject.upsert({
            where: { schoolId_code: { schoolId, code } },
            create: { schoolId, gradeId: grade.id, name: subjectName, code },
            update: { name: subjectName, gradeId: grade.id },
          });

          const subjectTeacherId = subjectInput.teacherKey
            ? teacherIds.get(subjectInput.teacherKey) ?? null
            : null;

          await tx.classSubject.upsert({
            where: {
              sectionId_subjectId_academicYearId: {
                sectionId: section.id,
                subjectId: subject.id,
                academicYearId: year.id,
              },
            },
            create: {
              sectionId: section.id,
              subjectId: subject.id,
              academicYearId: year.id,
              branchId,
              teacherId: subjectTeacherId,
            },
            update: { teacherId: subjectTeacherId },
          });

          if (subjectTeacherId) {
            await tx.teacherSubject.upsert({
              where: {
                teacherId_subjectId_branchId_academicYearId: {
                  teacherId: subjectTeacherId,
                  subjectId: subject.id,
                  branchId,
                  academicYearId: year.id,
                },
              },
              create: {
                teacherId: subjectTeacherId,
                subjectId: subject.id,
                branchId,
                academicYearId: year.id,
              },
              update: {},
            });
          }

          await tx.quizTarget.upsert({
            where: { gradeId_subjectId: { gradeId: grade.id, subjectId: subject.id } },
            create: { schoolId, gradeId: grade.id, subjectId: subject.id, minQuizzes },
            update: { minQuizzes },
          });
        }

        await syncClassFeeStructures(tx, {
          schoolId,
          gradeId: grade.id,
          gradeName: grade.name,
          admissionFee,
          tuitionFee,
        });
      }

      await tx.schoolSettings.upsert({
        where: { schoolId },
        create: { schoolId, setupCompleted: true, examPattern: 'CUSTOM' },
        update: { setupCompleted: true, examPattern: 'CUSTOM' },
      });

      return { yearId: year.id, reusedKeys: [...reusedKeys] };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'SCHOOL_SETUP_COMPLETED',
      entityType: 'School',
      entityId: schoolId,
    });

    const reused = new Set(result.reusedKeys);
    return {
      ok: true,
      academicYearId: result.yearId,
      teachers: preparedTeachers.map((teacher) => ({
        name: teacherDisplayName(teacher.firstName, teacher.lastName, teacher.gender),
        phone: teacher.phone,
        email: teacher.email,
        temporaryPassword: reused.has(teacher.key) ? null : teacher.password,
        employeeCode: teacher.employeeCode,
        existingAccount: reused.has(teacher.key),
      })),
    };
  }
}

function slugCode(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);
  return slug || 'school';
}

function teacherEmail(schoolSlug: string, phone: string, employeeCode: string) {
  const digits = phone.replace(/\D/g, '');
  const local = digits ? `t${digits}` : employeeCode.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${local}@${schoolSlug}.school`;
}

function teacherPassword(firstName: string, phone: string) {
  const letters = firstName.replace(/[^A-Za-z]/g, '').slice(0, 4).padEnd(4, 'Teach');
  const digits = phone.replace(/\D/g, '').slice(-4).padStart(4, '1234');
  return `${letters[0].toUpperCase()}${letters.slice(1).toLowerCase()}${digits}!`;
}

function uniqueSubjectCode(name: string, classIndex: number, used: Set<string>) {
  const base = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'SUB';
  let code = `${base}${classIndex + 1}`.slice(0, 20);
  let n = 2;
  while (used.has(code)) {
    code = `${base}${classIndex + 1}${n}`.slice(0, 20);
    n += 1;
  }
  return code;
}

