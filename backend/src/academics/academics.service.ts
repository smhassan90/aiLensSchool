import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
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
  CreateSectionDto,
  CreateSubjectDto,
} from './dto/academics.dto';

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

  private classSubjectInclude() {
    const teacherSelect = {
      select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } },
    };
    return {
      subject: { select: { id: true, name: true, code: true } },
      academicYear: { select: { id: true, name: true } },
      teacher: teacherSelect,
      assistantTeacher: teacherSelect,
      section: { select: { id: true, name: true } },
    };
  }

  async createGrade(dto: CreateGradeDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
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
      const grade = await this.prisma.$transaction(async (tx) => {
        const created = await tx.grade.create({
          data: { schoolId, name: dto.name, level: dto.level },
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
    const grade = await this.prisma.grade.findFirst({
      where: { id, schoolId },
      include: {
        _count: { select: { sections: true, enrollments: true } },
        sections: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            gradeId: true,
            branchId: true,
            capacity: true,
            classTeacherId: true,
            branch: { select: { id: true, name: true } },
            classTeacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
            _count: { select: { enrollments: true, classSubjects: true } },
          },
        },
      },
    });
    if (!grade) {
      throw new NotFoundException({ code: 'GRADE_NOT_FOUND', message: 'Class not found' });
    }
    return grade;
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
          orderBy: { name: 'asc' },
          skip,
          take,
          select: {
            id: true,
            name: true,
            gradeId: true,
            branchId: true,
            capacity: true,
            classTeacherId: true,
            grade: { select: { id: true, name: true, level: true } },
            branch: { select: { id: true, name: true } },
            classTeacher: { select: { id: true, user: { select: { firstName: true, lastName: true } } } },
            _count: { select: { enrollments: true, classSubjects: true } },
            classSubjects: {
              select: {
                subjectId: true,
                academicYearId: true,
                subject: { select: { id: true, name: true } },
              },
            },
          },
        }),
      () => this.prisma.section.count({ where }),
      page,
      limit,
    );
    return paginate(items, total, page, limit);
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
    const where: Prisma.SubjectWhereInput = {
      schoolId,
      ...(query.gradeId ? { gradeId: query.gradeId } : {}),
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
    query: PaginationDto & { sectionId?: string; academicYearId?: string; gradeId?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.StudentEnrollmentWhereInput = {
      student: { schoolId },
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
      ...(query.gradeId ? { gradeId: query.gradeId } : {}),
    };
    const [items, total] = await pageQuery(
      (skip, take) =>
        this.prisma.studentEnrollment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
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
    const where: Prisma.ClassSubjectWhereInput = {
      section: { schoolId, ...(query.gradeId ? { gradeId: query.gradeId } : {}) },
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
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

  async saveExamPattern(
    user: AuthUser,
    dto: { academicYearId: string; pattern: string; exams: Array<{ name: string; maxMarks: number; sequence: number }> },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    await this.prisma.schoolSettings.upsert({
      where: { schoolId },
      create: { schoolId, examPattern: dto.pattern },
      update: { examPattern: dto.pattern },
    });
    await this.prisma.examConfig.deleteMany({ where: { schoolId, academicYearId: dto.academicYearId } });
    await this.prisma.examConfig.createMany({
      data: dto.exams.map((exam) => ({
        schoolId,
        academicYearId: dto.academicYearId,
        name: exam.name,
        maxMarks: exam.maxMarks,
        sequence: exam.sequence,
      })),
    });
    return this.prisma.examConfig.findMany({ where: { schoolId, academicYearId: dto.academicYearId }, orderBy: { sequence: 'asc' } });
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
}
