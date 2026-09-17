import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EnrollmentStatus,
  ExamPaperReviewStatus,
  NotificationType,
  Prisma,
  QuizStatus,
} from '@prisma/client';
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
import {
  ExamPaperQuestionSpec,
  parseQuestionSpec,
} from './exam-paper-question-spec';
import { deadlineBlockedMessage, isDeadlineOpen } from './exam-deadlines';

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

  async upsertQuizTarget(
    user: AuthUser,
    dto: { gradeId?: string; subjectId?: string; minQuizzes: number },
  ) {
    return this.prisma.withReconnect(() => this.upsertQuizTargetInternal(user, dto));
  }

  private async upsertQuizTargetInternal(
    user: AuthUser,
    dto: { gradeId?: string; subjectId?: string; minQuizzes: number },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    if (!dto.minQuizzes || dto.minQuizzes < 1) {
      throw new BadRequestException({
        code: 'INVALID_QUIZ_TARGET',
        message: 'Weekly quiz target must be at least 1',
      });
    }

    const grades = dto.gradeId
      ? await this.prisma.grade.findMany({
          where: { id: dto.gradeId, schoolId },
          select: { id: true },
        })
      : await this.prisma.grade.findMany({
          where: { schoolId },
          select: { id: true },
        });
    if (!grades.length) {
      throw new BadRequestException({
        code: 'NO_GRADES',
        message: 'Add grades before setting a weekly quiz target',
      });
    }

    const subjects = dto.subjectId
      ? await this.prisma.subject.findMany({
          where: { id: dto.subjectId, schoolId },
          select: { id: true },
        })
      : await this.prisma.subject.findMany({
          where: { schoolId },
          select: { id: true },
        });
    if (!subjects.length) {
      throw new BadRequestException({
        code: 'NO_SUBJECTS',
        message: 'Add subjects before setting a weekly quiz target',
      });
    }

    const pairs = grades.flatMap((grade) =>
      subjects.map((subject) => ({ gradeId: grade.id, subjectId: subject.id })),
    );

    const saved = await this.prisma.$transaction(
      pairs.map(({ gradeId, subjectId }) =>
        this.prisma.quizTarget.upsert({
          where: { gradeId_subjectId: { gradeId, subjectId } },
          create: {
            schoolId,
            gradeId,
            subjectId,
            minQuizzes: dto.minQuizzes,
          },
          update: { minQuizzes: dto.minQuizzes },
        }),
      ),
    );

    return {
      minQuizzes: dto.minQuizzes,
      gradeCount: grades.length,
      subjectCount: subjects.length,
      savedCount: saved.length,
    };
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
      if (!exam) {
        examConfigId = undefined;
      } else {
        const assignment = await this.prisma.examPaperAssignment.findFirst({
          where: {
            schoolId,
            examConfigId,
            sectionId: section.id,
            subjectId: subject.id,
            releasedAt: { not: null },
          },
          select: { scoreEntryDueAt: true, scoreEntryUnlockedUntil: true },
        });
        if (
          assignment &&
          !isDeadlineOpen(assignment.scoreEntryDueAt, assignment.scoreEntryUnlockedUntil)
        ) {
          throw new BadRequestException({
            code: 'SCORE_ENTRY_DEADLINE_PASSED',
            message: deadlineBlockedMessage('score'),
          });
        }
      }
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

  private async examPaperAssignmentTargets(schoolId: string, academicYearId: string) {
    const classSubjects = await this.prisma.classSubject.findMany({
      where: { academicYearId, section: { schoolId } },
      select: {
        sectionId: true,
        subjectId: true,
        teacherId: true,
        assistantTeacherId: true,
        section: {
          select: {
            id: true,
            name: true,
            branchId: true,
            gradeId: true,
            classTeacherId: true,
            grade: { select: { name: true, level: true } },
          },
        },
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
      orderBy: [
        { section: { grade: { level: 'asc' } } },
        { section: { name: 'asc' } },
        { subject: { name: 'asc' } },
      ],
    });

    if (classSubjects.length) {
      const seen = new Set<string>();
      const targets: Array<{
        sectionId: string;
        subjectId: string;
        branchId: string;
        classTeacherId: string | null;
        className: string;
        subjectName: string;
        teacherId: string | null;
        assistantTeacherId: string | null;
        teacher: (typeof classSubjects)[number]['teacher'];
      }> = [];

      for (const row of classSubjects) {
        const key = `${row.sectionId}:${row.subjectId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({
          sectionId: row.sectionId,
          subjectId: row.subjectId,
          branchId: row.section.branchId,
          classTeacherId: row.section.classTeacherId,
          className: `${row.section.grade.name} ${row.section.name}`,
          subjectName: row.subject.name,
          teacherId: row.teacherId,
          assistantTeacherId: row.assistantTeacherId,
          teacher: row.teacher,
        });
      }
      return targets;
    }

    const [sections, subjects] = await Promise.all([
      this.prisma.section.findMany({
        where: { schoolId },
        select: {
          id: true,
          name: true,
          branchId: true,
          gradeId: true,
          classTeacherId: true,
          grade: { select: { name: true, level: true } },
        },
        orderBy: [{ grade: { level: 'asc' } }, { name: 'asc' }],
      }),
      this.prisma.subject.findMany({
        where: { schoolId },
        select: { id: true, name: true, gradeId: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const targets: Array<{
      sectionId: string;
      subjectId: string;
      branchId: string;
      classTeacherId: string | null;
      className: string;
      subjectName: string;
      teacherId: string | null;
      assistantTeacherId: string | null;
      teacher: null;
    }> = [];

    for (const section of sections) {
      const gradeSubjects = subjects.filter(
        (subject) => !subject.gradeId || subject.gradeId === section.gradeId,
      );
      for (const subject of gradeSubjects) {
        targets.push({
          sectionId: section.id,
          subjectId: subject.id,
          branchId: section.branchId,
          classTeacherId: section.classTeacherId,
          className: `${section.grade.name} ${section.name}`,
          subjectName: subject.name,
          teacherId: null,
          assistantTeacherId: null,
          teacher: null,
        });
      }
    }

    return targets;
  }

  private async teacherIdsBySubject(schoolId: string, academicYearId: string) {
    const rows = await this.prisma.teacherSubject.findMany({
      where: { academicYearId, teacher: { schoolId } },
      select: { subjectId: true, teacherId: true, teacher: { select: { userId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const bySubject = new Map<string, Array<{ teacherId: string; userId: string }>>();
    for (const row of rows) {
      const list = bySubject.get(row.subjectId) ?? [];
      list.push({ teacherId: row.teacherId, userId: row.teacher.userId });
      bySubject.set(row.subjectId, list);
    }
    return bySubject;
  }

  private resolveTeacherForExamTarget(
    target: {
      sectionId: string;
      subjectId: string;
      teacherId: string | null;
      assistantTeacherId: string | null;
      classTeacherId: string | null;
      teacher: { id: string; userId: string } | null;
    },
    teachersBySubject: Map<string, Array<{ teacherId: string; userId: string }>>,
    teachersInSection: Map<string, string[]>,
  ): { teacherId: string | null; userId: string | null } {
    if (target.teacherId) {
      return {
        teacherId: target.teacherId,
        userId: target.teacher?.userId ?? null,
      };
    }
    if (target.assistantTeacherId) {
      return { teacherId: target.assistantTeacherId, userId: null };
    }
    const subjectTeachers = teachersBySubject.get(target.subjectId) ?? [];
    const sectionTeachers = new Set(teachersInSection.get(target.sectionId) ?? []);
    const inSection = subjectTeachers.find((row) => sectionTeachers.has(row.teacherId));
    if (inSection) {
      return { teacherId: inSection.teacherId, userId: inSection.userId };
    }
    if (subjectTeachers[0]) {
      return { teacherId: subjectTeachers[0].teacherId, userId: subjectTeachers[0].userId };
    }
    if (target.classTeacherId) {
      return { teacherId: target.classTeacherId, userId: null };
    }
    return { teacherId: null, userId: null };
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

    const targets = await this.examPaperAssignmentTargets(schoolId, exam.academicYearId);

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
      targetCount: targets.length,
      rows: targets.map((row) => {
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
          className: row.className,
          subjectName: row.subjectName,
          defaultTeacherId: row.teacherId,
          defaultTeacherUserId: row.teacher?.userId ?? null,
          defaultTeacherName: teacherName || 'Auto-assigned on apply',
          assignment: assignment
            ? {
                id: assignment.id,
                teacherId: assignment.teacherId,
                maxMarks: assignment.maxMarks,
                submissionDueAt: assignment.submissionDueAt.toISOString(),
                scoreEntryDueAt: assignment.scoreEntryDueAt?.toISOString() ?? null,
                questionSpec: parseQuestionSpec(assignment.questionSpec),
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
      applyToAll?: boolean;
      maxMarks?: number;
      submissionDueAt?: string;
      scoreEntryDueAt?: string;
      examDate?: string;
      questionSpec?: ExamPaperQuestionSpec | null;
      rows?: Array<{
        sectionId: string;
        subjectId: string;
        teacherId?: string | null;
        maxMarks: number;
        submissionDueAt: string;
        questionSpec?: ExamPaperQuestionSpec | null;
        enabled?: boolean;
      }>;
    },
  ) {
    return this.prisma.withReconnect(() => this.saveExamPaperAssignmentsInternal(user, body));
  }

  private async saveExamPaperAssignmentsInternal(
    user: AuthUser,
    body: {
      examConfigId: string;
      release?: boolean;
      applyToAll?: boolean;
      maxMarks?: number;
      submissionDueAt?: string;
      scoreEntryDueAt?: string;
      examDate?: string;
      questionSpec?: ExamPaperQuestionSpec | null;
      rows?: Array<{
        sectionId: string;
        subjectId: string;
        teacherId?: string | null;
        maxMarks: number;
        submissionDueAt: string;
        questionSpec?: ExamPaperQuestionSpec | null;
        enabled?: boolean;
      }>;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const exam = await this.prisma.examConfig.findFirst({
      where: { id: body.examConfigId, schoolId },
      select: { id: true, name: true, maxMarks: true, academicYearId: true },
    });
    if (!exam) {
      throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }

    const targets = await this.examPaperAssignmentTargets(schoolId, exam.academicYearId);
    if (!targets.length) {
      throw new BadRequestException({
        code: 'NO_ASSIGNMENTS',
        message:
          'No classes found for this school year. Add classes under Setup and assign teachers to subjects first.',
      });
    }

    if (body.examDate) {
      const examDate = new Date(body.examDate);
      if (Number.isNaN(examDate.getTime())) {
        throw new BadRequestException({
          code: 'INVALID_EXAM_DATE',
          message: 'Enter a valid exam date',
        });
      }
      await this.prisma.examConfig.update({
        where: { id: exam.id },
        data: { startDate: examDate },
      });
    }

    const maxMarks = body.maxMarks ?? exam.maxMarks;
    const submissionDueAt = body.submissionDueAt;
    let scoreEntryDue: Date | null = null;
    if (body.scoreEntryDueAt) {
      scoreEntryDue = new Date(body.scoreEntryDueAt);
      if (Number.isNaN(scoreEntryDue.getTime())) {
        throw new BadRequestException({
          code: 'INVALID_SCORE_DUE_DATE',
          message: 'Enter a valid score entry due date',
        });
      }
    }
    const shouldApplyToAll =
      body.applyToAll === true ||
      body.rows === undefined ||
      (Array.isArray(body.rows) && body.rows.length === 0);

    if (shouldApplyToAll && !submissionDueAt) {
      throw new BadRequestException({
        code: 'INVALID_DUE_DATE',
        message: 'Choose a paper submission due date',
      });
    }
    if (shouldApplyToAll && !scoreEntryDue) {
      throw new BadRequestException({
        code: 'INVALID_SCORE_DUE_DATE',
        message: 'Choose a score entry due date',
      });
    }

    const enabledRows = shouldApplyToAll
      ? targets.map((target) => ({
          sectionId: target.sectionId,
          subjectId: target.subjectId,
          teacherId: null as string | null,
          maxMarks,
          submissionDueAt: submissionDueAt!,
          enabled: true,
        }))
      : (body.rows ?? []).filter((row) => row.enabled !== false);

    if (!enabledRows.length) {
      throw new BadRequestException({
        code: 'NO_ASSIGNMENTS',
        message: 'No class-subject rows to assign.',
      });
    }

    const releasedAt = body.release ? new Date() : null;
    const notifyRows: Array<{
      teacherUserId: string;
      className: string;
      subjectName: string;
      maxMarks: number;
      submissionDueAt: Date;
      assignmentId: string;
    }> = [];

    const [teachersBySubject, classSubjectsForYear, teacherProfiles] = await Promise.all([
      this.teacherIdsBySubject(schoolId, exam.academicYearId),
      this.prisma.classSubject.findMany({
        where: { academicYearId: exam.academicYearId, section: { schoolId } },
        select: {
          sectionId: true,
          subjectId: true,
          teacherId: true,
          assistantTeacherId: true,
        },
      }),
      this.prisma.teacherProfile.findMany({
        where: { schoolId },
        select: { id: true, userId: true },
      }),
    ]);
    const classSubjectByKey = new Map(
      classSubjectsForYear.map((row) => [`${row.sectionId}:${row.subjectId}`, row]),
    );
    const targetByKey = new Map(
      targets.map((row) => [`${row.sectionId}:${row.subjectId}`, row]),
    );
    const teachersInSection = new Map<string, string[]>();
    for (const row of classSubjectsForYear) {
      if (!row.teacherId) continue;
      const list = teachersInSection.get(row.sectionId) ?? [];
      list.push(row.teacherId);
      teachersInSection.set(row.sectionId, list);
    }
    const teacherUserById = new Map(teacherProfiles.map((row) => [row.id, row.userId]));

    const existingAssignments = await this.prisma.examPaperAssignment.findMany({
      where: { examConfigId: body.examConfigId, schoolId },
      select: { id: true, sectionId: true, subjectId: true, releasedAt: true },
    });
    const existingByKey = new Map(
      existingAssignments.map((row) => [`${row.sectionId}:${row.subjectId}`, row]),
    );

    const results = await this.prisma.$transaction(
      async (tx) => {
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

          const key = `${row.sectionId}:${row.subjectId}`;
          const target = targetByKey.get(key);
          if (!target) {
            throw new BadRequestException({
              code: 'CLASS_SUBJECT_NOT_FOUND',
              message: 'Class and subject combination was not found',
            });
          }

          const resolvedTeacher = this.resolveTeacherForExamTarget(
            target,
            teachersBySubject,
            teachersInSection,
          );
          const teacherId = row.teacherId ?? resolvedTeacher.teacherId;
          const existing = existingByKey.get(key);

          let classSubject = classSubjectByKey.get(key);
          if (!classSubject) {
            await tx.classSubject.create({
              data: {
                sectionId: row.sectionId,
                subjectId: row.subjectId,
                academicYearId: exam.academicYearId,
                branchId: target.branchId,
                teacherId,
              },
            });
          } else if (teacherId && !classSubject.teacherId) {
            await tx.classSubject.update({
              where: {
                sectionId_subjectId_academicYearId: {
                  sectionId: row.sectionId,
                  subjectId: row.subjectId,
                  academicYearId: exam.academicYearId,
                },
              },
              data: { teacherId },
            });
          }

          const data = {
            schoolId,
            examConfigId: body.examConfigId,
            sectionId: row.sectionId,
            subjectId: row.subjectId,
            teacherId,
            maxMarks: row.maxMarks,
            submissionDueAt: due,
            scoreEntryDueAt: scoreEntryDue,
            questionSpec: Prisma.JsonNull,
            assignedById: user.id,
            ...(releasedAt && !existing?.releasedAt ? { releasedAt } : {}),
          };

          const record = existing
            ? await tx.examPaperAssignment.update({
                where: { id: existing.id },
                data: {
                  teacherId: data.teacherId,
                  maxMarks: data.maxMarks,
                  submissionDueAt: data.submissionDueAt,
                  scoreEntryDueAt: data.scoreEntryDueAt,
                  questionSpec: data.questionSpec,
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

          const notifyUserId =
            resolvedTeacher.userId ?? (teacherId ? teacherUserById.get(teacherId) ?? null : null);
          if (releasedAt && notifyUserId) {
            notifyRows.push({
              teacherUserId: notifyUserId,
              className: target.className,
              subjectName: target.subjectName,
              maxMarks: row.maxMarks,
              submissionDueAt: due,
              assignmentId: record.id,
            });
          }
        }
        return saved;
      },
      { timeout: 120_000 },
    );

    if (notifyRows.length) {
      const dueFormatter = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const now = new Date();
      await this.prisma.notification.createMany({
        data: notifyRows.map((row) => ({
          schoolId,
          userId: row.teacherUserId,
          type: NotificationType.EXAM_PAPER_ASSIGNED,
          title: `${exam.name} paper assigned`,
          body: `${row.className} · ${row.subjectName} · ${row.maxMarks} marks · submit by ${dueFormatter.format(row.submissionDueAt)}`,
          deepLink: '/teacher/exams',
          data: {
            examPaperAssignmentId: row.assignmentId,
            examName: exam.name,
          } as Prisma.InputJsonValue,
          sentAt: now,
        })),
      });
    }

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

  private async syncTeacherExamAssignments(
    schoolId: string,
    academicYearId: string,
    teacherId: string,
    classSubjects: Array<{ sectionId: string; subjectId: string }>,
    assignedById: string,
  ) {
    const releasedTemplates = await this.prisma.examPaperAssignment.findMany({
      where: {
        schoolId,
        releasedAt: { not: null },
        examConfig: { academicYearId },
      },
      distinct: ['examConfigId'],
      select: {
        examConfigId: true,
        maxMarks: true,
        submissionDueAt: true,
        scoreEntryDueAt: true,
        releasedAt: true,
      },
    });

    for (const template of releasedTemplates) {
      for (const row of classSubjects) {
        const existing = await this.prisma.examPaperAssignment.findFirst({
          where: {
            examConfigId: template.examConfigId,
            sectionId: row.sectionId,
            subjectId: row.subjectId,
          },
          select: { id: true },
        });
        if (existing) continue;

        const target = (
          await this.examPaperAssignmentTargets(schoolId, academicYearId)
        ).find(
          (item) => item.sectionId === row.sectionId && item.subjectId === row.subjectId,
        );
        if (!target) continue;

        await this.prisma.examPaperAssignment.create({
          data: {
            schoolId,
            examConfigId: template.examConfigId,
            sectionId: row.sectionId,
            subjectId: row.subjectId,
            teacherId,
            maxMarks: template.maxMarks,
            submissionDueAt: template.submissionDueAt,
            scoreEntryDueAt: template.scoreEntryDueAt,
            releasedAt: template.releasedAt,
            assignedById,
          },
        });
      }
    }
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

    const classSubjects = await this.prisma.classSubject.findMany({
      where: {
        academicYearId: year.id,
        OR: [{ teacherId: teacher.id }, { assistantTeacherId: teacher.id }],
      },
      select: { sectionId: true, subjectId: true },
    });
    const teachKeys = new Set(classSubjects.map((r) => `${r.sectionId}:${r.subjectId}`));

    const assigner = await this.prisma.examPaperAssignment.findFirst({
      where: { schoolId, releasedAt: { not: null } },
      select: { assignedById: true },
      orderBy: { releasedAt: 'desc' },
    });
    await this.syncTeacherExamAssignments(
      schoolId,
      year.id,
      teacher.id,
      classSubjects,
      assigner?.assignedById ?? user.id,
    );

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
        section: { select: { id: true, name: true, grade: { select: { name: true, level: true } } } },
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
      orderBy: [
        { examConfig: { sequence: 'asc' } },
        { section: { grade: { level: 'asc' } } },
        { section: { name: 'asc' } },
        { subject: { name: 'asc' } },
      ],
    });

    const filtered = assignments.filter((row) => {
      if (row.teacherId && row.teacherId !== teacher.id) return false;
      if (!row.teacherId) {
        return true;
      }
      return true;
    });

    const visibleAssignments = filtered.filter((row) =>
      teachKeys.has(`${row.sectionId}:${row.subjectId}`),
    );
    const pendingExtensions = await this.prisma.examDeadlineExtensionRequest.findMany({
      where: {
        teacherId: teacher.id,
        assignmentId: { in: visibleAssignments.map((row) => row.id) },
        status: 'PENDING',
      },
      select: { id: true, assignmentId: true, kind: true, days: true },
    });
    const pendingByAssignmentKind = new Map(
      pendingExtensions.map((row) => [`${row.assignmentId}:${row.kind}`, row]),
    );

    return {
      assignments: visibleAssignments.map((row) => {
          const paperPending = pendingByAssignmentKind.get(`${row.id}:PAPER`);
          const scorePending = pendingByAssignmentKind.get(`${row.id}:SCORE`);
          const bothPending = pendingByAssignmentKind.get(`${row.id}:BOTH`);
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
            sectionName: row.section.name,
            gradeLevel: row.section.grade.level,
            subjectName: row.subject.name,
            maxMarks: row.maxMarks,
            submissionDueAt: row.submissionDueAt.toISOString(),
            scoreEntryDueAt: row.scoreEntryDueAt?.toISOString() ?? null,
            paperSubmissionOpen: isDeadlineOpen(
              row.submissionDueAt,
              row.paperSubmissionUnlockedUntil,
            ),
            scoreEntryOpen: isDeadlineOpen(row.scoreEntryDueAt, row.scoreEntryUnlockedUntil),
            questionSpec: parseQuestionSpec(row.questionSpec),
            releasedAt: row.releasedAt?.toISOString() ?? null,
            status: !latestQuiz
              ? 'NOT_STARTED'
              : latestQuiz.reviewStatus === ExamPaperReviewStatus.APPROVED
                ? 'APPROVED'
                : latestQuiz.reviewStatus === ExamPaperReviewStatus.PENDING_REVIEW
                  ? 'PENDING'
                  : 'DRAFT',
            quizId: latestQuiz?.id ?? null,
            rejectionReason: latestQuiz?.rejectionReason ?? null,
            pendingGeneration,
            paperExtensionRequest:
              paperPending || bothPending
                ? {
                    id: (paperPending ?? bothPending)!.id,
                    days: (paperPending ?? bothPending)!.days,
                    status: 'PENDING' as const,
                  }
                : null,
            scoreExtensionRequest:
              scorePending || bothPending
                ? {
                    id: (scorePending ?? bothPending)!.id,
                    days: (scorePending ?? bothPending)!.days,
                    status: 'PENDING' as const,
                  }
                : null,
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

  async setExamConfigDate(user: AuthUser, examConfigId: string, examDate: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const date = new Date(examDate);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_EXAM_DATE',
        message: 'Enter a valid exam date',
      });
    }
    const exam = await this.prisma.examConfig.findFirst({
      where: { id: examConfigId, schoolId },
      select: { id: true },
    });
    if (!exam) {
      throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Exam not found' });
    }
    return this.prisma.examConfig.update({
      where: { id: exam.id },
      data: { startDate: date },
      select: { id: true, name: true, startDate: true },
    });
  }

  private extensionUntil(days: 1 | 2 | 3) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    until.setHours(23, 59, 59, 999);
    return until;
  }

  private async teacherAssignmentIdsForExam(
    schoolId: string,
    teacherId: string,
    examConfigId: string,
  ) {
    const exam = await this.prisma.examConfig.findFirst({
      where: { id: examConfigId, schoolId },
      select: { academicYearId: true },
    });
    if (!exam) {
      return [];
    }

    const classSubjects = await this.prisma.classSubject.findMany({
      where: {
        academicYearId: exam.academicYearId,
        OR: [{ teacherId }, { assistantTeacherId: teacherId }],
      },
      select: { sectionId: true, subjectId: true },
    });
    const teachKeys = new Set(classSubjects.map((row) => `${row.sectionId}:${row.subjectId}`));

    const assignments = await this.prisma.examPaperAssignment.findMany({
      where: {
        schoolId,
        examConfigId,
        releasedAt: { not: null },
      },
      select: { id: true, sectionId: true, subjectId: true, teacherId: true },
    });

    return assignments
      .filter((row) => {
        if (row.teacherId === teacherId) return true;
        if (row.teacherId && row.teacherId !== teacherId) return false;
        return teachKeys.has(`${row.sectionId}:${row.subjectId}`);
      })
      .map((row) => row.id);
  }

  private async applyDeadlineExtensionToAssignments(
    assignmentIds: string[],
    kind: 'paper' | 'score' | 'both',
    days: 1 | 2 | 3,
  ) {
    if (!assignmentIds.length) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'No exam assignments found for this teacher',
      });
    }
    const until = this.extensionUntil(days);
    const data: Prisma.ExamPaperAssignmentUpdateManyMutationInput = {};
    if (kind === 'paper' || kind === 'both') {
      data.paperSubmissionUnlockedUntil = until;
    }
    if (kind === 'score' || kind === 'both') {
      data.scoreEntryUnlockedUntil = until;
    }
    await this.prisma.examPaperAssignment.updateMany({
      where: { id: { in: assignmentIds } },
      data,
    });
    return { until, assignmentCount: assignmentIds.length };
  }

  async requestExamDeadlineExtension(
    user: AuthUser,
    body: { assignmentId: string; kind: 'paper' | 'score'; days: 1 | 2 | 3 },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!teacher) {
      throw new ForbiddenException({ code: 'TEACHER_REQUIRED', message: 'Teacher profile not found' });
    }

    const assignment = await this.prisma.examPaperAssignment.findFirst({
      where: { id: body.assignmentId, schoolId, releasedAt: { not: null } },
      include: {
        examConfig: { select: { name: true } },
        section: { select: { name: true, grade: { select: { name: true } } } },
        subject: { select: { name: true } },
      },
    });
    if (!assignment) {
      throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND', message: 'Exam assignment not found' });
    }

    const teaches = await this.prisma.classSubject.findFirst({
      where: {
        sectionId: assignment.sectionId,
        subjectId: assignment.subjectId,
        OR: [{ teacherId: teacher.id }, { assistantTeacherId: teacher.id }],
      },
      select: { id: true },
    });
    if (!teaches && assignment.teacherId && assignment.teacherId !== teacher.id) {
      throw new ForbiddenException({
        code: 'NOT_YOUR_ASSIGNMENT',
        message: 'This exam is not assigned to your class',
      });
    }

    const deadlinePassed =
      body.kind === 'paper'
        ? !isDeadlineOpen(assignment.submissionDueAt, assignment.paperSubmissionUnlockedUntil)
        : !isDeadlineOpen(assignment.scoreEntryDueAt, assignment.scoreEntryUnlockedUntil);
    if (!deadlinePassed) {
      throw new BadRequestException({
        code: 'DEADLINE_NOT_PASSED',
        message: 'The deadline has not passed yet — you can continue without requesting an extension.',
      });
    }

    const kindEnum = body.kind === 'paper' ? 'PAPER' : 'SCORE';
    const existing = await this.prisma.examDeadlineExtensionRequest.findFirst({
      where: {
        assignmentId: assignment.id,
        teacherId: teacher.id,
        kind: kindEnum,
        status: 'PENDING',
      },
    });
    if (existing) {
      throw new BadRequestException({
        code: 'REQUEST_ALREADY_PENDING',
        message: 'You already have a pending request for this exam. The office will review it soon.',
      });
    }

    const request = await this.prisma.examDeadlineExtensionRequest.create({
      data: {
        schoolId,
        assignmentId: assignment.id,
        teacherId: teacher.id,
        kind: kindEnum,
        days: body.days,
      },
    });

    return {
      id: request.id,
      status: request.status,
      days: request.days,
      examName: assignment.examConfig.name,
      className: `${assignment.section.grade.name} ${assignment.section.name}`,
      subjectName: assignment.subject.name,
    };
  }

  async listExamDeadlineExtensionRequests(user: AuthUser) {
    if (!this.tenant.isSchoolAdmin(user)) {
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Only the office can view extension requests',
      });
    }
    const schoolId = this.tenant.requireSchoolId(user);
    const rows = await this.prisma.examDeadlineExtensionRequest.findMany({
      where: { schoolId, status: 'PENDING' },
      orderBy: { requestedAt: 'asc' },
      include: {
        teacher: {
          select: {
            id: true,
            userId: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        assignment: {
          include: {
            examConfig: { select: { id: true, name: true } },
            section: {
              select: { id: true, name: true, grade: { select: { name: true } } },
            },
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      days: row.days,
      requestedAt: row.requestedAt.toISOString(),
      teacherUserId: row.teacher.userId,
      teacherName: `${row.teacher.user.firstName} ${row.teacher.user.lastName}`.trim(),
      examConfigId: row.assignment.examConfigId,
      examName: row.assignment.examConfig.name,
      sectionId: row.assignment.sectionId,
      subjectId: row.assignment.subjectId,
      className: `${row.assignment.section.grade.name} ${row.assignment.section.name}`,
      subjectName: row.assignment.subject.name,
      assignmentId: row.assignmentId,
    }));
  }

  async approveExamDeadlineExtensionRequest(
    user: AuthUser,
    requestId: string,
    days?: 1 | 2 | 3,
  ) {
    if (!this.tenant.isSchoolAdmin(user)) {
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Only the office can approve extension requests',
      });
    }
    const schoolId = this.tenant.requireSchoolId(user);
    const request = await this.prisma.examDeadlineExtensionRequest.findFirst({
      where: { id: requestId, schoolId, status: 'PENDING' },
      include: {
        teacher: { select: { user: { select: { firstName: true, lastName: true } } } },
        assignment: true,
      },
    });
    if (!request) {
      throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found or already handled' });
    }

    const grantDays = (days ?? request.days) as 1 | 2 | 3;
    const kind =
      request.kind === 'PAPER' ? 'paper' : request.kind === 'SCORE' ? 'score' : 'both';
    const assignmentIds = await this.teacherAssignmentIdsForExam(
      schoolId,
      request.teacherId,
      request.assignment.examConfigId,
    );
    const { until, assignmentCount } = await this.applyDeadlineExtensionToAssignments(
      assignmentIds,
      kind,
      grantDays,
    );

    await this.prisma.examDeadlineExtensionRequest.updateMany({
      where: {
        schoolId,
        teacherId: request.teacherId,
        status: 'PENDING',
        kind: request.kind,
        assignment: { examConfigId: request.assignment.examConfigId },
      },
      data: {
        status: 'APPROVED',
        days: grantDays,
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'EXAM_DEADLINE_EXTENSION_APPROVED',
      entityType: 'ExamDeadlineExtensionRequest',
      entityId: request.id,
      metadata: {
        kind,
        days: grantDays,
        examConfigId: request.assignment.examConfigId,
        assignmentCount,
      },
    });

    return {
      ok: true,
      unlockedUntil: until.toISOString(),
      assignmentCount,
      teacherName: `${request.teacher.user.firstName} ${request.teacher.user.lastName}`.trim(),
    };
  }

  async extendExamDeadlines(
    user: AuthUser,
    body: {
      teacherUserId: string;
      examConfigId: string;
      kind: 'paper' | 'score' | 'both';
      days: 1 | 2 | 3;
    },
  ) {
    if (!this.tenant.isSchoolAdmin(user)) {
      throw new ForbiddenException({
        code: 'ADMIN_REQUIRED',
        message: 'Only the office can extend exam deadlines',
      });
    }
    const schoolId = this.tenant.requireSchoolId(user);
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { userId: body.teacherUserId, schoolId },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    });
    if (!teacher) {
      throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    }
    const assignmentIds = await this.teacherAssignmentIdsForExam(
      schoolId,
      teacher.id,
      body.examConfigId,
    );
    const { until, assignmentCount } = await this.applyDeadlineExtensionToAssignments(
      assignmentIds,
      body.kind,
      body.days,
    );
    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'EXAM_DEADLINE_EXTENDED',
      entityType: 'ExamPaperAssignment',
      entityId: assignmentIds[0],
      metadata: {
        kind: body.kind,
        days: body.days,
        teacherUserId: body.teacherUserId,
        examConfigId: body.examConfigId,
        assignmentCount,
      },
    });
    return {
      ok: true,
      unlockedUntil: until.toISOString(),
      assignmentCount,
      teacherName: `${teacher.user.firstName} ${teacher.user.lastName}`.trim(),
    };
  }

  async getExamScoreSheet(
    user: AuthUser,
    query: { examConfigId: string; sectionId: string; subjectId: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const assignment = await this.prisma.examPaperAssignment.findFirst({
      where: {
        schoolId,
        examConfigId: query.examConfigId,
        sectionId: query.sectionId,
        subjectId: query.subjectId,
        releasedAt: { not: null },
      },
      include: {
        examConfig: { select: { id: true, name: true, maxMarks: true, startDate: true } },
        section: { select: { name: true, grade: { select: { name: true } } } },
        subject: { select: { name: true } },
      },
    });
    if (!assignment) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'No exam assignment found for this class and subject',
      });
    }
    const canEnterScores = isDeadlineOpen(
      assignment.scoreEntryDueAt,
      assignment.scoreEntryUnlockedUntil,
    );
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        sectionId: query.sectionId,
        status: EnrollmentStatus.ACTIVE,
      },
      orderBy: [{ student: { firstName: 'asc' } }, { student: { lastName: 'asc' } }],
      select: {
        studentId: true,
        student: {
          select: { id: true, firstName: true, lastName: true, studentCode: true },
        },
      },
    });
    const existing = await this.prisma.assessmentMark.findMany({
      where: {
        schoolId,
        examConfigId: query.examConfigId,
        sectionId: query.sectionId,
        subjectId: query.subjectId,
      },
      select: { id: true, studentId: true, marks: true },
    });
    const marksByStudent = new Map(existing.map((row) => [row.studentId, row]));
    const scoresSubmitted =
      enrollments.length > 0 &&
      enrollments.every((row) => marksByStudent.get(row.studentId)?.marks != null);
    const scoreEntryReopened =
      assignment.scoreEntryUnlockedUntil != null &&
      assignment.scoreEntryUnlockedUntil.getTime() > Date.now();
    return {
      exam: {
        id: assignment.examConfig.id,
        name: assignment.examConfig.name,
        maxMarks: assignment.maxMarks,
        examDate: assignment.examConfig.startDate?.toISOString().slice(0, 10) ?? null,
      },
      className: `${assignment.section.grade.name} ${assignment.section.name}`,
      subjectName: assignment.subject.name,
      scoreEntryDueAt: assignment.scoreEntryDueAt?.toISOString() ?? null,
      scoresSubmitted,
      canEnterScores: canEnterScores && (!scoresSubmitted || scoreEntryReopened),
      students: enrollments.map((row) => ({
        studentId: row.studentId,
        firstName: row.student.firstName,
        lastName: row.student.lastName,
        studentCode: row.student.studentCode,
        marks: marksByStudent.get(row.studentId)?.marks != null
          ? Number(marksByStudent.get(row.studentId)!.marks)
          : null,
        assessmentId: marksByStudent.get(row.studentId)?.id ?? null,
      })),
    };
  }

  async saveExamScores(
    user: AuthUser,
    body: {
      examConfigId: string;
      sectionId: string;
      subjectId: string;
      scores: Array<{ studentId: string; marks: number }>;
    },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const assignment = await this.prisma.examPaperAssignment.findFirst({
      where: {
        schoolId,
        examConfigId: body.examConfigId,
        sectionId: body.sectionId,
        subjectId: body.subjectId,
        releasedAt: { not: null },
      },
      include: { examConfig: { select: { name: true } } },
    });
    if (!assignment) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'No exam assignment found',
      });
    }
    if (
      !isDeadlineOpen(assignment.scoreEntryDueAt, assignment.scoreEntryUnlockedUntil)
    ) {
      throw new BadRequestException({
        code: 'SCORE_ENTRY_DEADLINE_PASSED',
        message: deadlineBlockedMessage('score'),
      });
    }
    const year = await this.prisma.academicYear.findFirst({
      where: { schoolId, isCurrent: true },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    if (!year) {
      throw new BadRequestException({ code: 'NO_YEAR', message: 'No active academic year' });
    }
    const maxMarks = assignment.maxMarks;
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        sectionId: body.sectionId,
        status: EnrollmentStatus.ACTIVE,
      },
      select: { studentId: true },
    });
    const enrolledStudentIds = new Set(enrollments.map((row) => row.studentId));
    const existing = await this.prisma.assessmentMark.findMany({
      where: {
        schoolId,
        examConfigId: body.examConfigId,
        sectionId: body.sectionId,
        subjectId: body.subjectId,
      },
      select: { studentId: true, marks: true },
    });
    const allScoresAlreadySubmitted =
      enrollments.length > 0 &&
      enrollments.every((row) => existing.some((mark) => mark.studentId === row.studentId && mark.marks != null));
    const scoreEntryReopened =
      assignment.scoreEntryUnlockedUntil != null &&
      assignment.scoreEntryUnlockedUntil.getTime() > Date.now();
    if (allScoresAlreadySubmitted && !scoreEntryReopened) {
      throw new BadRequestException({
        code: 'SCORES_ALREADY_SUBMITTED',
        message: 'Exam scores are already submitted. Ask the school admin to reopen score entry before editing.',
      });
    }
    if (
      body.scores.length !== enrolledStudentIds.size ||
      body.scores.some((row) => !enrolledStudentIds.has(row.studentId))
    ) {
      throw new BadRequestException({
        code: 'ALL_SCORES_REQUIRED',
        message: 'Enter marks for every enrolled student before submitting.',
      });
    }
    for (const row of body.scores) {
      if (row.marks < 0 || row.marks > maxMarks) {
        throw new BadRequestException({
          code: 'INVALID_MARKS',
          message: `Marks must be between 0 and ${maxMarks}`,
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      for (const row of body.scores) {
        const existing = await tx.assessmentMark.findFirst({
          where: {
            schoolId,
            studentId: row.studentId,
            examConfigId: body.examConfigId,
            sectionId: body.sectionId,
            subjectId: body.subjectId,
          },
        });
        if (existing) {
          await tx.assessmentMark.update({
            where: { id: existing.id },
            data: { marks: row.marks, maxMarks, recordedById: user.id },
          });
        } else {
          await tx.assessmentMark.create({
            data: {
              schoolId,
              studentId: row.studentId,
              subjectId: body.subjectId,
              sectionId: body.sectionId,
              academicYearId: year.id,
              examConfigId: body.examConfigId,
              type: 'TERM_EXAM',
              title: assignment.examConfig.name,
              maxMarks,
              marks: row.marks,
              recordedById: user.id,
            },
          });
        }
      }
    });
    return { saved: body.scores.length };
  }
}
