import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, LessonStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { HomeworkGenerationService } from '../ai/services/homework-generation.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import {
  CreateDiaryDto,
  GenerateDiaryDto,
  GenerateHomeworkDto,
  GenerateIdCardDto,
  GenerateReportCardDto,
  PreviewDiaryDto,
  PreviewHomeworkDto,
} from './dto/documents.dto';
import { ParentsService } from '../parents/parents.service';
import { TeacherGradeStyleService } from '../common/services/teacher-grade-style.service';
import { applyDiaryStyle, generateStyledHomework } from '../lessons/teacher-content-style';

function letterGrade(avg: number) {
  if (avg >= 85) return 'A';
  if (avg >= 70) return 'B';
  if (avg >= 55) return 'C';
  if (avg >= 40) return 'D';
  return 'F';
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly homeworkAi: HomeworkGenerationService,
    private readonly parentsService: ParentsService,
    private readonly gradeStyle: TeacherGradeStyleService,
  ) {}

  async createDiary(dto: CreateDiaryDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const section = await this.prisma.section.findFirst({
      where: { id: dto.sectionId, schoolId },
    });
    if (!section) {
      throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Section not found' });
    }

    const diary = await this.prisma.homeDiary.upsert({
      where: { sectionId_date: { sectionId: dto.sectionId, date: new Date(dto.date) } },
      create: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        sectionId: dto.sectionId,
        date: new Date(dto.date),
        title: dto.title ?? `Home diary ${dto.date}`,
        lessonSummary: dto.lessonSummary ?? '',
        homeworkNotes: dto.homeworkNotes ?? '',
        teacherRemarks: dto.teacherRemarks,
        createdById: user.id,
      },
      update: {
        title: dto.title,
        lessonSummary: dto.lessonSummary,
        homeworkNotes: dto.homeworkNotes,
        teacherRemarks: dto.teacherRemarks,
      },
      include: { section: { include: { grade: true } } },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'HOME_DIARY_SAVED',
      entityType: 'HomeDiary',
      entityId: diary.id,
    });
    return diary;
  }

  async generateDiary(dto: GenerateDiaryDto, user: AuthUser) {
    const draft = await this.buildDiaryDraft(dto, user);
    return this.createDiary(
      {
        ...dto,
        title: draft.title,
        lessonSummary: draft.lessonSummary,
        homeworkNotes: draft.homeworkNotes,
        teacherRemarks: draft.teacherRemarks,
      },
      user,
    );
  }

  async previewDiary(dto: PreviewDiaryDto, user: AuthUser) {
    return this.buildDiaryDraft(dto, user);
  }

  private async buildDiaryDraft(dto: PreviewDiaryDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const date = new Date(dto.date);
    const lessons = await this.prisma.dailyLesson.findMany({
      where: {
        schoolId,
        sectionId: dto.sectionId,
        date,
        OR: [
          { status: { in: [LessonStatus.CONFIRMED, LessonStatus.READY_FOR_REVIEW] } },
          ...(dto.lessonId ? [{ id: dto.lessonId }] : []),
        ],
      },
      include: { subject: true, sources: { select: { ocrText: true, manualText: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const homework = await this.prisma.homework.findMany({
      where: { schoolId, sectionId: dto.sectionId, dueDate: { gte: date } },
      include: { subject: true },
      take: 10,
      orderBy: { dueDate: 'asc' },
    });

    let lessonSummary = lessons.length
      ? lessons
          .map((l) => {
            const pageText = l.sources
              .map((source) => source.ocrText?.trim() || source.manualText?.trim() || '')
              .filter(Boolean)
              .join('\n');
            const body = pageText || l.topicName || l.chapterName || 'Lesson delivered';
            return `${l.subject.name}:\n${body}`;
          })
          .join('\n\n')
      : 'No confirmed lessons recorded for this date.';

    let homeworkNotes = homework.length
      ? homework.map((h) => `${h.subject.name}: ${h.title}${h.description ? ` — ${h.description}` : ''}`).join('\n')
      : 'No homework assigned.';

    if (this.tenant.isTeacher(user) && !this.tenant.isSchoolAdmin(user)) {
      const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: user.id } });
      const gradeId = lessons[0]?.gradeId;
      if (teacher && gradeId) {
        const saved = await this.gradeStyle.get(teacher.id, gradeId);
        const instruction = dto.instruction?.trim() || saved?.diaryStyle || undefined;
        if (dto.instruction?.trim()) {
          await this.gradeStyle.remember({
            teacherId: teacher.id,
            gradeId,
            schoolId,
            diaryStyle: dto.instruction,
          });
        }
        if (instruction) {
          lessonSummary = applyDiaryStyle(lessonSummary, instruction);
          homeworkNotes = applyDiaryStyle(homeworkNotes, instruction);
        }
      }
    } else if (dto.instruction?.trim()) {
      lessonSummary = applyDiaryStyle(lessonSummary, dto.instruction);
      homeworkNotes = applyDiaryStyle(homeworkNotes, dto.instruction);
    }

    return {
      academicYearId: dto.academicYearId,
      sectionId: dto.sectionId,
      branchId: dto.branchId,
      date: dto.date,
      title: `Home diary ${dto.date}`,
      lessonSummary,
      homeworkNotes,
      teacherRemarks: lessons.length
        ? 'Generated from today’s lessons and assigned homework.'
        : 'Generated with limited lesson data. Please review before sharing.',
    };
  }

  async previewHomework(dto: PreviewHomeworkDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const lesson = await this.prisma.dailyLesson.findFirst({
      where: { id: dto.lessonId, schoolId },
      include: {
        subject: true,
        grade: true,
        concepts: true,
        sources: { select: { ocrText: true, manualText: true } },
      },
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Lesson not found' });
    }
    this.tenant.assertSchoolAccess(user, lesson.schoolId);

    const teacher = await this.prisma.teacherProfile.findUnique({ where: { userId: user.id } });
    if (this.tenant.isTeacher(user) && !this.tenant.isSchoolAdmin(user)) {
      if (!teacher || teacher.id !== lesson.teacherId) {
        throw new ForbiddenException({
          code: 'LESSON_OWNER_REQUIRED',
          message: 'Only the assigned lesson teacher can generate homework',
        });
      }
    }

    const extractedText =
      lesson.sources
        .map((source) => source.ocrText?.trim() || source.manualText?.trim() || '')
        .filter(Boolean)
        .join('\n\n') ||
      lesson.topicName ||
      lesson.chapterName ||
      '';
    const keyPoints = lesson.concepts.map((concept) => concept.name);
    const lessonContent = [
      extractedText,
      keyPoints.length ? `Key points:\n${keyPoints.map((point) => `- ${point}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const saved = teacher ? await this.gradeStyle.get(teacher.id, lesson.gradeId) : null;
    const instruction = dto.instruction?.trim() || saved?.homeworkStyle || undefined;
    if (teacher && dto.instruction?.trim()) {
      await this.gradeStyle.remember({
        teacherId: teacher.id,
        gradeId: lesson.gradeId,
        schoolId,
        homeworkStyle: dto.instruction,
      });
    }

    const fallback = generateStyledHomework({
      subjectName: lesson.subject.name,
      topicName: lesson.topicName,
      extractedText,
      keyPoints,
      instruction,
      gradeName: lesson.grade?.name,
    });

    let generated = fallback;
    try {
      generated = await this.homeworkAi.generate({
        schoolId,
        userId: user.id,
        lessonSummary: lessonContent,
        subjectName: lesson.subject.name,
        gradeName: lesson.grade?.name,
        styleInstruction: instruction,
      });
      if (!generated.description?.trim() || generated.description.trim().length < 20) {
        generated = fallback;
      }
    } catch {
      generated = fallback;
    }

    const dueDate =
      dto.dueDate ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    return {
      lessonId: lesson.id,
      academicYearId: lesson.academicYearId,
      sectionId: lesson.sectionId,
      subjectId: lesson.subjectId,
      branchId: lesson.branchId,
      title: generated.title,
      description: generated.description ?? lessonContent,
      dueDate,
    };
  }

  async listDiaries(
    user: AuthUser,
    query: PaginationDto & { sectionId?: string; date?: string; studentId?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    if (this.tenant.isParent(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent diary list',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    let sectionId = query.sectionId;
    if (query.studentId && !sectionId) {
      const enrollment = await this.prisma.studentEnrollment.findFirst({
        where: { studentId: query.studentId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });
      sectionId = enrollment?.sectionId;
    }
    if (this.tenant.isParent(user) && !sectionId) {
      return paginate([], 0, page, limit);
    }
    const where: Prisma.HomeDiaryWhereInput = {
      schoolId,
      ...(sectionId ? { sectionId } : {}),
      ...(query.date ? { date: new Date(query.date) } : {}),
    };
    const [items, total] = await pageQuery(
      this.prisma.homeDiary.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          date: true,
          title: true,
          lessonSummary: true,
          homeworkNotes: true,
          teacherRemarks: true,
          sectionId: true,
          section: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.homeDiary.count({ where }),
    );
    return paginate(items, total, page, limit);
  }

  async generateHomework(dto: GenerateHomeworkDto, user: AuthUser) {
    const title = dto.title?.trim();
    if (!title) {
      throw new BadRequestException({
        code: 'HOMEWORK_TITLE_REQUIRED',
        message: 'Homework title is required so it can be selected as a quiz topic',
      });
    }
    const schoolId = this.tenant.requireSchoolId(user);
    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, schoolId },
    });
    if (!subject) {
      throw new NotFoundException({ code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' });
    }

    let lessonSummary = 'Complete today’s class practice at home.';
    let lessonId = dto.lessonId;
    if (lessonId) {
      const lesson = await this.prisma.dailyLesson.findFirst({
        where: { id: lessonId, schoolId },
      });
      lessonSummary = lesson?.aiSummary ?? lesson?.topicName ?? lessonSummary;
    } else {
      const latest = await this.prisma.dailyLesson.findFirst({
        where: {
          schoolId,
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          status: LessonStatus.CONFIRMED,
        },
        orderBy: { date: 'desc' },
      });
      if (latest) {
        lessonSummary = latest.aiSummary ?? latest.topicName ?? lessonSummary;
        lessonId = latest.id;
      }
    }

    const generated = await this.homeworkAi.generate({
      schoolId,
      userId: user.id,
      lessonSummary,
      subjectName: subject.name,
    });

    const homework = await this.prisma.homework.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        lessonId,
        createdById: user.id,
        title,
        description: generated.description ?? lessonSummary,
        dueDate: new Date(dto.dueDate),
        publishedAt: new Date(),
      },
      include: { subject: true, section: true },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'HOMEWORK_GENERATED',
      entityType: 'Homework',
      entityId: homework.id,
    });
    return homework;
  }

  async generateReportCards(dto: GenerateReportCardDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const termLabel = dto.termLabel ?? 'Term 1';
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        academicYearId: dto.academicYearId,
        status: 'ACTIVE',
        student: { schoolId },
        ...(dto.sectionId ? { sectionId: dto.sectionId } : {}),
        ...(dto.studentId ? { studentId: dto.studentId } : {}),
      },
      include: { student: true, section: true, grade: true },
    });
    if (!enrollments.length) {
      throw new BadRequestException({
        code: 'NO_ENROLLMENTS',
        message: 'No students found to generate report cards',
      });
    }

    const cards = [];
    for (const enrollment of enrollments) {
      const results = await this.prisma.quizResult.findMany({
        where: {
          studentId: enrollment.studentId,
          quiz: { academicYearId: dto.academicYearId, schoolId },
        },
        include: { quiz: { include: { subject: true } } },
      });
      const attendance = await this.prisma.attendance.findMany({
        where: { studentId: enrollment.studentId, academicYearId: dto.academicYearId },
      });
      const present = attendance.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
      const attendanceRate = attendance.length ? (present / attendance.length) * 100 : 0;

      const bySubject = new Map<string, { total: number; count: number; name: string }>();
      for (const result of results) {
        const subjectId = result.quiz.subjectId;
        const current = bySubject.get(subjectId) ?? { total: 0, count: 0, name: result.quiz.subject.name };
        current.total += Number(result.percentage);
        current.count += 1;
        bySubject.set(subjectId, current);
      }
      const lines = [...bySubject.entries()].map(([subjectId, value]) => {
        const average = value.count ? value.total / value.count : 0;
        return {
          subjectId,
          average: Number(average.toFixed(2)),
          quizzesTaken: value.count,
          gradeLetter: letterGrade(average),
        };
      });
      const overall = lines.length
        ? lines.reduce((sum, line) => sum + line.average, 0) / lines.length
        : 0;

      const card = await this.prisma.reportCard.upsert({
        where: {
          studentId_academicYearId_termLabel: {
            studentId: enrollment.studentId,
            academicYearId: dto.academicYearId,
            termLabel,
          },
        },
        create: {
          schoolId,
          branchId: enrollment.student.branchId,
          academicYearId: dto.academicYearId,
          studentId: enrollment.studentId,
          gradeId: enrollment.gradeId,
          sectionId: enrollment.sectionId,
          termLabel,
          overallPercentage: Number(overall.toFixed(2)),
          attendanceRate: Number(attendanceRate.toFixed(2)),
          remarks: overall >= 70 ? 'Good progress. Keep it up.' : 'Needs more practice and regular attendance.',
          generatedById: user.id,
          lines: { create: lines },
        },
        update: {
          overallPercentage: Number(overall.toFixed(2)),
          attendanceRate: Number(attendanceRate.toFixed(2)),
          generatedById: user.id,
          lines: {
            deleteMany: {},
            create: lines,
          },
        },
        include: {
          student: true,
          grade: true,
          section: true,
          academicYear: true,
          lines: { include: { subject: true } },
        },
      });
      cards.push(card);
    }

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'REPORT_CARDS_GENERATED',
      entityType: 'ReportCard',
      metadata: { count: cards.length, termLabel },
    });
    return { generated: cards.length, items: cards };
  }

  async listReportCards(
    user: AuthUser,
    query: PaginationDto & { studentId?: string; sectionId?: string; academicYearId?: string },
  ) {
    const schoolId = this.tenant.requireSchoolId(user);
    if (this.tenant.isParent(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent report cards',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.ReportCardWhereInput = {
      schoolId,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    };
    const [items, total] = await pageQuery(
      this.prisma.reportCard.findMany({
        where,
        orderBy: { generatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          termLabel: true,
          overallPercentage: true,
          attendanceRate: true,
          remarks: true,
          generatedAt: true,
          student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
          grade: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          academicYear: { select: { id: true, name: true } },
          lines: {
            select: {
              average: true,
              gradeLetter: true,
              subject: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.reportCard.count({ where }),
    );
    return paginate(items, total, page, limit);
  }

  async generateIdCards(dto: GenerateIdCardDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) {
      throw new NotFoundException({ code: 'SCHOOL_NOT_FOUND', message: 'School not found' });
    }

    const cards = [];
    if (dto.teacherId) {
      const teacher = await this.prisma.teacherProfile.findFirst({
        where: { id: dto.teacherId, schoolId },
        include: { user: true, branch: true },
      });
      if (!teacher) {
        throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
      }
      cards.push(
        await this.upsertTeacherCard(schoolId, teacher, user.id),
      );
    } else {
      const students = await this.prisma.student.findMany({
        where: {
          schoolId,
          status: 'ACTIVE',
          ...(dto.studentId ? { id: dto.studentId } : {}),
          ...(dto.sectionId
            ? { enrollments: { some: { sectionId: dto.sectionId, status: 'ACTIVE' } } }
            : {}),
        },
        include: {
          branch: true,
          enrollments: {
            where: { status: 'ACTIVE' },
            include: { grade: true, section: true },
            take: 1,
          },
          parents: { include: { parent: { include: { user: true } } }, take: 1 },
        },
      });
      if (!students.length) {
        throw new BadRequestException({ code: 'NO_STUDENTS', message: 'No students found for ID cards' });
      }
      for (const student of students) {
        cards.push(await this.upsertStudentCard(school, student, user.id));
      }
    }

    return { generated: cards.length, items: cards };
  }

  async listIdCards(user: AuthUser, query: PaginationDto & { studentId?: string; search?: string }) {
    const schoolId = this.tenant.requireSchoolId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.IdCardWhereInput = {
      schoolId,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.search
        ? {
            OR: [
              { cardNumber: { contains: query.search } },
              { student: { firstName: { contains: query.search } } },
              { student: { lastName: { contains: query.search } } },
              { student: { studentCode: { contains: query.search } } },
              { student: { admissionNumber: { contains: query.search } } },
              {
                student: {
                  parents: {
                    some: {
                      parent: {
                        OR: [
                          { phone: { contains: query.search } },
                          { user: { phone: { contains: query.search } } },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await pageQuery(
      this.prisma.idCard.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentCode: true,
              admissionNumber: true,
              photoUrl: true,
              address: true,
              enrollments: {
                where: { status: 'ACTIVE' },
                take: 1,
                select: {
                  grade: { select: { id: true, name: true } },
                  section: { select: { id: true, name: true } },
                },
              },
              parents: {
                select: {
                  relationship: true,
                  isPrimary: true,
                  parent: {
                    select: {
                      phone: true,
                      user: { select: { firstName: true, lastName: true, email: true, phone: true } },
                    },
                  },
                },
              },
            },
          },
          teacher: {
            select: {
              id: true,
              employeeCode: true,
              user: { select: { firstName: true, lastName: true, email: true, phone: true } },
            },
          },
          school: { select: { name: true, code: true, city: true } },
          branch: { select: { name: true } },
        },
      }),
      this.prisma.idCard.count({ where }),
    );
    return paginate(items, total, page, limit);
  }

  private async upsertStudentCard(
    school: { id: string; name: string },
    student: {
      id: string;
      branchId: string;
      studentCode: string;
    },
    userId: string,
  ) {
    const cardNumber = `STU-${student.studentCode}`;
    return this.prisma.idCard.upsert({
      where: { schoolId_cardNumber: { schoolId: school.id, cardNumber } },
      create: {
        schoolId: school.id,
        branchId: student.branchId,
        holderType: 'STUDENT',
        studentId: student.id,
        cardNumber,
        generatedById: userId,
      },
      update: { generatedById: userId },
      include: {
        student: {
          include: {
            enrollments: {
              where: { status: 'ACTIVE' },
              include: { grade: true, section: true },
              take: 1,
            },
            parents: { include: { parent: { include: { user: true } } } },
          },
        },
        school: { select: { name: true, code: true, city: true } },
        branch: { select: { name: true } },
      },
    });
  }

  private async upsertTeacherCard(
    schoolId: string,
    teacher: { id: string; branchId: string; employeeCode: string },
    userId: string,
  ) {
    const cardNumber = `TCH-${teacher.employeeCode}`;
    return this.prisma.idCard.upsert({
      where: { schoolId_cardNumber: { schoolId, cardNumber } },
      create: {
        schoolId,
        branchId: teacher.branchId,
        holderType: 'TEACHER',
        teacherId: teacher.id,
        cardNumber,
        generatedById: userId,
      },
      update: { generatedById: userId },
      include: {
        teacher: { include: { user: true } },
        school: { select: { name: true, code: true, city: true } },
        branch: { select: { name: true } },
      },
    });
  }
}
