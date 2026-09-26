import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName, TeacherStatus, UserStatus, AttendanceStatus, LessonStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { MemoryCacheService } from '../common/services/memory-cache.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import {
  buildTeacherUsername,
  normalizeTeacherPhoneDigits,
  schoolPhonesMatch,
  teacherLocalEmail,
} from './teacher-accounts';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { FAST_AI_PROVIDER, AiProvider } from '../ai/providers/ai.provider';
import { hasStaffPermission } from '../common/permissions';
import { teacherDisplayName } from '../common/utils/person-name';
import { gradeClassLabel, gradeClassNumber } from '../common/utils/section-class-label';
import {
  PERFORMANCE_CRITERIA,
  clampScore,
  weekdaysSince,
  weightedTotal,
  type ScoreKey,
} from './teacher-score';
import {
  dateFromIso,
  earliestPunch,
  finalizeTeacherAbsences,
  hmToMinutes,
  loadTeacherAttendancePolicy,
  reconcileTeacherAttendanceStatusesForDay,
  normalizeHm,
  statusFromCheckIn,
  zonedDateIso,
  type TeacherAttendanceSource,
} from './teacher-checkin';
import { nextPrefixedSequentialIdentifier } from '../students/student-sequences';

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly cache: MemoryCacheService,
    @Inject(FAST_AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async create(dto: CreateTeacherDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, schoolId },
    });
    if (!branch) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
    }

    const teacherRole = await this.prisma.role.findUnique({ where: { name: RoleName.TEACHER } });
    if (!teacherRole) {
      throw new ConflictException({ code: 'ROLE_MISSING', message: 'TEACHER role missing' });
    }

    const phone = dto.phone.trim();
    if (normalizeTeacherPhoneDigits(phone).length < 7) {
      throw new BadRequestException({
        code: 'PHONE_INVALID',
        message: 'Enter a valid mobile number (at least 7 digits)',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const [school, existingCodes] = await Promise.all([
        tx.school.findUnique({ where: { id: schoolId }, select: { code: true } }),
        tx.teacherProfile.findMany({ where: { schoolId }, select: { employeeCode: true } }),
      ]);
      const employeeCode =
        dto.employeeCode?.trim() ||
        nextPrefixedSequentialIdentifier(
          school?.code ?? 'SCH',
          existingCodes.map((row) => row.employeeCode),
        );

      const existingCode = await tx.teacherProfile.findUnique({
        where: { schoolId_employeeCode: { schoolId, employeeCode } },
      });
      if (existingCode) {
        throw new ConflictException({
          code: 'EMPLOYEE_CODE_EXISTS',
          message: 'Employee code already exists',
        });
      }

      const usersWithPhone = await tx.user.findMany({
        where: { schoolId, phone: { not: null } },
        select: { phone: true },
      });
      if (usersWithPhone.some((row) => schoolPhonesMatch(row.phone, phone))) {
        throw new ConflictException({
          code: 'PHONE_EXISTS_IN_SCHOOL',
          message: 'This phone number is already used at your school',
        });
      }

      const schoolCode = school?.code ?? 'SCH';
      let username = buildTeacherUsername(schoolCode, phone);
      let attempt = 0;
      while (await tx.user.findUnique({ where: { username } })) {
        attempt += 1;
        username = buildTeacherUsername(schoolCode, phone, attempt);
      }
      const email = teacherLocalEmail(username, schoolCode);

      const teacherUser = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          firstName: dto.firstName,
          lastName: (dto.lastName ?? '').trim(),
          phone,
          schoolId,
          status: dto.status === TeacherStatus.ACTIVE || !dto.status ? UserStatus.ACTIVE : UserStatus.INACTIVE,
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
          employeeCode,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          gender: dto.gender ?? null,
          status: dto.status ?? TeacherStatus.ACTIVE,
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
      username: result.user.username,
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
              { user: { username: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.teacherProfile.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          select: {
            id: true,
            employeeCode: true,
            status: true,
            gender: true,
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
            branch: { select: { id: true, name: true } },
          },
        }),
      () => this.prisma.teacherProfile.count({ where }),
      page,
      limit,
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
            username: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
          },
        },
        branch: true,
        teacherSubjects: { include: { subject: true, academicYear: true } },
        classSubjects: {
          include: {
            section: { include: { grade: { select: { id: true, name: true, level: true } } } },
            subject: true,
            academicYear: true,
          },
        },
        assistantClassSubjects: {
          include: {
            section: { include: { grade: { select: { id: true, name: true, level: true } } } },
            subject: true,
            academicYear: true,
          },
        },
        classSections: { include: { grade: { select: { id: true, name: true, level: true } } } },
      },
    });
    const owned = this.tenant.assertOwnedOrThrow(user, teacher, 'TEACHER_NOT_FOUND');
    const gradeById = await this.gradeLookup(owned.schoolId, owned);
    return {
      ...owned,
      assignments: this.teacherAssignments(owned, gradeById),
    };
  }

  private async gradeLookup(
    schoolId: string,
    teacher: {
      classSections: Array<{ gradeId: string; grade?: { id: string; name: string; level: number } | null }>;
      classSubjects: Array<{ section?: { gradeId: string; grade?: { id: string; name: string; level: number } | null } | null }>;
      assistantClassSubjects: Array<{ section?: { gradeId: string; grade?: { id: string; name: string; level: number } | null } | null }>;
    },
  ) {
    const gradeIds = new Set<string>();
    for (const section of teacher.classSections) gradeIds.add(section.gradeId);
    for (const item of teacher.classSubjects) {
      if (item.section?.gradeId) gradeIds.add(item.section.gradeId);
    }
    for (const item of teacher.assistantClassSubjects) {
      if (item.section?.gradeId) gradeIds.add(item.section.gradeId);
    }
    const grades = await this.prisma.grade.findMany({
      where: { schoolId, id: { in: [...gradeIds] } },
      select: { id: true, name: true, level: true },
    });
    return new Map(grades.map((grade) => [grade.id, grade]));
  }

  private withGrade<T extends { gradeId: string; grade?: { name: string; level: number } | null }>(
    section: T,
    gradeById: Map<string, { id: string; name: string; level: number }>,
  ) {
    return {
      ...section,
      grade: section.grade ?? gradeById.get(section.gradeId) ?? null,
    };
  }

  private teacherAssignments(
    teacher: {
      classSections: Array<{ id: string; name: string; gradeId: string; grade?: { name: string; level: number } | null }>;
      classSubjects: Array<{
        id: string;
        subjectId: string;
        subject?: { name: string } | null;
        section?: { id: string; name: string; gradeId: string; grade?: { name: string; level: number } | null } | null;
      }>;
      assistantClassSubjects: Array<{
        id: string;
        subjectId: string;
        subject?: { name: string } | null;
        section?: { id: string; name: string; gradeId: string; grade?: { name: string; level: number } | null } | null;
      }>;
    },
    gradeById: Map<string, { id: string; name: string; level: number }>,
  ) {
    const mapAssignment = (
      id: string,
      section: { id: string; name: string; gradeId: string; grade?: { name: string; level: number } | null },
      subject: string | null,
      role: 'Class teacher' | 'Subject teacher' | 'Assistant',
      subjectId: string | null = null,
    ) => {
      const enriched = this.withGrade(section, gradeById);
      return {
        id,
        sectionId: section.id,
        subjectId,
        className: gradeClassLabel(enriched),
        classNumber: gradeClassNumber(enriched),
        sectionName: section.name?.trim() || null,
        subject,
        role,
      };
    };

    return [
      ...teacher.classSections.map((section) =>
        mapAssignment(`homeroom-${section.id}`, section, null, 'Class teacher'),
      ),
      ...teacher.classSubjects.flatMap((item) =>
        item.section
          ? [
              mapAssignment(
                item.id,
                item.section,
                item.subject?.name ?? null,
                'Subject teacher',
                item.subjectId,
              ),
            ]
          : [],
      ),
      ...teacher.assistantClassSubjects.flatMap((item) =>
        item.section
          ? [
              mapAssignment(
                `assistant-${item.id}`,
                item.section,
                item.subject?.name ?? null,
                'Assistant',
                item.subjectId,
              ),
            ]
          : [],
      ),
    ];
  }

  async update(id: string, dto: UpdateTeacherDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.findOne(id, user);

    if (dto.branchId && dto.branchId !== teacher.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, schoolId } });
      if (!branch) {
        throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
      }
    }

    if (dto.employeeCode && dto.employeeCode !== teacher.employeeCode) {
      const existingCode = await this.prisma.teacherProfile.findUnique({
        where: { schoolId_employeeCode: { schoolId, employeeCode: dto.employeeCode } },
      });
      if (existingCode && existingCode.id !== teacher.id) {
        throw new ConflictException({
          code: 'EMPLOYEE_CODE_EXISTS',
          message: 'Employee code already exists',
        });
      }
    }

    if (dto.email) {
      const email = dto.email.toLowerCase();
      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      if (existingUser && existingUser.id !== teacher.userId) {
        throw new ConflictException({ code: 'EMAIL_EXISTS', message: 'Email already registered' });
      }
    }

    const nextStatus = dto.status ?? teacher.status;
    await this.prisma.$transaction([
      this.prisma.teacherProfile.update({
        where: { id },
        data: {
          ...(dto.branchId ? { branchId: dto.branchId } : {}),
          ...(dto.employeeCode ? { employeeCode: dto.employeeCode } : {}),
          ...(dto.hireDate !== undefined ? { hireDate: dto.hireDate ? new Date(dto.hireDate) : null } : {}),
          ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
      }),
      this.prisma.user.update({
        where: { id: teacher.userId },
        data: {
          ...(dto.firstName ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: (dto.lastName ?? '').trim() } : {}),
          ...(dto.email ? { email: dto.email.toLowerCase() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
          status: nextStatus === TeacherStatus.ACTIVE ? UserStatus.ACTIVE : UserStatus.INACTIVE,
        },
      }),
    ]);

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'TEACHER_UPDATED',
      entityType: 'TeacherProfile',
      entityId: id,
    });

    return this.findOne(id, user);
  }

  async resetPassword(id: string, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id, schoolId },
      select: {
        id: true,
        userId: true,
        user: { select: { id: true, username: true, firstName: true, phone: true } },
      },
    });
    if (!teacher) {
      throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    }

    const temporaryPassword = buildTeacherTemporaryPassword(
      teacher.user.firstName,
      teacher.user.phone,
    );
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: teacher.userId },
        data: {
          passwordHash,
          mustChangePassword: true,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: teacher.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'TEACHER_PASSWORD_RESET',
      entityType: 'TeacherProfile',
      entityId: teacher.id,
    });

    return {
      teacherId: teacher.id,
      username: teacher.user.username,
      temporaryPassword,
      mustChangePassword: true,
    };
  }

  async myClasses(user: AuthUser) {
    return this.cache.getOrSet(`teacher:myClasses:${user.id}`, 30_000, () => this.loadMyClasses(user));
  }

  private async loadMyClasses(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const classSelect = {
      sectionId: true,
      subjectId: true,
      academicYearId: true,
      branchId: true,
      section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
      subject: { select: { id: true, name: true } },
    } as const;
    const [profile, year] = await Promise.all([
      this.prisma.teacherProfile.findUnique({
        where: { userId: user.id },
        select: {
          id: true,
          schoolId: true,
          classSubjects: { select: classSelect },
          assistantClassSubjects: { select: classSelect },
          classSections: {
            select: {
              id: true,
              name: true,
              branchId: true,
              grade: {
                select: {
                  id: true,
                  name: true,
                  subjects: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
                },
              },
              classSubjects: {
                select: {
                  subjectId: true,
                  academicYearId: true,
                  subject: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.academicYear.findFirst({
        where: { schoolId, isCurrent: true },
        orderBy: { startDate: 'desc' },
      }),
    ]);
    if (!profile) {
      throw new NotFoundException({
        code: 'TEACHER_PROFILE_NOT_FOUND',
        message: 'Teacher profile not found',
      });
    }
    const assigned = [
      ...profile.classSubjects.map((item) => ({
        ...item,
        role: 'TEACHER' as const,
        isClassTeacher: false as boolean,
      })),
      ...profile.assistantClassSubjects.map((item) => ({
        ...item,
        role: 'ASSISTANT' as const,
        isClassTeacher: false as boolean,
      })),
    ];
    const classTeacherSectionIds = new Set(profile.classSections.map((section) => section.id));
    for (const row of assigned) {
      row.isClassTeacher = classTeacherSectionIds.has(row.sectionId);
    }
    // If the teacher already teaches any subject in a section, do not invent extra
    // subjects for that section (class teacher of Class 1 who teaches Urdu should
    // not also see Arts / PT / Social Studies in My classes).
    const coveredSections = new Set(assigned.map((item) => item.sectionId));

    const uncovered = profile.classSections.filter((section) => !coveredSections.has(section.id));
    const homerooms = (
      await Promise.all(
        uncovered.map(async (section) => {
          const sectionMeta = {
            id: section.id,
            name: section.name,
            grade: { id: section.grade.id, name: section.grade.name },
          };

          const yearSubjects = section.classSubjects.filter(
            (row) => !year || row.academicYearId === year.id,
          );
          let subject =
            yearSubjects[0]?.subject ?? section.grade.subjects[0] ?? null;

          if (!subject && year) {
            const general = await this.ensureGeneralSubject(
              profile.schoolId,
              section.grade.id,
              section.grade.name,
            );
            await this.prisma.classSubject.upsert({
              where: {
                sectionId_subjectId_academicYearId: {
                  sectionId: section.id,
                  subjectId: general.id,
                  academicYearId: year.id,
                },
              },
              create: {
                sectionId: section.id,
                subjectId: general.id,
                teacherId: profile.id,
                academicYearId: year.id,
                branchId: section.branchId,
              },
              update: { teacherId: profile.id },
            });
            subject = general;
          }

          if (!subject) return null;

          return {
            sectionId: section.id,
            subjectId: subject.id,
            academicYearId: yearSubjects[0]?.academicYearId || year?.id || '',
            branchId: section.branchId,
            section: sectionMeta,
            subject: { id: subject.id, name: subject.name },
            role: 'CLASS_TEACHER' as const,
            isClassTeacher: true as const,
          };
        }),
      )
    ).filter((row): row is NonNullable<typeof row> => Boolean(row));

    return [...assigned, ...homerooms];
  }

  /** Default subject so class teachers can enter marks when the grade has none yet. */
  private async ensureGeneralSubject(schoolId: string, gradeId: string, gradeName: string) {
    const existing = await this.prisma.subject.findFirst({
      where: {
        schoolId,
        gradeId,
        OR: [{ name: 'General' }, { code: { startsWith: 'GEN-' } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;

    const slug = gradeName
      .replace(/[^a-zA-Z0-9]+/g, '')
      .slice(0, 12)
      .toUpperCase() || 'CLASS';
    let code = `GEN-${slug}`;
    const taken = await this.prisma.subject.findFirst({ where: { schoolId, code } });
    if (taken) code = `GEN-${slug}-${gradeId.slice(0, 6)}`;

    return this.prisma.subject.create({
      data: {
        schoolId,
        gradeId,
        name: 'General',
        code,
      },
    });
  }

  async getProfileByUserId(userId: string) {
    return this.prisma.teacherProfile.findUnique({ where: { userId } });
  }

  async requireTeacherProfile(user: AuthUser) {
    if (!this.tenant.isTeacher(user)) {
      throw new ForbiddenException({
        code: 'TEACHER_REQUIRED',
        message: 'Teacher access is required',
      });
    }
    const schoolId = this.tenant.requireSchoolId(user);
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        employeeCode: true,
        gender: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!profile) {
      throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher profile not found' });
    }
    return { schoolId, profile };
  }

  private async collectTeacherIdsForSections(sectionIds: string[]) {
    const ids = new Set<string>();
    if (!sectionIds.length) return ids;
    const [homeroom, subjects] = await Promise.all([
      this.prisma.section.findMany({
        where: { id: { in: sectionIds }, classTeacherId: { not: null } },
        select: { classTeacherId: true },
      }),
      this.prisma.classSubject.findMany({
        where: { sectionId: { in: sectionIds } },
        select: { teacherId: true, assistantTeacherId: true },
      }),
    ]);
    for (const row of homeroom) {
      if (row.classTeacherId) ids.add(row.classTeacherId);
    }
    for (const row of subjects) {
      if (row.teacherId) ids.add(row.teacherId);
      if (row.assistantTeacherId) ids.add(row.assistantTeacherId);
    }
    return ids;
  }

  async getTeacherSupervision(user: AuthUser) {
    const { schoolId, profile } = await this.requireTeacherProfile(user);
    const supervised = new Map<string, { id: string; name: string; employeeCode: string; roles: string[] }>();

    const headAssignment = await this.prisma.headTeacherAssignment.findFirst({
      where: { schoolId, teacherId: profile.id },
      select: { title: true, sections: { select: { sectionId: true } } },
    });
    if (headAssignment?.sections.length) {
      const sectionIds = headAssignment.sections.map((row) => row.sectionId);
      const teacherIds = await this.collectTeacherIdsForSections(sectionIds);
      const teachers = await this.prisma.teacherProfile.findMany({
        where: { id: { in: [...teacherIds].filter((id) => id !== profile.id) } },
        select: {
          id: true,
          employeeCode: true,
          gender: true,
          user: { select: { firstName: true, lastName: true } },
        },
      });
      const label = headAssignment.title?.trim() || 'Head teacher';
      for (const row of teachers) {
        const existing = supervised.get(row.id);
        const name = teacherDisplayName(row.user.firstName, row.user.lastName, row.gender);
        if (existing) {
          if (!existing.roles.includes(label)) existing.roles.push(label);
        } else {
          supervised.set(row.id, {
            id: row.id,
            name,
            employeeCode: row.employeeCode,
            roles: [label],
          });
        }
      }
    }

    const stages = await this.prisma.schoolStage.findMany({
      where: { schoolId, coordinatorId: profile.id },
      select: { id: true, name: true },
    });
    if (stages.length) {
      const grades = await this.prisma.grade.findMany({
        where: { schoolId, stageId: { in: stages.map((row) => row.id) } },
        select: { id: true },
      });
      const sections = await this.prisma.section.findMany({
        where: { schoolId, gradeId: { in: grades.map((row) => row.id) } },
        select: { id: true },
      });
      const teacherIds = await this.collectTeacherIdsForSections(sections.map((row) => row.id));
      const teachers = await this.prisma.teacherProfile.findMany({
        where: { id: { in: [...teacherIds].filter((id) => id !== profile.id) } },
        select: {
          id: true,
          employeeCode: true,
          gender: true,
          user: { select: { firstName: true, lastName: true } },
        },
      });
      for (const stage of stages) {
        const label = `Coordinator · ${stage.name}`;
        for (const row of teachers) {
          const existing = supervised.get(row.id);
          const name = teacherDisplayName(row.user.firstName, row.user.lastName, row.gender);
          if (existing) {
            if (!existing.roles.includes(label)) existing.roles.push(label);
          } else {
            supervised.set(row.id, {
              id: row.id,
              name,
              employeeCode: row.employeeCode,
              roles: [label],
            });
          }
        }
      }
    }

    const selfName = teacherDisplayName(
      profile.user.firstName,
      profile.user.lastName,
      profile.gender,
    );

    return {
      self: {
        id: profile.id,
        name: selfName,
        employeeCode: profile.employeeCode,
      },
      isHeadTeacher: Boolean(headAssignment?.sections.length),
      isStageCoordinator: stages.length > 0,
      supervisedTeachers: [...supervised.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  private assertStaffTeacherOverviewPermission(user: AuthUser) {
    if (!this.tenant.isSchoolStaff(user)) {
      throw new ForbiddenException({
        code: 'MISSING_PERMISSION',
        message: 'You do not have access to teacher overview',
      });
    }
    const allowed =
      hasStaffPermission(user.roles, user.permissions, 'VIEW_TEACHER_PROGRESS') ||
      hasStaffPermission(user.roles, user.permissions, 'MANAGE_TEACHERS');
    if (!allowed) {
      throw new ForbiddenException({
        code: 'MISSING_PERMISSION',
        message: 'You do not have access to teacher overview',
      });
    }
  }

  async assertTeacherPortalScope(user: AuthUser, teacherId: string) {
    if (!this.tenant.isTeacher(user) || this.tenant.isSchoolStaff(user)) return;
    const { profile } = await this.requireTeacherProfile(user);
    if (teacherId === profile.id) return;
    const supervision = await this.getTeacherSupervision(user);
    const allowed = supervision.supervisedTeachers.some((row) => row.id === teacherId);
    if (!allowed) {
      throw new ForbiddenException({
        code: 'TEACHER_OUT_OF_SCOPE',
        message: 'You can only view your own profile or teachers under your supervision',
      });
    }
  }

  async myOverview(user: AuthUser, month?: string) {
    const { profile } = await this.requireTeacherProfile(user);
    return this.overview(profile.id, user, month);
  }

  async listAttendanceHistoryForTeacher(
    user: AuthUser,
    query: {
      teacherId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { schoolId, profile } = await this.requireTeacherProfile(user);
    const targetId = query.teacherId ?? profile.id;
    if (targetId !== profile.id) {
      await this.assertTeacherPortalScope(user, targetId);
    }

    const policy = await loadTeacherAttendancePolicy(this.prisma, schoolId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.TeacherAttendanceWhereInput = {
      schoolId,
      teacherId: targetId,
    };
    if (query.startDate || query.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = dateFromIso(query.startDate);
      if (query.endDate) where.date.lte = dateFromIso(query.endDate);
    }

    const [rows, total] = await pageQuery(
      (skip, take) =>
        this.prisma.teacherAttendance.findMany({
          where,
          skip,
          take,
          orderBy: [{ date: 'desc' }],
          include: {
            teacher: {
              select: {
                id: true,
                employeeCode: true,
                gender: true,
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        }),
      () => this.prisma.teacherAttendance.count({ where }),
      page,
      limit,
    );

    const data = rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      teacher: {
        id: row.teacher.id,
        name: teacherDisplayName(
          row.teacher.user.firstName,
          row.teacher.user.lastName,
          row.teacher.gender,
        ),
        employeeCode: row.teacher.employeeCode,
      },
      checkInTime: row.checkedInAt?.toISOString() ?? null,
      checkOutTime: row.checkedOutAt?.toISOString() ?? null,
      status: row.checkedInAt
        ? statusFromCheckIn(
            row.checkedInAt,
            policy.lateAfter,
            policy.absentAfter,
            policy.timezone,
          )
        : row.status,
      source: row.source,
    }));

    return { data, timezone: policy.timezone, ...paginate(data, total, page, limit) };
  }

  async performance(id: string, user: AuthUser) {
    await this.assertTeacherPortalScope(user, id);
    const schoolId = this.tenant.requireSchoolId(user);
    const scored = await this.scoreOne(id, schoolId);
    if (!scored) throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    return scored;
  }

  async overview(teacherId: string, user: AuthUser, month?: string) {
    if (this.tenant.isTeacher(user) && !this.tenant.isSchoolStaff(user)) {
      await this.assertTeacherPortalScope(user, teacherId);
    } else {
      this.assertStaffTeacherOverviewPermission(user);
    }
    const schoolId = this.tenant.requireSchoolId(user);
    const detail = await this.findOne(teacherId, user);
    const performance = await this.performance(teacherId, user);
    const policy = await loadTeacherAttendancePolicy(this.prisma, schoolId);
    const monthIso = this.resolveMonthIso(month, policy.timezone);
    const { start, end } = this.monthBounds(monthIso);
    const marks = await this.prisma.teacherAttendance.findMany({
      where: { schoolId, teacherId, date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });

    const summary = { present: 0, late: 0, absent: 0, waiting: 0 };
    const days = marks.map((row) => {
      const status = row.checkedInAt
        ? statusFromCheckIn(row.checkedInAt, policy.lateAfter, policy.absentAfter, policy.timezone)
        : row.status;
      if (status === AttendanceStatus.PRESENT) summary.present += 1;
      else if (status === AttendanceStatus.LATE) summary.late += 1;
      else if (status === AttendanceStatus.ABSENT) summary.absent += 1;
      else summary.waiting += 1;
      return {
        date: row.date.toISOString().slice(0, 10),
        status,
        checkInTime: row.checkedInAt?.toISOString() ?? null,
        checkOutTime: row.checkedOutAt?.toISOString() ?? null,
        source: row.source,
      };
    });

    return {
      month: monthIso,
      timezone: policy.timezone,
      teacher: {
        id: detail.id,
        name: teacherDisplayName(detail.user.firstName, detail.user.lastName, detail.gender),
        username: detail.user.username ?? null,
        employeeCode: detail.employeeCode,
        status: detail.status,
        branchName: detail.branch?.name ?? null,
      },
      assignments: detail.assignments ?? [],
      performance,
      attendanceMonth: { summary, days },
    };
  }

  async classInsights(
    teacherId: string,
    user: AuthUser,
    sectionId: string,
    subjectId: string,
  ) {
    if (this.tenant.isTeacher(user) && !this.tenant.isSchoolStaff(user)) {
      await this.assertTeacherPortalScope(user, teacherId);
    } else {
      this.assertStaffTeacherOverviewPermission(user);
    }
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: teacherId, schoolId },
      select: { id: true, userId: true },
    });
    if (!teacher) {
      throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    }
    await this.assertTeacherTeachesClass(teacherId, sectionId, subjectId, user);

    const [section, subject, lessons, quizzes] = await Promise.all([
      this.prisma.section.findFirst({
        where: { id: sectionId, schoolId },
        include: { grade: { select: { name: true } } },
      }),
      this.prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { name: true } }),
      this.prisma.dailyLesson.findMany({
        where: {
          schoolId,
          teacherId,
          sectionId,
          subjectId,
          status: { not: LessonStatus.CANCELLED },
        },
        orderBy: { date: 'desc' },
        take: 40,
        select: {
          id: true,
          date: true,
          chapterName: true,
          topicName: true,
          status: true,
        },
      }),
      this.prisma.quiz.findMany({
        where: { schoolId, sectionId, subjectId, createdById: teacher.userId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          title: true,
          status: true,
          publishedAt: true,
          paperKind: true,
          results: { select: { percentage: true } },
          _count: { select: { attempts: true, assignments: true } },
        },
      }),
    ]);
    if (!section || !subject) {
      throw new NotFoundException({ code: 'CLASS_NOT_FOUND', message: 'Class or subject not found' });
    }

    return {
      className: `${section.grade.name} ${section.name}`,
      subjectName: subject.name,
      sectionId,
      subjectId,
      lessons: lessons.map((row) => ({
        id: row.id,
        date: row.date.toISOString().slice(0, 10),
        title: [row.chapterName, row.topicName].filter(Boolean).join(' · ') || 'Lesson',
        status: row.status,
      })),
      quizzes: quizzes.map((row) => {
        const percentages = row.results.map((r) => Number(r.percentage));
        const average =
          percentages.length > 0
            ? Number((percentages.reduce((a, b) => a + b, 0) / percentages.length).toFixed(1))
            : null;
        return {
          id: row.id,
          title: row.title,
          status: row.status,
          paperKind: row.paperKind,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          attempts: row._count.attempts,
          assigned: row._count.assignments,
          averageScore: average,
        };
      }),
    };
  }

  private resolveMonthIso(month: string | undefined, timeZone: string) {
    if (month && /^\d{4}-\d{2}$/.test(month)) return month;
    return zonedDateIso(new Date(), timeZone).slice(0, 7);
  }

  private monthBounds(monthIso: string) {
    const [year, mon] = monthIso.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 1));
    return { start, end };
  }

  private async assertTeacherTeachesClass(
    teacherId: string,
    sectionId: string,
    subjectId: string,
    user: AuthUser,
  ) {
    await this.findOne(teacherId, user);
    const [viaClassSubject, viaAssistant, viaHomeroom] = await Promise.all([
      this.prisma.classSubject.findFirst({
        where: { teacherId, sectionId, subjectId },
        select: { id: true },
      }),
      this.prisma.classSubject.findFirst({
        where: { sectionId, subjectId, assistantTeacherId: teacherId },
        select: { id: true },
      }),
      this.prisma.section.findFirst({
        where: { id: sectionId, classTeacherId: teacherId },
        select: { id: true },
      }),
    ]);
    if (!viaClassSubject && !viaAssistant && !viaHomeroom) {
      throw new ForbiddenException({
        code: 'TEACHER_NOT_ON_CLASS',
        message: 'This teacher is not assigned to that class and subject',
      });
    }
  }

  async scoreboard(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { schoolId, status: TeacherStatus.ACTIVE },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const rows = (
      await Promise.all(teachers.map((teacher) => this.scoreOne(teacher.id, schoolId)))
    ).filter((row): row is NonNullable<typeof row> => Boolean(row));
    rows.sort((a, b) => b.total - a.total);
    return {
      weights: PERFORMANCE_CRITERIA,
      teachers: rows.map((row, index) => ({ ...row, rank: index + 1 })),
    };
  }

  async updateTeacherAttendancePolicy(
    user: AuthUser,
    dto: { teacherLateAfter: string; teacherAbsentAfter: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const lateAfter = normalizeHm(dto.teacherLateAfter);
    const absentAfter = normalizeHm(dto.teacherAbsentAfter);
    if (!lateAfter || !absentAfter) {
      throw new BadRequestException({
        code: 'INVALID_CUTOFF',
        message: 'Cut-off times must be HH:mm',
      });
    }
    if (hmToMinutes(lateAfter) >= hmToMinutes(absentAfter)) {
      throw new BadRequestException({
        code: 'INVALID_CUTOFF',
        message: 'Absent after must be later than late after',
      });
    }
    await this.prisma.schoolSettings.upsert({
      where: { schoolId },
      create: { schoolId, teacherLateAfter: lateAfter, teacherAbsentAfter: absentAfter },
      update: { teacherLateAfter: lateAfter, teacherAbsentAfter: absentAfter },
    });
    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'TEACHER_ATTENDANCE_POLICY_UPDATED',
      entityType: 'SchoolSettings',
      metadata: { lateAfter, absentAfter },
    });
    const policy = await loadTeacherAttendancePolicy(this.prisma, schoolId);
    return policy;
  }

  async listTeacherAttendance(user: AuthUser, date?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const policy = await loadTeacherAttendancePolicy(this.prisma, schoolId);
    const dateIso = date || zonedDateIso(new Date(), policy.timezone);
    await finalizeTeacherAbsences(this.prisma, schoolId, dateIso);
    await reconcileTeacherAttendanceStatusesForDay(this.prisma, schoolId, dateIso);
    const day = dateFromIso(dateIso);
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { schoolId, status: TeacherStatus.ACTIVE },
      orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
      select: {
        id: true,
        employeeCode: true,
        gender: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const marks = await this.prisma.teacherAttendance.findMany({
      where: { schoolId, date: day },
      select: {
        teacherId: true,
        status: true,
        checkedInAt: true,
        checkedOutAt: true,
        source: true,
      },
    });
    const byTeacher = new Map(marks.map((row) => [row.teacherId, row]));
    const rows = teachers.map((teacher) => {
      const mark = byTeacher.get(teacher.id);
      return {
        teacherId: teacher.id,
        name: teacherDisplayName(teacher.user.firstName, teacher.user.lastName, teacher.gender),
        employeeCode: teacher.employeeCode,
        status: mark?.checkedInAt
          ? statusFromCheckIn(
              mark.checkedInAt,
              policy.lateAfter,
              policy.absentAfter,
              policy.timezone,
            )
          : (mark?.status ?? null),
        checkedInAt: mark?.checkedInAt?.toISOString() ?? null,
        checkedOutAt: mark?.checkedOutAt?.toISOString() ?? null,
        source: mark?.source ?? null,
      };
    });
    const summary = {
      present: rows.filter((row) => row.status === AttendanceStatus.PRESENT).length,
      late: rows.filter((row) => row.status === AttendanceStatus.LATE).length,
      absent: rows.filter((row) => row.status === AttendanceStatus.ABSENT).length,
      waiting: rows.filter((row) => row.status == null).length,
    };
    return { date: dateIso, policy, teachers: rows, summary };
  }

  async checkInTeacher(
    user: AuthUser,
    dto: { teacherId: string; checkedInAt?: string },
    source: TeacherAttendanceSource = 'ADMIN',
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.recordTeacherCheckIn({
      schoolId,
      teacherId: dto.teacherId,
      checkedInAt: dto.checkedInAt ? new Date(dto.checkedInAt) : new Date(),
      source,
      recordedById: user.id,
      actorUserId: user.id,
    });
  }

  async syncTeacherCheckIn(
    user: AuthUser,
    dto: { teacherId?: string; employeeCode?: string; checkedInAt: string; externalId?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.findTeacherForPunch(schoolId, dto.teacherId, dto.employeeCode);
    return this.recordTeacherCheckIn({
      schoolId,
      teacherId: teacher.id,
      checkedInAt: new Date(dto.checkedInAt),
      source: 'MACHINE',
      externalId: dto.externalId,
      recordedById: user.id,
      actorUserId: user.id,
    });
  }

  private async findTeacherForPunch(schoolId: string, teacherId?: string, employeeCode?: string) {
    if (!teacherId && !employeeCode) {
      throw new BadRequestException({
        code: 'TEACHER_REQUIRED',
        message: 'Provide teacherId or employeeCode',
      });
    }
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: {
        schoolId,
        status: TeacherStatus.ACTIVE,
        ...(teacherId ? { id: teacherId } : { employeeCode }),
      },
      select: { id: true },
    });
    if (!teacher) {
      throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    }
    return teacher;
  }

  private async recordTeacherCheckIn(input: {
    schoolId: string;
    teacherId: string;
    checkedInAt: Date;
    source: TeacherAttendanceSource;
    externalId?: string;
    recordedById?: string;
    actorUserId?: string;
  }) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: input.teacherId, schoolId: input.schoolId, status: TeacherStatus.ACTIVE },
      select: { id: true },
    });
    if (!teacher) {
      throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    }
    if (Number.isNaN(input.checkedInAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_CHECKIN',
        message: 'Check-in time is not valid',
      });
    }

    const policy = await loadTeacherAttendancePolicy(this.prisma, input.schoolId);
    const dateIso = zonedDateIso(input.checkedInAt, policy.timezone);
    const day = dateFromIso(dateIso);
    const existing = await this.prisma.teacherAttendance.findUnique({
      where: { teacherId_date: { teacherId: teacher.id, date: day } },
    });

    if (existing?.checkedInAt && existing.checkedInAt <= input.checkedInAt) {
      const status = statusFromCheckIn(
        existing.checkedInAt,
        policy.lateAfter,
        policy.absentAfter,
        policy.timezone,
      );
      if (existing.status !== status) {
        await this.prisma.teacherAttendance.update({
          where: { id: existing.id },
          data: { status },
        });
      }
      return {
        teacherId: teacher.id,
        date: dateIso,
        checkedInAt: existing.checkedInAt.toISOString(),
        status,
        source: existing.source,
        alreadyCheckedIn: true,
      };
    }

    const checkedInAt = earliestPunch(existing?.checkedInAt, input.checkedInAt);
    const status = statusFromCheckIn(checkedInAt, policy.lateAfter, policy.absentAfter, policy.timezone);
    const row = await this.prisma.teacherAttendance.upsert({
      where: { teacherId_date: { teacherId: teacher.id, date: day } },
      create: {
        schoolId: input.schoolId,
        teacherId: teacher.id,
        date: day,
        status,
        checkedInAt,
        source: input.source,
        externalId: input.externalId ?? null,
        recordedById: input.recordedById ?? null,
      },
      update: {
        status,
        checkedInAt,
        source: input.source,
        ...(input.externalId ? { externalId: input.externalId } : {}),
        ...(input.recordedById ? { recordedById: input.recordedById } : {}),
      },
    });
    await this.audit.log({
      actorUserId: input.actorUserId,
      schoolId: input.schoolId,
      action: 'TEACHER_CHECKED_IN',
      entityType: 'TeacherAttendance',
      entityId: row.id,
      metadata: { date: dateIso, status, source: input.source, alreadyCheckedIn: false },
    });
    return {
      teacherId: teacher.id,
      date: dateIso,
      checkedInAt: row.checkedInAt?.toISOString() ?? checkedInAt.toISOString(),
      status: row.status,
      source: row.source,
      alreadyCheckedIn: false,
    };
  }

  async coach(id: string, user: AuthUser) {
    const board = await this.scoreboard(user);
    const facts = board.teachers.find((row) => row.teacher.id === id);
    if (!facts) throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    const text = [
      `Teacher: ${facts.teacher.name}`,
      `Rank: ${facts.rank ?? 'n/a'} · Weighted score: ${facts.total}/100`,
      `Weights: ${PERFORMANCE_CRITERIA.map((c) => `${c.label} ${c.points}`).join(', ')}`,
      `Lessons last 14 school days: ${facts.metrics.lessons.done}/${facts.metrics.lessons.expected} (score ${facts.scores.lessons ?? 'n/a'})`,
      `Quizzes created: ${facts.metrics.quizzes.created} vs target ${facts.metrics.quizzes.target} (score ${facts.scores.quizzesCreated ?? 'n/a'})`,
      `Quiz completion in this teacher's subjects: ${facts.metrics.quizzes.completion ?? 'n/a'}%`,
      `Quiz marks ≥70% rate: ${facts.metrics.quizzes.goodMarks ?? 'n/a'}% · average ${facts.metrics.quizzes.average ?? 'n/a'}%`,
      `Annual/term results in this teacher's subjects: ${facts.metrics.annual.average ?? 'n/a'}% (${facts.metrics.annual.source})`,
      `Teacher attendance (check-ins): ${facts.metrics.teacherAttendance.present}/${facts.metrics.teacherAttendance.marked} days`,
      `Student attendance in this teacher's classes: ${facts.metrics.studentAttendance.rate ?? 'n/a'}% (discuss, do not blame)`,
      `Class teacher of: ${facts.classTeacherOf?.join(', ') || 'none'}`,
      ...facts.byClass.map(
        (row) =>
          `${row.className} ${row.subject}: lessons ${row.lessons}, quizzes ${row.quizzes}, ${row.attempts}/${row.enrolled} attempted, quiz avg ${row.quizAverage ?? 'n/a'}%, term avg ${row.termAverage ?? 'n/a'}%, student attendance ${row.studentAttendance ?? 'n/a'}%`,
      ),
    ].join('\n');
    const result = await this.ai.coach({ facts: text });
    const cards = result.data.cards ?? [];
    const coaching = {
      ...result.data,
      cards,
      strengths: result.data.strengths?.length
        ? result.data.strengths
        : cards.filter((card) => card.tone === 'good').map((card) => card.body),
      improvements: result.data.improvements?.length
        ? result.data.improvements
        : cards.filter((card) => card.tone !== 'good').map((card) => card.body),
      discussTonight: result.data.discussTonight?.length
        ? result.data.discussTonight
        : result.data.improvements?.length
          ? result.data.improvements
          : cards.filter((card) => card.tone !== 'good').map((card) => card.body),
    };
    return { performance: facts, coaching };
  }

  private async scoreOne(teacherId: string, schoolId: string) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: teacherId, schoolId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        classSubjects: {
          include: {
            section: { include: { grade: true } },
            subject: true,
          },
        },
        classSections: { include: { grade: true } },
      },
    });
    if (!teacher) return null;

    const since = new Date();
    since.setDate(since.getDate() - 14);
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const schoolDays = weekdaysSince(since);
    const classes = teacher.classSubjects;
    const sectionIds = [...new Set(classes.map((item) => item.sectionId))];
    const subjectIds = [...new Set(classes.map((item) => item.subjectId))];

    const [lessons, quizzes, enrollments, studentAttendance, teacherMarks, assessments, targets] = await Promise.all([
      this.prisma.dailyLesson.findMany({
        where: {
          teacherId: teacher.id,
          date: { gte: since },
          status: { not: LessonStatus.CANCELLED },
        },
        select: { sectionId: true, subjectId: true, date: true },
      }),
      classes.length
        ? this.prisma.quiz.findMany({
        where: {
          createdById: teacher.userId,
          OR: classes.map((cls) => ({ sectionId: cls.sectionId, subjectId: cls.subjectId })),
        },
        select: {
          id: true,
          sectionId: true,
          subjectId: true,
          _count: { select: { attempts: true, assignments: true, results: true } },
          results: { select: { percentage: true } },
        },
      })
        : Promise.resolve([]),
      sectionIds.length
        ? this.prisma.studentEnrollment.groupBy({
            by: ['sectionId'],
            where: { sectionId: { in: sectionIds }, status: 'ACTIVE' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      sectionIds.length
        ? this.prisma.attendance.findMany({
            where: { schoolId, sectionId: { in: sectionIds }, date: { gte: since } },
            select: { sectionId: true, status: true },
          })
        : Promise.resolve([]),
      this.prisma.teacherAttendance.findMany({
        where: { teacherId: teacher.id, date: { gte: since } },
        select: { status: true, date: true },
      }),
      subjectIds.length && sectionIds.length
        ? this.prisma.assessmentMark.findMany({
            where: {
              schoolId,
              subjectId: { in: subjectIds },
              sectionId: { in: sectionIds },
              assessedAt: { gte: yearAgo },
              type: { in: ['TERM_EXAM', 'PHYSICAL_TEST', 'CLASS_TEST'] },
            },
            select: { sectionId: true, subjectId: true, marks: true, maxMarks: true, type: true },
          })
        : Promise.resolve([]),
      this.prisma.quizTarget.findMany({ where: { schoolId } }),
    ]);

    const pairKey = (sectionId: string, subjectId: string) => `${sectionId}:${subjectId}`;
    const taughtPairs = new Set(classes.map((cls) => pairKey(cls.sectionId, cls.subjectId)));
    const scopedAssessments = assessments.filter((row) => taughtPairs.has(pairKey(row.sectionId, row.subjectId)));

    const enrolledBySection = new Map(enrollments.map((row) => [row.sectionId, row._count._all]));
    const expectedLessons = schoolDays.length * classes.length;
    const lessonScore =
      classes.length && expectedLessons
        ? clampScore((lessons.length / expectedLessons) * 100)
        : null;

    const target = targets.reduce((sum, row) => {
      const match = classes.some(
        (cls) => cls.section.grade.id === row.gradeId && cls.subjectId === row.subjectId,
      );
      return match ? sum + row.minQuizzes : sum;
    }, 0) || (classes.length ? Math.max(4, classes.length) : 0);
    const quizCreateScore =
      classes.length && target ? clampScore((quizzes.length / Math.max(target, 1)) * 100) : null;

    const enrolledTotal = classes.reduce((sum, cls) => sum + (enrolledBySection.get(cls.sectionId) ?? 0), 0);
    const attempts = quizzes.reduce((sum, quiz) => sum + quiz._count.attempts, 0);
    const assigned = quizzes.reduce((sum, quiz) => sum + quiz._count.assignments, 0);
    const completionBase = assigned || enrolledTotal;
    const completion =
      quizzes.length && completionBase ? Math.round((attempts / completionBase) * 100) : null;
    const allResults = quizzes.flatMap((quiz) => quiz.results);
    const quizAvg = allResults.length
      ? allResults.reduce((sum, row) => sum + Number(row.percentage), 0) / allResults.length
      : null;
    const goodMarks = allResults.length
      ? Math.round((allResults.filter((row) => Number(row.percentage) >= 70).length / allResults.length) * 100)
      : null;

    const termRows = scopedAssessments.filter((row) => row.type === 'TERM_EXAM');
    const resultRows = termRows.length ? termRows : scopedAssessments;
    const annualAvg = resultRows.length
      ? resultRows.reduce((sum, row) => sum + (Number(row.maxMarks) ? (Number(row.marks) / Number(row.maxMarks)) * 100 : 0), 0) /
        resultRows.length
      : quizAvg;
    const annualSource = termRows.length
      ? 'term exams'
      : scopedAssessments.length
        ? 'class tests'
        : quizAvg != null
          ? 'quiz scores (no term exams yet)'
          : 'none';

    const presentStudents = studentAttendance.filter((row) => row.status === AttendanceStatus.PRESENT).length;
    const studentAttRate = studentAttendance.length
      ? Math.round((presentStudents / studentAttendance.length) * 100)
      : null;

    const teacherPresent = teacherMarks.filter(
      (row) => row.status === AttendanceStatus.PRESENT || row.status === AttendanceStatus.LATE,
    ).length;
    const teacherAttScore = teacherMarks.length ? clampScore((teacherPresent / teacherMarks.length) * 100) : null;

    const scores: Record<ScoreKey, number | null> = {
      annualResults: annualAvg != null ? clampScore(annualAvg) : null,
      lessons: lessonScore,
      quizzesCreated: quizCreateScore,
      teacherAttendance: teacherAttScore,
      quizCompletion: completion,
      quizMarks: goodMarks ?? (quizAvg != null ? clampScore(quizAvg) : null),
      studentAttendance: studentAttRate,
    };
    const total = weightedTotal(scores);

    const byClass = classes.map((cls) => {
      const classLessons = lessons.filter((row) => row.sectionId === cls.sectionId && row.subjectId === cls.subjectId);
      const classQuizzes = quizzes.filter((row) => row.sectionId === cls.sectionId && row.subjectId === cls.subjectId);
      const classResults = classQuizzes.flatMap((quiz) => quiz.results);
      const classAvg = classResults.length
        ? Number((classResults.reduce((sum, row) => sum + Number(row.percentage), 0) / classResults.length).toFixed(1))
        : null;
      const classAttempts = classQuizzes.reduce((sum, quiz) => sum + quiz._count.attempts, 0);
      const enrolled = enrolledBySection.get(cls.sectionId) ?? 0;
      const classAssess = resultRows.filter((row) => row.sectionId === cls.sectionId && row.subjectId === cls.subjectId);
      const termAverage = classAssess.length
        ? Number(
            (
              classAssess.reduce(
                (sum, row) => sum + (Number(row.maxMarks) ? (Number(row.marks) / Number(row.maxMarks)) * 100 : 0),
                0,
              ) / classAssess.length
            ).toFixed(1),
          )
        : null;
      const sectionAtt = studentAttendance.filter((row) => row.sectionId === cls.sectionId);
      const sectionPresent = sectionAtt.filter((row) => row.status === AttendanceStatus.PRESENT).length;
      return {
        className: `${cls.section.grade.name} ${cls.section.name}`,
        subject: cls.subject.name,
        sectionId: cls.sectionId,
        subjectId: cls.subjectId,
        lessons: classLessons.length,
        quizzes: classQuizzes.length,
        attempts: classAttempts,
        enrolled,
        quizAverage: classAvg,
        termAverage,
        studentAttendance: sectionAtt.length ? Math.round((sectionPresent / sectionAtt.length) * 100) : null,
      };
    });

    return {
      teacher: {
        id: teacher.id,
        name: teacherDisplayName(teacher.user.firstName, teacher.user.lastName, teacher.gender),
      },
      total,
      rank: undefined as number | undefined,
      scores,
      metrics: {
        lessons: { done: lessons.length, expected: expectedLessons },
        quizzes: {
          created: quizzes.length,
          target,
          completion,
          goodMarks,
          average: quizAvg != null ? Number(quizAvg.toFixed(1)) : null,
        },
        annual: { average: annualAvg != null ? Number(annualAvg.toFixed(1)) : null, source: annualSource },
        teacherAttendance: { present: teacherPresent, marked: teacherMarks.length },
        studentAttendance: { rate: studentAttRate, records: studentAttendance.length },
      },
      byClass,
      last30Days: {
        lessonsAdded: lessons.length,
        attendanceDaysMarked: teacherMarks.length,
      },
      classTeacherOf: teacher.classSections.map((section) => `${section.grade.name} ${section.name}`),
    };
  }
}

/** Same pattern as school setup: First4Letters + last4phone + ! */
function buildTeacherTemporaryPassword(firstName: string, phone: string | null | undefined) {
  const letters = firstName.replace(/[^A-Za-z]/g, '').slice(0, 4).padEnd(4, 'Teach');
  const digits = (phone ?? '').replace(/\D/g, '').slice(-4).padStart(4, '1234');
  return `${letters[0].toUpperCase()}${letters.slice(1).toLowerCase()}${digits}!`;
}
