import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  EnrollmentStatus,
  ParentRelationship,
  Prisma,
  RoleName,
  StudentStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateParentInlineDto, CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { FilesService } from '../files/files.service';
import {
  buildParentUsername,
  generateParentPassword,
  parentLocalEmail,
} from './parent-accounts';
import { personFullName, sanitizeLastName } from '../common/utils/person-name';
import { studentSearchWhere } from '../common/utils/student-search';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly files: FilesService,
  ) {}

  async create(dto: CreateStudentDto, user: AuthUser) {
    if (!dto.father?.firstName && !dto.mother?.firstName) {
      throw new BadRequestException({
        code: 'PARENT_REQUIRED',
        message: 'Add mother and/or father details. Parent app logins are created with the student.',
      });
    }

    const schoolId = this.tenant.requireSchoolId(user);

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, schoolId },
    });
    if (!branch) {
      throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
    }

    const [grade, section, academicYear] = await Promise.all([
      this.prisma.grade.findFirst({ where: { id: dto.gradeId, schoolId } }),
      this.prisma.section.findFirst({
        where: { id: dto.sectionId, schoolId, branchId: dto.branchId, gradeId: dto.gradeId },
      }),
      this.prisma.academicYear.findFirst({
        where: { id: dto.academicYearId, schoolId },
      }),
    ]);

    if (!grade || !section || !academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_CONTEXT_INVALID',
        message: 'Grade, section, or academic year not found for this school',
      });
    }

    const parentRole = await this.prisma.role.findUnique({ where: { name: RoleName.PARENT } });
    if (!parentRole) {
      throw new ConflictException({ code: 'ROLE_MISSING', message: 'PARENT role missing' });
    }

    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      throw new NotFoundException({ code: 'SCHOOL_NOT_FOUND', message: 'School not found' });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const student = await tx.student.create({
        data: {
          schoolId,
          branchId: dto.branchId,
          studentCode: dto.studentCode,
          admissionNumber: dto.admissionNumber,
          firstName: dto.firstName.trim(),
          lastName: sanitizeLastName(dto.lastName),
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          gender: dto.gender,
          address: dto.address?.trim() || null,
          scienceGroup: dto.scienceGroup?.trim() || null,
          status: StudentStatus.ACTIVE,
        },
      });

      await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicYearId: academicYear.id,
          gradeId: grade.id,
          sectionId: section.id,
          enrollmentDate: new Date(),
          status: EnrollmentStatus.ACTIVE,
        },
      });

      const credentials: Array<{
        relationship: ParentRelationship;
        name: string;
        username: string;
        password: string | null;
        existing: boolean;
      }> = [];

      if (dto.father?.firstName) {
        credentials.push(
          await this.upsertParentAccount(tx, {
            schoolId,
            schoolCode: school.code,
            studentId: student.id,
            studentCode: dto.studentCode,
            studentLastName: sanitizeLastName(dto.lastName),
            parentRoleId: parentRole.id,
            relationship: ParentRelationship.FATHER,
            input: dto.father,
          }),
        );
      }
      if (dto.mother?.firstName) {
        credentials.push(
          await this.upsertParentAccount(tx, {
            schoolId,
            schoolCode: school.code,
            studentId: student.id,
            studentCode: dto.studentCode,
            studentLastName: sanitizeLastName(dto.lastName),
            parentRoleId: parentRole.id,
            relationship: ParentRelationship.MOTHER,
            input: dto.mother,
          }),
        );
      }

      return { student, credentials };
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'STUDENT_CREATED',
      entityType: 'Student',
      entityId: result.student.id,
      metadata: { parentsCreated: result.credentials.map((item) => item.relationship) },
    });

    return result;
  }

  private async upsertParentAccount(
    tx: Prisma.TransactionClient,
    args: {
      schoolId: string;
      schoolCode: string;
      studentId: string;
      studentCode: string;
      studentLastName: string;
      parentRoleId: string;
      relationship: ParentRelationship;
      input: CreateParentInlineDto;
    },
  ) {
    const lastName = sanitizeLastName(args.input.lastName) || args.studentLastName;
    const email = args.input.email?.trim().toLowerCase();
    const phone = args.input.phone?.trim();

    let existing = email
      ? await tx.user.findUnique({
          where: { email },
          include: { parentProfile: true, roles: { include: { role: true } } },
        })
      : null;

    if (!existing && phone) {
      existing = await tx.user.findFirst({
        where: { schoolId: args.schoolId, phone, parentProfile: { isNot: null } },
        include: { parentProfile: true, roles: { include: { role: true } } },
      });
    }

    if (existing) {
      if (existing.schoolId && existing.schoolId !== args.schoolId) {
        throw new ConflictException({
          code: 'PARENT_OTHER_SCHOOL',
          message: 'This parent already belongs to another school',
        });
      }
      const parentProfile =
        existing.parentProfile ??
        (await tx.parentProfile.create({
          data: { userId: existing.id, schoolId: args.schoolId, phone: phone ?? existing.phone },
        }));
      const hasParentRole = existing.roles.some((r) => r.role.name === RoleName.PARENT);
      if (!hasParentRole) {
        await tx.userRole.create({
          data: { userId: existing.id, roleId: args.parentRoleId, schoolId: args.schoolId },
        });
      }
      await tx.studentParent.upsert({
        where: { studentId_parentId: { studentId: args.studentId, parentId: parentProfile.id } },
        create: {
          studentId: args.studentId,
          parentId: parentProfile.id,
          relationship: args.relationship,
          isPrimary: args.relationship === ParentRelationship.FATHER,
        },
        update: { relationship: args.relationship },
      });
      return {
        relationship: args.relationship,
        name: personFullName(existing.firstName, existing.lastName),
        username: existing.username ?? existing.email,
        password: null as string | null,
        existing: true,
      };
    }

    let username = buildParentUsername(args.schoolCode, phone);
    let attempt = 0;
    while (await tx.user.findUnique({ where: { username } })) {
      attempt += 1;
      username = buildParentUsername(args.schoolCode, phone, attempt);
    }

    const password = generateParentPassword();
    const parentUser = await tx.user.create({
      data: {
        email: email ?? parentLocalEmail(username, args.schoolCode),
        username,
        passwordHash: await bcrypt.hash(password, 12),
        firstName: args.input.firstName.trim(),
        lastName,
        phone,
        schoolId: args.schoolId,
        status: UserStatus.ACTIVE,
        mustChangePassword: true,
      },
    });
    await tx.userRole.create({
      data: { userId: parentUser.id, roleId: args.parentRoleId, schoolId: args.schoolId },
    });
    const parentProfile = await tx.parentProfile.create({
      data: { userId: parentUser.id, schoolId: args.schoolId, phone },
    });
    await tx.studentParent.create({
      data: {
        studentId: args.studentId,
        parentId: parentProfile.id,
        relationship: args.relationship,
        isPrimary: args.relationship === ParentRelationship.FATHER,
      },
    });

    return {
      relationship: args.relationship,
      name: personFullName(parentUser.firstName, parentUser.lastName),
      username,
      password,
      existing: false,
    };
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & {
      search?: string;
      branchId?: string;
      status?: StudentStatus;
      sectionId?: string;
      gradeId?: string;
      teacherId?: string;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let teacherSectionIds: string[] | undefined;
    if (query.teacherId) {
      const teacher = await this.prisma.teacherProfile.findFirst({
        where: { id: query.teacherId, schoolId },
        select: { id: true },
      });
      if (!teacher) {
        return paginate([], 0, page, limit);
      }
      const [assignments, homerooms] = await Promise.all([
        this.prisma.classSubject.findMany({
          where: {
            OR: [{ teacherId: teacher.id }, { assistantTeacherId: teacher.id }],
            section: { schoolId },
          },
          select: { sectionId: true },
        }),
        this.prisma.section.findMany({
          where: { schoolId, classTeacherId: teacher.id },
          select: { id: true },
        }),
      ]);
      teacherSectionIds = [
        ...new Set([
          ...assignments.map((row) => row.sectionId),
          ...homerooms.map((row) => row.id),
        ]),
      ];
      if (!teacherSectionIds.length) {
        return paginate([], 0, page, limit);
      }
      if (query.sectionId && !teacherSectionIds.includes(query.sectionId)) {
        return paginate([], 0, page, limit);
      }
    }

    const sectionFilter = query.sectionId
      ? query.sectionId
      : teacherSectionIds
        ? { in: teacherSectionIds }
        : undefined;

    const needsEnrollmentFilter = Boolean(sectionFilter || query.gradeId);

    const search = query.search?.trim();
    const fullNameIds = search
      ? (
          await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM students
            WHERE school_id = ${schoolId}
              AND LOWER(CONCAT(TRIM(first_name), ' ', TRIM(REPLACE(IFNULL(last_name, ''), '-', ''))))
                LIKE ${`%${search.toLowerCase().replace(/[%_]/g, '\\$&')}%`}
            LIMIT 300
          `
        ).map((row) => row.id)
      : [];
    const tokenWhere = studentSearchWhere(search);

    const where: Prisma.StudentWhereInput = {
      schoolId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(needsEnrollmentFilter
        ? {
            enrollments: {
              some: {
                status: EnrollmentStatus.ACTIVE,
                ...(sectionFilter ? { sectionId: sectionFilter } : {}),
                ...(query.gradeId ? { gradeId: query.gradeId } : {}),
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              ...(fullNameIds.length ? [{ id: { in: fullNameIds } }] : []),
              ...(tokenWhere ? [tokenWhere] : []),
            ],
          }
        : {}),
    };

    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.student.findMany({
          where,
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          skip,
          take,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            studentCode: true,
            admissionNumber: true,
            status: true,
            photoUrl: true,
            address: true,
            scienceGroup: true,
            createdAt: true,
            branch: { select: { id: true, name: true } },
            enrollments: {
              where: { status: EnrollmentStatus.ACTIVE },
              take: 1,
              select: {
                grade: { select: { id: true, name: true } },
                section: {
                  select: {
                    id: true,
                    name: true,
                    classTeacher: {
                      select: {
                        id: true,
                        gender: true,
                        user: { select: { firstName: true, lastName: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      () => this.prisma.student.count({ where }),
      page,
      limit,
    );

    const mapped = items.map((student) => {
      const active = student.enrollments[0];
      return {
        ...student,
        lastName: sanitizeLastName(student.lastName),
        grade: active?.grade ?? null,
        section: active?.section ?? null,
      };
    });

    return paginate(mapped, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        branch: true,
        enrollments: { include: { grade: true, section: true, academicYear: true } },
        parents: { include: { parent: { include: { user: true } } } },
      },
    });
    return this.tenant.assertOwnedOrThrow(user, student, 'STUDENT_NOT_FOUND');
  }

  async update(id: string, dto: UpdateStudentDto, user: AuthUser) {
    await this.findOne(id, user);
    const scienceGroup = dto.scienceGroup?.trim();
    if (scienceGroup && scienceGroup !== 'COMPUTER' && scienceGroup !== 'BIOLOGY') {
      throw new BadRequestException({
        code: 'INVALID_SCIENCE_GROUP',
        message: 'Science group must be Computer or Biology',
      });
    }
    return this.prisma.student.update({
      where: { id },
      data: { scienceGroup: scienceGroup || null },
      include: {
        branch: true,
        enrollments: { include: { grade: true, section: true, academicYear: true } },
        parents: { include: { parent: { include: { user: true } } } },
      },
    });
  }

  async updatePhoto(id: string, file: Express.Multer.File | undefined, user: AuthUser) {
    await this.findOne(id, user);
    const asset = await this.files.upload(file, user);
    return this.prisma.student.update({
      where: { id },
      data: { photoUrl: asset.url },
      include: {
        branch: true,
        enrollments: {
          where: { status: EnrollmentStatus.ACTIVE },
          include: { grade: true, section: true, academicYear: true },
          take: 1,
        },
        parents: { include: { parent: { include: { user: true } } } },
      },
    });
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
    return true;
  }
}
