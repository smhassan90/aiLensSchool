import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { PaginationDto, pageQuery, paginate } from '../common/dto/pagination.dto';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { ParentsService } from '../parents/parents.service';

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenant: TenantService,
    private readonly parentsService: ParentsService,
  ) {}

  async create(dto: CreateHomeworkDto, user: AuthUser) {
    const schoolId = this.tenant.requireSchoolId(user);
    const isAdmin = this.tenant.isSchoolAdmin(user);
    if (!isAdmin) {
      const teacher = await this.prisma.teacherProfile.findUnique({
        where: { userId: user.id },
      });
      if (!teacher) {
        throw new ForbiddenException({
          code: 'TEACHER_REQUIRED',
          message: 'Only teachers can create homework',
        });
      }

      const assignment = await this.prisma.classSubject.findFirst({
        where: {
          sectionId: dto.sectionId,
          subjectId: dto.subjectId,
          academicYearId: dto.academicYearId,
          OR: [{ teacherId: teacher.id }, { assistantTeacherId: teacher.id }],
        },
      });
      if (!assignment) {
        throw new ForbiddenException({
          code: 'CLASS_SUBJECT_NOT_ASSIGNED',
          message: 'Teacher is not assigned to this class/subject',
        });
      }
    }

    const homework = await this.prisma.homework.create({
      data: {
        schoolId,
        branchId: dto.branchId,
        academicYearId: dto.academicYearId,
        sectionId: dto.sectionId,
        subjectId: dto.subjectId,
        lessonId: dto.lessonId,
        createdById: user.id,
        title: dto.title,
        description: dto.description,
        dueDate: new Date(dto.dueDate),
        publishedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId: user.id,
      schoolId,
      branchId: dto.branchId,
      action: 'HOMEWORK_CREATED',
      entityType: 'Homework',
      entityId: homework.id,
    });

    return homework;
  }

  async findAll(
    user: AuthUser,
    query: PaginationDto & { sectionId?: string; subjectId?: string; studentId?: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (this.tenant.isParent(user)) {
      if (!query.studentId) {
        throw new ForbiddenException({
          code: 'STUDENT_ID_REQUIRED',
          message: 'studentId is required for parent homework list',
        });
      }
      await this.parentsService.assertParentOwnsStudent(user.id, query.studentId);
      const enrollment = await this.prisma.studentEnrollment.findFirst({
        where: { studentId: query.studentId, status: 'ACTIVE' },
      });
      if (!enrollment) {
        return paginate([], 0, page, limit);
      }
      const where: Prisma.HomeworkWhereInput = {
        sectionId: enrollment.sectionId,
        schoolId: this.tenant.requireSchoolId(user),
      };
      const [items, total] = await pageQuery(
        this.prisma.homework.findMany({
          where,
          orderBy: { dueDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            title: true,
            dueDate: true,
            sectionId: true,
            subjectId: true,
            lessonId: true,
            createdAt: true,
            subject: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
          },
        }),
        this.prisma.homework.count({ where }),
      );
      return paginate(items, total, page, limit);
    }

    const schoolId = this.tenant.requireSchoolId(user);
    const where: Prisma.HomeworkWhereInput = {
      schoolId,
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(this.tenant.isTeacher(user) && !this.tenant.isSchoolAdmin(user)
        ? { createdById: user.id }
        : {}),
    };

    const [items, total] = await pageQuery(
      this.prisma.homework.findMany({
        where,
        orderBy: { dueDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          dueDate: true,
          sectionId: true,
          subjectId: true,
          lessonId: true,
          createdAt: true,
          subject: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
        },
      }),
      this.prisma.homework.count({ where }),
    );
    return paginate(items, total, page, limit);
  }

  async findOne(id: string, user: AuthUser) {
    const homework = await this.prisma.homework.findUnique({
      where: { id },
      include: { subject: true, section: true, attachments: true },
    });
    if (!homework) {
      throw new NotFoundException({ code: 'HOMEWORK_NOT_FOUND', message: 'Homework not found' });
    }
    this.tenant.assertSchoolAccess(user, homework.schoolId);
    return homework;
  }
}
