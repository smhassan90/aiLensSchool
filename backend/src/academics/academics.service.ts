import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, ExamPaperReviewStatus, Prisma, QuizStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import {
  AssignClassSubjectDto,
  CreateAcademicYearDto,
  CreateEnrollmentDto,
  CreateGradeDto,
  CreateSchoolStageDto,
  CreateSectionDto,
  CreateSubjectDto,
  UpdateGradeDto,
  UpdateSchoolStageDto,
} from './dto/academics.dto';
import { examsForPattern, normalizeExamPapers } from './exam-patterns';
import { positiveAmount, syncClassFeeStructures } from '../fees/class-fees';
import { EXAM_PAPER_KINDS } from '../quizzes/exam-paper';
import { teacherDisplayName } from '../common/utils/person-name';

@Injectable()
export class AcademicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
  ) {}

  async createAcademicYear(dto: CreateAcademicYearDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, schoolId },
      });
      if (!branch) {
        throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
      }
    }

    if (dto.isCurrent) {
      await this.prisma.academicYear.updateMany({
        where: { schoolId, isCurrent: true },
        data: { isCurrent: false },
      });
    }

    const year = await this.prisma.academicYear.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isCurrent: dto.isCurrent ?? false,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'ACADEMIC_YEAR_CREATED',
      entityType: 'AcademicYear',
      entityId: year.id,
    });
    return year;
  }

  async listAcademicYears(user: AuthUser, query: PaginationDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.AcademicYearWhereInput = { schoolId };
    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.academicYear.findMany({
          where,
          orderBy: { startDate: 'desc' },
          skip,
          take,
        }),
      () => this.prisma.academicYear.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }

  async listStages(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.prisma.schoolStage.findMany({
      where: { schoolId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        grades: {
          orderBy: { level: 'asc' },
          select: { id: true, name: true, level: true, tuitionFee: true },
        },
        coordinator: {
          select: { id: true, user: { select: { firstName: true, lastName: true } } },
        },
        _count: { select: { grades: true } },
      },
    });
  }

  async createStage(dto: CreateSchoolStageDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException({ code: 'NAME_REQUIRED', message: 'Section name is required' });
    }
    if (dto.coordinatorId) {
      const teacher = await this.prisma.teacherProfile.findFirst({
        where: { id: dto.coordinatorId, schoolId },
      });
      if (!teacher) {
        throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Coordinator not found' });
      }
    }
    try {
      const stage = await this.prisma.schoolStage.create({
        data: {
          schoolId,
          name,
          sortOrder: dto.sortOrder ?? 0,
          coordinatorId: dto.coordinatorId,
        },
        include: {
          grades: { select: { id: true, name: true, level: true } },
          _count: { select: { grades: true } },
        },
      });
      await this.audit.log({
        actorUserId: user.id,
        schoolId,
        action: 'SCHOOL_STAGE_CREATED',
        entityType: 'SchoolStage',
        entityId: stage.id,
      });
      return stage;
    } catch {
      throw new ConflictException({
        code: 'STAGE_EXISTS',
        message: 'A school section with this name already exists',
      });
    }
  }

  async updateStage(id: string, dto: UpdateSchoolStageDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const existing = await this.prisma.schoolStage.findFirst({ where: { id, schoolId } });
    if (!existing) {
      throw new NotFoundException({ code: 'STAGE_NOT_FOUND', message: 'School section not found' });
    }
    if (dto.coordinatorId) {
      const teacher = await this.prisma.teacherProfile.findFirst({
        where: { id: dto.coordinatorId, schoolId },
      });
      if (!teacher) {
        throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Coordinator not found' });
      }
    }
    try {
      return await this.prisma.schoolStage.update({
        where: { id },
        data: {
          ...(dto.name != null ? { name: dto.name.trim() } : {}),
          ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.coordinatorId !== undefined ? { coordinatorId: dto.coordinatorId } : {}),
        },
        include: {
          grades: { orderBy: { level: 'asc' }, select: { id: true, name: true, level: true } },
          _count: { select: { grades: true } },
        },
      });
    } catch {
      throw new ConflictException({
        code: 'STAGE_EXISTS',
        message: 'A school section with this name already exists',
      });
    }
  }

  private classSubjectInclude() {
    const teacherSelect = {
      select: {
        id: true,
        gender: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    };
    return {
      subject: { select: { id: true, name: true, code: true } },
      academicYear: { select: { id: true, name: true } },
      teacher: teacherSelect,
      assistantTeacher: teacherSelect,
      section: { select: { id: true, name: true } },
    };
  }

  private async currentAcademicYear(schoolId: string) {
    return this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true },
    });
  }

  private sectionClassSelect(yearId?: string | null): Prisma.SectionSelect {
    const yearWhere = yearId ? { academicYearId: yearId } : {};
    const teacherSelect = {
      select: {
        id: true,
        gender: true,
        user: { select: { firstName: true, lastName: true } },
      },
    };
    return {
      id: true,
      name: true,
      gradeId: true,
      branchId: true,
      capacity: true,
      classTeacherId: true,
      branch: { select: { id: true, name: true } },
      classTeacher: teacherSelect,
      _count: {
        select: {
          enrollments: {
            where: { status: EnrollmentStatus.ACTIVE, ...yearWhere },
          },
          classSubjects: { where: yearWhere },
        },
      },
      classSubjects: {
        where: yearWhere,
        orderBy: { subject: { name: 'asc' } },
        select: {
          id: true,
          subjectId: true,
          teacherId: true,
          assistantTeacherId: true,
          academicYearId: true,
          subject: { select: { id: true, name: true, code: true } },
          teacher: teacherSelect,
          assistantTeacher: teacherSelect,
        },
      },
    };
  }

  async createGrade(dto: CreateGradeDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    if (dto.stageId) {
      const stage = await this.prisma.schoolStage.findFirst({
        where: { id: dto.stageId, schoolId },
      });
      if (!stage) {
        throw new NotFoundException({ code: 'STAGE_NOT_FOUND', message: 'School section not found' });
      }
    }
    if (dto.createDefaultSection) {
      if (!dto.branchId) {
        throw new BadRequestException({
          code: 'BRANCH_REQUIRED',
          message: 'Branch is required to create the default section',
        });
      }
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, schoolId },
      });
      if (!branch) {
        throw new NotFoundException({ code: 'BRANCH_NOT_FOUND', message: 'Branch not found' });
      }
    }

    try {
      const admissionFee = positiveAmount(dto.admissionFee);
      const tuitionFee = positiveAmount(dto.tuitionFee);
      const grade = await this.prisma.$transaction(async (tx) => {
        const created = await tx.grade.create({
          data: {
            schoolId,
            stageId: dto.stageId,
            name: dto.name,
            level: dto.level,
            admissionFee: admissionFee ?? undefined,
            tuitionFee: tuitionFee ?? undefined,
          },
        });

        if (dto.createDefaultSection && dto.branchId) {
          await tx.section.create({
            data: {
              schoolId,
              branchId: dto.branchId,
              gradeId: created.id,
              name: dto.defaultSectionName?.trim() || 'A',
              capacity: dto.defaultSectionCapacity,
            },
          });
        }

        await syncClassFeeStructures(tx, {
          schoolId,
          gradeId: created.id,
          gradeName: created.name,
          admissionFee,
          tuitionFee,
        });

        return created;
      });

      const withSections = await this.prisma.grade.findUnique({
        where: { id: grade.id },
        include: {
          _count: { select: { sections: true, enrollments: true } },
          sections: { include: { branch: true, _count: { select: { enrollments: true } } } },
        },
      });

      await this.audit.log({
        actorUserId: user.id,
        schoolId,
        action: 'GRADE_CREATED',
        entityType: 'Grade',
        entityId: grade.id,
      });
      return withSections ?? grade;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new ConflictException({
        code: 'GRADE_EXISTS',
        message: 'Grade name already exists',
      });
    }
  }

  async listGrades(user: AuthUser, query: PaginationDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.GradeWhereInput = { schoolId };
    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.grade.findMany({
          where,
          orderBy: { level: 'asc' },
          skip,
          take,
          select: {
            id: true,
            name: true,
            level: true,
            admissionFee: true,
            tuitionFee: true,
            hasPeriodTimetable: true,
            stage: { select: { id: true, name: true } },
            _count: { select: { sections: true, enrollments: true } },
            sections: { orderBy: { name: 'asc' }, select: { id: true, name: true } },
          },
        }),
      () => this.prisma.grade.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }

  async getGrade(id: string, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const year = await this.currentAcademicYear(schoolId);
    const grade = await this.prisma.grade.findFirst({
      where: { id, schoolId },
      include: {
        stage: { select: { id: true, name: true } },
        _count: {
          select: {
            sections: true,
            enrollments: {
              where: {
                status: EnrollmentStatus.ACTIVE,
                ...(year ? { academicYearId: year.id } : {}),
              },
            },
          },
        },
        feeStructures: {
          where: { active: true },
          orderBy: [{ kind: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            amount: true,
            frequency: true,
            kind: true,
            description: true,
          },
        },
        sections: {
          orderBy: { name: 'asc' },
          select: this.sectionClassSelect(year?.id),
        },
      },
    });
    if (!grade) {
      throw new NotFoundException({ code: 'GRADE_NOT_FOUND', message: 'Class not found' });
    }
    return grade;
  }

  async updateGrade(id: string, dto: UpdateGradeDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const existing = await this.prisma.grade.findFirst({ where: { id, schoolId } });
    if (!existing) {
      throw new NotFoundException({ code: 'GRADE_NOT_FOUND', message: 'Class not found' });
    }

    const name = dto.name?.trim();
    if (name === '') {
      throw new BadRequestException({ code: 'NAME_REQUIRED', message: 'Class name is required' });
    }

    const admissionFee = dto.admissionFee === undefined ? existing.admissionFee : positiveAmount(dto.admissionFee);
    const tuitionFee = dto.tuitionFee === undefined ? existing.tuitionFee : positiveAmount(dto.tuitionFee);

    if (dto.stageId) {
      const stage = await this.prisma.schoolStage.findFirst({
        where: { id: dto.stageId, schoolId },
      });
      if (!stage) {
        throw new NotFoundException({ code: 'STAGE_NOT_FOUND', message: 'School section not found' });
      }
    }

    try {
      const grade = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.grade.update({
          where: { id },
          data: {
            ...(name ? { name } : {}),
            ...(dto.level != null ? { level: dto.level } : {}),
            ...(dto.stageId !== undefined ? { stageId: dto.stageId } : {}),
            ...(dto.admissionFee !== undefined ? { admissionFee } : {}),
            ...(dto.tuitionFee !== undefined ? { tuitionFee } : {}),
          },
        });
        await syncClassFeeStructures(tx, {
          schoolId,
          gradeId: updated.id,
          gradeName: updated.name,
          admissionFee: admissionFee == null ? null : Number(admissionFee),
          tuitionFee: tuitionFee == null ? null : Number(tuitionFee),
        });
        return updated;
      });

      await this.audit.log({
        actorUserId: user.id,
        schoolId,
        action: 'GRADE_UPDATED',
        entityType: 'Grade',
        entityId: grade.id,
      });
      return this.getGrade(id, user);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new ConflictException({
        code: 'GRADE_EXISTS',
        message: 'Grade name already exists',
      });
    }
  }

  async createSection(dto: CreateSectionDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const [branch, grade] = await Promise.all([
      this.prisma.branch.findFirst({ where: { id: dto.branchId, schoolId } }),
      this.prisma.grade.findFirst({ where: { id: dto.gradeId, schoolId } }),
    ]);
    if (!branch || !grade) {
      throw new NotFoundException({
        code: 'BRANCH_OR_GRADE_NOT_FOUND',
        message: 'Branch or grade not found',
      });
    }

    try {
      const section = await this.prisma.section.create({
        data: {
          schoolId,
          branchId: dto.branchId,
          gradeId: dto.gradeId,
          name: dto.name,
          capacity: dto.capacity,
          classTeacherId: dto.classTeacherId,
        },
        include: { grade: true, branch: true, _count: { select: { enrollments: true } } },
      });
      await this.audit.log({
        actorUserId: user.id,
        schoolId,
        branchId: dto.branchId,
        action: 'SECTION_CREATED',
        entityType: 'Section',
        entityId: section.id,
      });
      return section;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ConflictException({
        code: 'SECTION_EXISTS',
        message: 'A section with this name already exists in the class',
      });
    }
  }

  async listSections(
    user: AuthUser,
    query: PaginationDto & { branchId?: string; gradeId?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const year = await this.currentAcademicYear(schoolId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SectionWhereInput = {
      schoolId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    };
    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.section.findMany({
          where,
          orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
          skip,
          take,
          select: {
            ...this.sectionClassSelect(year?.id),
            grade: { select: { id: true, name: true, level: true } },
          },
        }),
      () => this.prisma.section.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }

  async getSection(id: string, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const year = await this.currentAcademicYear(schoolId);
    const section = await this.prisma.section.findFirst({
      where: { id, schoolId },
      select: {
        ...this.sectionClassSelect(year?.id),
        grade: { select: { id: true, name: true, level: true, tuitionFee: true } },
      },
    });
    if (!section) {
      throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Class section not found' });
    }
    return section;
  }

  async createSubject(dto: CreateSubjectDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    if (dto.gradeId) {
      const grade = await this.prisma.grade.findFirst({
        where: { id: dto.gradeId, schoolId },
      });
      if (!grade) {
        throw new NotFoundException({ code: 'GRADE_NOT_FOUND', message: 'Grade not found' });
      }
    }
    try {
      const subject = await this.prisma.subject.create({
        data: {
          schoolId,
          name: dto.name,
          code: dto.code.toUpperCase(),
          gradeId: dto.gradeId,
        },
      });
      await this.audit.log({
        actorUserId: user.id,
        schoolId,
        action: 'SUBJECT_CREATED',
        entityType: 'Subject',
        entityId: subject.id,
      });
      return subject;
    } catch {
      throw new ConflictException({
        code: 'SUBJECT_CODE_EXISTS',
        message: 'Subject code already exists',
      });
    }
  }

  async listSubjects(user: AuthUser, query: PaginationDto & { gradeId?: string }) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const year = query.gradeId ? await this.currentAcademicYear(schoolId) : null;
    const where: Prisma.SubjectWhereInput = {
      schoolId,
      ...(query.gradeId
        ? {
            OR: [
              { gradeId: query.gradeId },
              {
                classSubjects: {
                  some: {
                    section: { gradeId: query.gradeId },
                    ...(year ? { academicYearId: year.id } : {}),
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.subject.findMany({
          where,
          orderBy: { name: 'asc' },
          skip,
          take,
          select: {
            id: true,
            name: true,
            code: true,
            gradeId: true,
            grade: { select: { id: true, name: true } },
          },
        }),
      () => this.prisma.subject.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }

  async createEnrollment(dto: CreateEnrollmentDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, schoolId },
    });
    if (!student) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student not found' });
    }

    const [grade, section, academicYear] = await Promise.all([
      this.prisma.grade.findFirst({ where: { id: dto.gradeId, schoolId } }),
      this.prisma.section.findFirst({ where: { id: dto.sectionId, schoolId } }),
      this.prisma.academicYear.findFirst({ where: { id: dto.academicYearId, schoolId } }),
    ]);
    if (!grade || !section || !academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_CONTEXT_INVALID',
        message: 'Class, section, or academic year not found',
      });
    }
    if (section.gradeId !== grade.id) {
      throw new BadRequestException({
        code: 'SECTION_NOT_IN_CLASS',
        message: 'Section does not belong to the selected class',
      });
    }

    const existing = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId: dto.studentId,
        academicYearId: dto.academicYearId,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'STUDENT_ALREADY_ENROLLED',
        message: 'Student is already enrolled for this academic year',
      });
    }

    if (section.capacity) {
      const enrolled = await this.prisma.studentEnrollment.count({
        where: {
          sectionId: section.id,
          academicYearId: dto.academicYearId,
          status: EnrollmentStatus.ACTIVE,
        },
      });
      if (enrolled >= section.capacity) {
        throw new BadRequestException({
          code: 'SECTION_CAPACITY_FULL',
          message: 'This section is at capacity',
        });
      }
    }

    const enrollment = await this.prisma.studentEnrollment.create({
      data: {
        studentId: dto.studentId,
        academicYearId: dto.academicYearId,
        gradeId: dto.gradeId,
        sectionId: dto.sectionId,
        enrollmentDate: dto.enrollmentDate ? new Date(dto.enrollmentDate) : new Date(),
        status: EnrollmentStatus.ACTIVE,
      },
      include: { student: true, grade: true, section: true, academicYear: true },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'ENROLLMENT_CREATED',
      entityType: 'StudentEnrollment',
      entityId: enrollment.id,
    });
    return enrollment;
  }

  async listEnrollments(
    user: AuthUser,
    query: PaginationDto & {
      sectionId?: string;
      academicYearId?: string;
      gradeId?: string;
      status?: EnrollmentStatus;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const yearId =
      query.academicYearId ??
      (query.gradeId || query.sectionId ? (await this.currentAcademicYear(schoolId))?.id : undefined);
    const where: Prisma.StudentEnrollmentWhereInput = {
      student: { schoolId },
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(yearId ? { academicYearId: yearId } : {}),
      ...(query.gradeId ? { gradeId: query.gradeId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.studentEnrollment.findMany({
          where,
          orderBy: [{ student: { firstName: 'asc' } }, { student: { lastName: 'asc' } }],
          skip,
          take,
          select: {
            id: true,
            status: true,
            createdAt: true,
            studentId: true,
            gradeId: true,
            sectionId: true,
            academicYearId: true,
            student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
            grade: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true } },
          },
        }),
      () => this.prisma.studentEnrollment.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }

  async assignClassSubject(dto: AssignClassSubjectDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const section = await this.prisma.section.findFirst({
      where: { id: dto.sectionId, schoolId },
    });
    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, schoolId },
    });
    if (!section || !subject) {
      throw new NotFoundException({
        code: 'SECTION_OR_SUBJECT_NOT_FOUND',
        message: 'Section or subject not found',
      });
    }

    if (dto.assistantTeacherId && !dto.teacherId) {
      throw new BadRequestException({
        code: 'PRIMARY_TEACHER_REQUIRED',
        message: 'Assign a primary teacher before adding an assistant',
      });
    }
    if (dto.teacherId && dto.assistantTeacherId && dto.teacherId === dto.assistantTeacherId) {
      throw new BadRequestException({
        code: 'ASSISTANT_SAME_AS_TEACHER',
        message: 'Assistant teacher must be different from the primary teacher',
      });
    }

    const teacherIds = [dto.teacherId, dto.assistantTeacherId].filter(Boolean) as string[];
    if (teacherIds.length) {
      const teachers = await this.prisma.teacherProfile.findMany({
        where: { id: { in: teacherIds }, schoolId },
      });
      if (teachers.length !== teacherIds.length) {
        throw new NotFoundException({
          code: 'TEACHER_NOT_FOUND',
          message: 'Teacher not found',
        });
      }
    }

    const classSubject = await this.prisma.classSubject.upsert({
      where: {
        sectionId_subjectId_academicYearId: {
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          academicYearId: dto.academicYearId,
        },
      },
      create: {
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        academicYearId: dto.academicYearId,
        branchId: dto.branchId,
        teacherId: dto.teacherId,
        assistantTeacherId: dto.assistantTeacherId,
      },
      update: {
        teacherId: dto.teacherId,
        assistantTeacherId: dto.assistantTeacherId ?? null,
        branchId: dto.branchId,
      },
      include: this.classSubjectInclude(),
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'CLASS_SUBJECT_ASSIGNED',
      entityType: 'ClassSubject',
      entityId: classSubject.id,
    });
    return classSubject;
  }

  async listClassSubjects(
    user: AuthUser,
    query: PaginationDto & { sectionId?: string; academicYearId?: string; gradeId?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const yearId = query.academicYearId ?? (await this.currentAcademicYear(schoolId))?.id;
    const where: Prisma.ClassSubjectWhereInput = {
      section: { schoolId, ...(query.gradeId ? { gradeId: query.gradeId } : {}) },
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(yearId ? { academicYearId: yearId } : {}),
    };
    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.classSubject.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: this.classSubjectInclude(),
        }),
      () => this.prisma.classSubject.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
  }

  async setClassTeacher(sectionId: string, classTeacherId: string | null, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const section = await this.prisma.section.findFirst({ where: { id: sectionId, schoolId } });
    if (!section) throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Section not found' });
    if (classTeacherId) {
      const teacher = await this.prisma.teacherProfile.findFirst({ where: { id: classTeacherId, schoolId } });
      if (!teacher) throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    }
    return this.prisma.section.update({
      where: { id: sectionId },
      data: { classTeacherId },
      include: { grade: true, classTeacher: { include: { user: true } } },
    });
  }

  async upsertQuizTarget(user: AuthUser, dto: { gradeId: string; subjectId: string; minQuizzes: number }) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.prisma.quizTarget.upsert({
      where: { gradeId_subjectId: { gradeId: dto.gradeId, subjectId: dto.subjectId } },
      create: { schoolId, ...dto },
      update: { minQuizzes: dto.minQuizzes },
    });
  }

  listQuizTargets(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.prisma.quizTarget.findMany({
      where: { schoolId },
      include: { grade: { select: { name: true } }, subject: { select: { name: true } } },
    });
  }

  getExamSettings(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.prisma.schoolSettings.findUnique({
      where: { schoolId },
      select: { examSubmissionDaysBefore: true },
    });
  }

  async saveExamPattern(
    user: AuthUser,
    dto: {
      academicYearId: string;
      pattern: string;
      examSubmissionDaysBefore?: number;
      exams?: Array<{
        name: string;
        maxMarks: number;
        sequence: number;
        startDate?: string;
        endDate?: string;
      }>;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const exams = dto.exams?.length ? normalizeExamPapers(dto.exams) : examsForPattern(dto.pattern);
    if (!exams.length) {
      throw new BadRequestException({
        code: 'EXAMS_REQUIRED',
        message: 'Add at least one exam paper',
      });
    }
    const examPattern = dto.exams?.length ? 'CUSTOM' : dto.pattern;
    await this.prisma.schoolSettings.upsert({
      where: { schoolId },
      create: {
        schoolId,
        examPattern,
        ...(dto.examSubmissionDaysBefore !== undefined
          ? { examSubmissionDaysBefore: dto.examSubmissionDaysBefore }
          : {}),
      },
      update: {
        examPattern,
        ...(dto.examSubmissionDaysBefore !== undefined
          ? { examSubmissionDaysBefore: dto.examSubmissionDaysBefore }
          : {}),
      },
    });
    await this.prisma.examConfig.deleteMany({ where: { schoolId, academicYearId: dto.academicYearId } });
    await this.prisma.examConfig.createMany({
      data: exams.map((exam) => ({
        schoolId,
        academicYearId: dto.academicYearId,
        name: exam.name,
        maxMarks: exam.maxMarks,
        sequence: exam.sequence,
        startDate: exam.startDate ? new Date(exam.startDate) : null,
        endDate: exam.endDate ? new Date(exam.endDate) : null,
      })),
    });
    return this.prisma.examConfig.findMany({
      where: { schoolId, academicYearId: dto.academicYearId },
      orderBy: { sequence: 'asc' },
    });
  }

  listExamConfigs(user: AuthUser, academicYearId?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.prisma.examConfig.findMany({
      where: { schoolId, ...(academicYearId ? { academicYearId } : {}) },
      orderBy: { sequence: 'asc' },
    });
  }

  async addAssessment(
    user: AuthUser,
    dto: {
      studentId: string;
      subjectId: string;
      sectionId: string;
      academicYearId: string;
      examConfigId?: string;
      type: 'CLASS_TEST' | 'PHYSICAL_TEST' | 'TERM_EXAM' | 'OTHER';
      title: string;
      maxMarks: number;
      marks: number;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        student: { schoolId },
        sectionId: dto.sectionId,
        OR: [{ studentId: dto.studentId }, { id: dto.studentId }],
      },
      select: { studentId: true, sectionId: true, academicYearId: true },
    });
    if (!enrollment) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'That student is not in this class. Pick a student from the list and try again.',
      });
    }

    const [subject, section, year] = await Promise.all([
      this.prisma.subject.findFirst({ where: { id: dto.subjectId, schoolId }, select: { id: true } }),
      this.prisma.section.findFirst({ where: { id: dto.sectionId, schoolId }, select: { id: true } }),
      this.prisma.academicYear.findFirst({
        where: { id: enrollment.academicYearId || dto.academicYearId, schoolId },
        select: { id: true },
      }),
    ]);
    if (!subject) {
      throw new NotFoundException({ code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' });
    }
    if (!section) {
      throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Class not found' });
    }
    if (!year) {
      throw new NotFoundException({ code: 'YEAR_NOT_FOUND', message: 'Academic year not found' });
    }

    let examConfigId = dto.examConfigId || undefined;
    if (examConfigId) {
      const exam = await this.prisma.examConfig.findFirst({
        where: { id: examConfigId, schoolId },
        select: { id: true },
      });
      if (!exam) examConfigId = undefined;
    }

    return this.prisma.assessmentMark.create({
      data: {
        schoolId,
        studentId: enrollment.studentId,
        subjectId: subject.id,
        sectionId: section.id,
        academicYearId: year.id,
        examConfigId,
        type: dto.type,
        title: dto.title,
        maxMarks: dto.maxMarks,
        marks: dto.marks,
        recordedById: user.id,
      },
    });
  }

  listAssessments(user: AuthUser, sectionId?: string, subjectId?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    return this.prisma.assessmentMark.findMany({
      where: {
        schoolId,
        ...(sectionId ? { sectionId } : {}),
        ...(subjectId ? { subjectId } : {}),
      },
      orderBy: { assessedAt: 'desc' },
      take: 80,
      include: {
        student: { select: { firstName: true, lastName: true } },
        subject: { select: { name: true } },
      },
    });
  }

  async listTimetable(user: AuthUser, gradeId?: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
    });
    if (!year) {
      return { academicYear: null, grade: null, section: null, slots: [] };
    }

    if (!gradeId) {
      const grades = await this.prisma.grade.findMany({
        where: { schoolId, sections: { some: { timetableSlots: { some: { academicYearId: year.id } } } } },
        orderBy: { level: 'asc' },
        select: { id: true, name: true },
      });
      return { academicYear: { id: year.id, name: year.name }, grades, slots: [] };
    }

    const grade = await this.prisma.grade.findFirst({
      where: { id: gradeId, schoolId },
      include: {
        stage: { select: { id: true, name: true } },
        sections: {
          orderBy: { name: 'asc' },
          take: 1,
          include: {
            classTeacher: { select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } } },
            classSubjects: {
              include: {
                subject: { select: { id: true, name: true } },
                teacher: {
                  select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } },
                },
              },
              orderBy: { subject: { name: 'asc' } },
            },
          },
        },
      },
    });
    if (!grade) {
      throw new NotFoundException({ code: 'GRADE_NOT_FOUND', message: 'Class not found' });
    }
    const section = grade.sections[0];
    if (!section) {
      return {
        academicYear: { id: year.id, name: year.name },
        grade: {
          id: grade.id,
          name: grade.name,
          hasPeriodTimetable: grade.hasPeriodTimetable,
          stage: grade.stage,
        },
        section: null,
        pattern: grade.hasPeriodTimetable ? 'WEEKLY' : 'CLASS_TEACHER',
        subjects: [],
        slots: [],
      };
    }

    const slots = grade.hasPeriodTimetable
      ? await this.prisma.timetableSlot.findMany({
          where: { sectionId: section.id, academicYearId: year.id },
          orderBy: [{ periodNumber: 'asc' }, { weekday: 'asc' }],
          include: {
            subject: { select: { id: true, name: true } },
            teacher: {
              select: { id: true, gender: true, user: { select: { firstName: true, lastName: true } } },
            },
          },
        })
      : [];

    return {
      academicYear: { id: year.id, name: year.name },
      grade: {
        id: grade.id,
        name: grade.name,
        hasPeriodTimetable: grade.hasPeriodTimetable,
        stage: grade.stage,
      },
      section: {
        id: section.id,
        name: section.name,
        classTeacher: section.classTeacher,
      },
      pattern: grade.hasPeriodTimetable ? 'WEEKLY' : 'CLASS_TEACHER',
      subjects: section.classSubjects.map((row) => ({
        id: row.subject.id,
        name: row.subject.name,
        teacher: row.teacher,
      })),
      slots,
    };
  }

  async getExamPaperSubmissions(
    user: AuthUser,
    query: {
      examConfigId?: string;
      sectionId?: string;
      subjectId?: string;
      teacherId?: string;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const settings = await this.prisma.schoolSettings.findUnique({
      where: { schoolId },
      select: { examSubmissionDaysBefore: true },
    });
    const submissionDaysBefore = settings?.examSubmissionDaysBefore ?? 5;

    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true },
    });
    if (!year) {
      return {
        academicYear: null,
        submissionDaysBefore,
        selectedExam: null,
        submitted: 0,
        expected: 0,
        exams: [],
        filters: { sections: [], subjects: [], teachers: [] },
        teachers: [],
        papers: [],
      };
    }

    const exams = await this.prisma.examConfig.findMany({
      where: { schoolId, academicYearId: year.id },
      orderBy: { sequence: 'asc' },
      select: { id: true, name: true, startDate: true, sequence: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const defaultExam =
      exams.find((cfg) => cfg.startDate && cfg.startDate >= today) ??
      exams.filter((cfg) => cfg.startDate).at(-1) ??
      exams[0] ??
      null;

    const selectedExam =
      (query.examConfigId ? exams.find((exam) => exam.id === query.examConfigId) : null) ??
      defaultExam;

    if (!selectedExam) {
      return {
        academicYear: year,
        submissionDaysBefore,
        selectedExam: null,
        submitted: 0,
        expected: 0,
        exams,
        filters: { sections: [], subjects: [], teachers: [] },
        teachers: [],
        papers: [],
      };
    }

    const deadline = selectedExam.startDate
      ? new Date(selectedExam.startDate)
      : null;
    if (deadline) {
      deadline.setDate(deadline.getDate() - submissionDaysBefore);
    }

    const assignments = await this.prisma.classSubject.findMany({
      where: {
        section: { schoolId },
        academicYearId: year.id,
        teacherId: { not: null },
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.teacherId ? { teacher: { userId: query.teacherId } } : {}),
      },
      select: {
        sectionId: true,
        subjectId: true,
        section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
        subject: { select: { id: true, name: true } },
        teacher: {
          select: {
            id: true,
            userId: true,
            gender: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ section: { grade: { name: 'asc' } } }, { section: { name: 'asc' } }],
    });

    const allAssignments = await this.prisma.classSubject.findMany({
      where: {
        section: { schoolId },
        academicYearId: year.id,
        teacherId: { not: null },
      },
      select: {
        sectionId: true,
        subjectId: true,
        section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
        subject: { select: { id: true, name: true } },
        teacher: {
          select: {
            id: true,
            userId: true,
            gender: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const papers = await this.prisma.quiz.findMany({
      where: {
        schoolId,
        academicYearId: year.id,
        examConfigId: selectedExam.id,
        paperKind: { in: [...EXAM_PAPER_KINDS] },
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.teacherId ? { createdById: query.teacherId } : {}),
      },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        reviewStatus: true,
        rejectionReason: true,
        paperKind: true,
        difficulty: true,
        submittedAt: true,
        totalMarks: true,
        createdAt: true,
        sectionId: true,
        subjectId: true,
        createdById: true,
        examConfigId: true,
        subject: { select: { id: true, name: true } },
        section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
        examConfig: { select: { id: true, name: true, startDate: true } },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            teacherProfile: { select: { gender: true } },
          },
        },
      },
    });

    const paperByAssignment = new Map<string, (typeof papers)[number]>();
    for (const paper of papers) {
      const key = `${paper.createdById}:${paper.sectionId}:${paper.subjectId}`;
      const existing = paperByAssignment.get(key);
      if (!existing || paper.createdAt > existing.createdAt) {
        paperByAssignment.set(key, paper);
      }
    }

    type AssignmentRow = {
      sectionId: string;
      subjectId: string;
      className: string;
      subjectName: string;
      status: 'SUBMITTED' | 'DRAFT' | 'MISSING' | 'REJECTED';
      paperId: string | null;
      submittedAt: string | null;
    };

    const teacherMap = new Map<
      string,
      {
        teacherId: string;
        teacherName: string;
        gender: string | null;
        submittedCount: number;
        expectedCount: number;
        assignments: AssignmentRow[];
      }
    >();

    let submittedTotal = 0;
    for (const row of assignments) {
      if (!row.teacher?.userId) continue;
      const teacherId = row.teacher.userId;
      const className = `${row.section.grade.name} ${row.section.name}`;
      const key = `${teacherId}:${row.sectionId}:${row.subjectId}`;
      const paper = paperByAssignment.get(key);
      let status: AssignmentRow['status'] = 'MISSING';
      if (
        paper?.status === QuizStatus.CLOSED &&
        paper.reviewStatus !== ExamPaperReviewStatus.REJECTED
      ) {
        status = 'SUBMITTED';
        submittedTotal += 1;
      } else if (paper?.status === QuizStatus.DRAFT) {
        status = paper.reviewStatus === ExamPaperReviewStatus.REJECTED ? 'REJECTED' : 'DRAFT';
      }

      const assignmentRow: AssignmentRow = {
        sectionId: row.sectionId,
        subjectId: row.subjectId,
        className,
        subjectName: row.subject.name,
        status,
        paperId: paper?.id ?? null,
        submittedAt: paper?.submittedAt?.toISOString() ?? null,
      };

      const existing = teacherMap.get(teacherId);
      if (existing) {
        existing.expectedCount += 1;
        if (status === 'SUBMITTED') existing.submittedCount += 1;
        existing.assignments.push(assignmentRow);
      } else {
        teacherMap.set(teacherId, {
          teacherId,
          teacherName: teacherDisplayName(
            row.teacher.user.firstName,
            row.teacher.user.lastName,
            row.teacher.gender,
          ),
          gender: row.teacher.gender,
          submittedCount: status === 'SUBMITTED' ? 1 : 0,
          expectedCount: 1,
          assignments: [assignmentRow],
        });
      }
    }

    const teachers = [...teacherMap.values()].sort((a, b) =>
      a.teacherName.localeCompare(b.teacherName),
    );

    const sectionOptions = new Map<string, string>();
    const subjectOptions = new Map<string, string>();
    const teacherOptions = new Map<string, string>();
    for (const row of allAssignments) {
      if (!row.teacher?.userId) continue;
      sectionOptions.set(
        row.sectionId,
        `${row.section.grade.name} ${row.section.name}`,
      );
      subjectOptions.set(row.subjectId, row.subject.name);
      teacherOptions.set(
        row.teacher.userId,
        teacherDisplayName(
          row.teacher.user.firstName,
          row.teacher.user.lastName,
          row.teacher.gender,
        ),
      );
    }

    const submittedPapers = papers
      .filter(
        (paper) =>
          paper.status === QuizStatus.CLOSED &&
          paper.reviewStatus !== ExamPaperReviewStatus.REJECTED,
      )
      .map((paper) => ({
        ...paper,
        teacherName: teacherDisplayName(
          paper.createdBy.firstName,
          paper.createdBy.lastName,
          paper.createdBy.teacherProfile?.gender ?? null,
        ),
        teacherGender: paper.createdBy.teacherProfile?.gender ?? null,
      }));

    return {
      academicYear: year,
      submissionDaysBefore,
      selectedExam: {
        id: selectedExam.id,
        name: selectedExam.name,
        examDate: selectedExam.startDate?.toISOString().slice(0, 10) ?? null,
        deadline: deadline?.toISOString().slice(0, 10) ?? null,
      },
      submitted: submittedTotal,
      expected: assignments.length,
      exams,
      filters: {
        sections: [...sectionOptions.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        subjects: [...subjectOptions.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        teachers: [...teacherOptions.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
      teachers,
      papers: submittedPapers,
    };
  }

  async listExamPaperAssignments(user: AuthUser, examConfigId: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const exam = await this.prisma.examConfig.findFirst({
      where: { id: examConfigId, schoolId },
      select: { id: true, name: true, maxMarks: true, academicYearId: true, startDate: true },
    });
    if (!exam) {
      throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }

    const classSubjects = await this.prisma.classSubject.findMany({
      where: {
        academicYearId: exam.academicYearId,
        section: { schoolId },
        teacherId: { not: null },
      },
      select: {
        sectionId: true,
        subjectId: true,
        teacherId: true,
        section: { select: { id: true, name: true, grade: { select: { name: true } } } },
        subject: { select: { id: true, name: true } },
        teacher: {
          select: {
            id: true,
            userId: true,
            gender: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ section: { grade: { name: 'asc' } } }, { section: { name: 'asc' } }],
    });

    const existing = await this.prisma.examPaperAssignment.findMany({
      where: { examConfigId, schoolId },
      include: {
        teacher: {
          select: {
            id: true,
            userId: true,
            gender: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    const byKey = new Map(
      existing.map((row) => [`${row.sectionId}:${row.subjectId}`, row]),
    );

    const settings = await this.prisma.schoolSettings.findUnique({
      where: { schoolId },
      select: { examSubmissionDaysBefore: true },
    });
    const daysBefore = settings?.examSubmissionDaysBefore ?? 5;
    const defaultDue = exam.startDate
      ? new Date(exam.startDate.getTime() - daysBefore * 24 * 60 * 60 * 1000)
      : null;

    return {
      exam,
      defaultDueAt: defaultDue?.toISOString() ?? null,
      rows: classSubjects.map((row) => {
        const key = `${row.sectionId}:${row.subjectId}`;
        const assignment = byKey.get(key);
        const teacherName = teacherDisplayName(
          row.teacher?.user.firstName,
          row.teacher?.user.lastName,
          row.teacher?.gender,
        );
        return {
          sectionId: row.sectionId,
          subjectId: row.subjectId,
          className: `${row.section.grade.name} ${row.section.name}`,
          subjectName: row.subject.name,
          defaultTeacherId: row.teacherId,
          defaultTeacherUserId: row.teacher?.userId ?? null,
          defaultTeacherName: teacherName,
          assignment: assignment
            ? {
                id: assignment.id,
                teacherId: assignment.teacherId,
                maxMarks: assignment.maxMarks,
                submissionDueAt: assignment.submissionDueAt.toISOString(),
                releasedAt: assignment.releasedAt?.toISOString() ?? null,
              }
            : null,
        };
      }),
    };
  }

  async saveExamPaperAssignments(
    user: AuthUser,
    body: {
      examConfigId: string;
      release?: boolean;
      rows: Array<{
        sectionId: string;
        subjectId: string;
        teacherId?: string | null;
        maxMarks: number;
        submissionDueAt: string;
        enabled?: boolean;
      }>;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const exam = await this.prisma.examConfig.findFirst({
      where: { id: body.examConfigId, schoolId },
      select: { id: true, academicYearId: true },
    });
    if (!exam) {
      throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }

    const enabledRows = body.rows.filter((row) => row.enabled !== false);
    if (!enabledRows.length) {
      throw new BadRequestException({
        code: 'NO_ASSIGNMENTS',
        message: 'Select at least one class and subject to assign',
      });
    }

    const releasedAt = body.release ? new Date() : null;
    const results = await this.prisma.$transaction(async (tx) => {
      const saved: string[] = [];
      for (const row of enabledRows) {
        if (!row.maxMarks || row.maxMarks < 1) {
          throw new BadRequestException({
            code: 'INVALID_MAX_MARKS',
            message: 'Each assignment needs total marks of at least 1',
          });
        }
        const due = new Date(row.submissionDueAt);
        if (Number.isNaN(due.getTime())) {
          throw new BadRequestException({
            code: 'INVALID_DUE_DATE',
            message: 'Enter a valid submission due date for each assignment',
          });
        }

        const classSubject = await tx.classSubject.findFirst({
          where: {
            sectionId: row.sectionId,
            subjectId: row.subjectId,
            academicYearId: exam.academicYearId,
            section: { schoolId },
          },
          select: { teacherId: true },
        });
        if (!classSubject) {
          throw new BadRequestException({
            code: 'CLASS_SUBJECT_NOT_FOUND',
            message: 'Class and subject combination was not found',
          });
        }

        const teacherId = row.teacherId ?? classSubject.teacherId;
        const existing = await tx.examPaperAssignment.findUnique({
          where: {
            examConfigId_sectionId_subjectId: {
              examConfigId: body.examConfigId,
              sectionId: row.sectionId,
              subjectId: row.subjectId,
            },
          },
        });

        const data = {
          schoolId,
          examConfigId: body.examConfigId,
          sectionId: row.sectionId,
          subjectId: row.subjectId,
          teacherId,
          maxMarks: row.maxMarks,
          submissionDueAt: due,
          assignedById: user.id,
          ...(releasedAt && !existing?.releasedAt ? { releasedAt } : {}),
          ...(releasedAt && existing && !existing.releasedAt ? { releasedAt } : {}),
        };

        const record = existing
          ? await tx.examPaperAssignment.update({
              where: { id: existing.id },
              data: {
                teacherId: data.teacherId,
                maxMarks: data.maxMarks,
                submissionDueAt: data.submissionDueAt,
                assignedById: data.assignedById,
                ...(data.releasedAt ? { releasedAt: data.releasedAt } : {}),
              },
            })
          : await tx.examPaperAssignment.create({
              data: {
                ...data,
                releasedAt: releasedAt,
              },
            });
        saved.push(record.id);
      }
      return saved;
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'EXAM_PAPER_ASSIGNMENTS_SAVED',
      entityType: 'ExamConfig',
      entityId: body.examConfigId,
      metadata: { count: results.length, released: Boolean(body.release) },
    });

    return { saved: results.length, released: Boolean(body.release) };
  }

  async listMyExamPaperAssignments(user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!teacher) {
      return { assignments: [] };
    }

    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    if (!year) {
      return { assignments: [] };
    }

    const assignments = await this.prisma.examPaperAssignment.findMany({
      where: {
        schoolId,
        releasedAt: { not: null },
        examConfig: { academicYearId: year.id },
        OR: [
          { teacherId: teacher.id },
          {
            teacherId: null,
            section: {
              classSubjects: {
                some: {
                  academicYearId: year.id,
                  OR: [{ teacherId: teacher.id }, { assistantTeacherId: teacher.id }],
                },
              },
            },
          },
        ],
      },
      include: {
        examConfig: { select: { id: true, name: true, startDate: true } },
        section: { select: { id: true, name: true, grade: { select: { name: true } } } },
        subject: { select: { id: true, name: true } },
        quizzes: {
          where: { createdById: user.id, paperKind: { in: [...EXAM_PAPER_KINDS] } },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            reviewStatus: true,
            rejectionReason: true,
            submittedAt: true,
            totalMarks: true,
          },
        },
      },
      orderBy: { submissionDueAt: 'asc' },
    });

    const filtered = assignments.filter((row) => {
      if (row.teacherId && row.teacherId !== teacher.id) return false;
      if (!row.teacherId) {
        return true;
      }
      return true;
    });

    const classSubjects = await this.prisma.classSubject.findMany({
      where: {
        academicYearId: year.id,
        OR: [{ teacherId: teacher.id }, { assistantTeacherId: teacher.id }],
      },
      select: { sectionId: true, subjectId: true },
    });
    const teachKeys = new Set(classSubjects.map((r) => `${r.sectionId}:${r.subjectId}`));

    return {
      assignments: filtered
        .filter((row) => teachKeys.has(`${row.sectionId}:${row.subjectId}`))
        .map((row) => {
          const latestQuiz = row.quizzes[0] ?? null;
          const submitted =
            latestQuiz?.status === QuizStatus.CLOSED &&
            latestQuiz.reviewStatus !== ExamPaperReviewStatus.REJECTED;
          const pendingGeneration = !submitted;
          return {
            id: row.id,
            examConfigId: row.examConfigId,
            examName: row.examConfig.name,
            examDate: row.examConfig.startDate?.toISOString().slice(0, 10) ?? null,
            sectionId: row.sectionId,
            subjectId: row.subjectId,
            className: `${row.section.grade.name} ${row.section.name}`,
            subjectName: row.subject.name,
            maxMarks: row.maxMarks,
            submissionDueAt: row.submissionDueAt.toISOString(),
            releasedAt: row.releasedAt?.toISOString() ?? null,
            status: !latestQuiz
              ? 'NOT_STARTED'
              : latestQuiz.reviewStatus === ExamPaperReviewStatus.REJECTED
                ? 'REJECTED'
                : latestQuiz.reviewStatus === ExamPaperReviewStatus.PENDING_REVIEW
                  ? 'PENDING_REVIEW'
                  : latestQuiz.reviewStatus === ExamPaperReviewStatus.APPROVED
                    ? 'APPROVED'
                    : latestQuiz.status === QuizStatus.CLOSED
                      ? 'SUBMITTED'
                      : 'DRAFT',
            quizId: latestQuiz?.id ?? null,
            rejectionReason: latestQuiz?.rejectionReason ?? null,
            pendingGeneration,
          };
        }),
      pendingCount: filtered.filter((row) => {
        const key = `${row.sectionId}:${row.subjectId}`;
        if (!teachKeys.has(key)) return false;
        const latest = row.quizzes[0];
        const submitted =
          latest?.status === QuizStatus.CLOSED &&
          latest.reviewStatus !== ExamPaperReviewStatus.REJECTED;
        return !submitted;
      }).length,
    };
  }
}
