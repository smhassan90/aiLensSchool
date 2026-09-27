import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AIRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LocalStorageService } from '../files/local-storage.service';
import { PurgePlatformDataDto } from './dto/purge-platform-data.dto';

function parseDateRange(from: string, to: string) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException({ code: 'INVALID_DATE_RANGE', message: 'Invalid from/to dates' });
  }
  end.setHours(23, 59, 59, 999);
  if (end < start) {
    throw new BadRequestException({ code: 'INVALID_DATE_RANGE', message: '"to" must be on or after "from"' });
  }
  return { start, end };
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: LocalStorageService,
  ) {}

  async listSchoolAiUsage() {
    const schools = await this.prisma.school.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, status: true, city: true },
    });
    const grouped = await this.prisma.aIRequest.groupBy({
      by: ['schoolId'],
      where: { schoolId: { not: null }, status: AIRequestStatus.COMPLETED },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { id: true },
    });
    const bySchool = new Map(
      grouped
        .filter((row) => row.schoolId)
        .map((row) => [
          row.schoolId!,
          {
            requestCount: row._count.id,
            inputTokens: row._sum.inputTokens ?? 0,
            outputTokens: row._sum.outputTokens ?? 0,
            totalTokens: (row._sum.inputTokens ?? 0) + (row._sum.outputTokens ?? 0),
          },
        ]),
    );
    return schools.map((school) => ({
      ...school,
      ai: bySchool.get(school.id) ?? {
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
    }));
  }

  async getSchoolAiUsage(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, code: true, status: true },
    });
    if (!school) {
      throw new NotFoundException({ code: 'SCHOOL_NOT_FOUND', message: 'School not found' });
    }

    const teachers = await this.prisma.teacherProfile.findMany({
      where: { schoolId },
      orderBy: { employeeCode: 'asc' },
      select: {
        id: true,
        employeeCode: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    const userIds = teachers.map((t) => t.user.id);
    const usageByUser =
      userIds.length === 0
        ? []
        : await this.prisma.aIRequest.groupBy({
            by: ['userId'],
            where: {
              schoolId,
              userId: { in: userIds },
              status: AIRequestStatus.COMPLETED,
            },
            _sum: { inputTokens: true, outputTokens: true },
            _count: { id: true },
          });
    const usageMap = new Map(
      usageByUser.map((row) => [
        row.userId,
        {
          requestCount: row._count.id,
          inputTokens: row._sum.inputTokens ?? 0,
          outputTokens: row._sum.outputTokens ?? 0,
          totalTokens: (row._sum.inputTokens ?? 0) + (row._sum.outputTokens ?? 0),
        },
      ]),
    );

    const schoolTotals = await this.prisma.aIRequest.aggregate({
      where: { schoolId, status: AIRequestStatus.COMPLETED },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { id: true },
    });

    return {
      school,
      totals: {
        requestCount: schoolTotals._count.id,
        inputTokens: schoolTotals._sum.inputTokens ?? 0,
        outputTokens: schoolTotals._sum.outputTokens ?? 0,
        totalTokens: (schoolTotals._sum.inputTokens ?? 0) + (schoolTotals._sum.outputTokens ?? 0),
      },
      teachers: teachers.map((teacher) => ({
        id: teacher.id,
        employeeCode: teacher.employeeCode,
        name: `${teacher.user.firstName} ${teacher.user.lastName}`.trim(),
        email: teacher.user.email,
        userId: teacher.user.id,
        ai: usageMap.get(teacher.user.id) ?? {
          requestCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
      })),
    };
  }

  async getTeacherLessonTrail(schoolId: string, teacherId: string) {
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: teacherId, schoolId },
      select: {
        id: true,
        employeeCode: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!teacher) {
      throw new NotFoundException({ code: 'TEACHER_NOT_FOUND', message: 'Teacher not found' });
    }

    const lessons = await this.prisma.dailyLesson.findMany({
      where: { schoolId, teacherId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        subject: { select: { name: true } },
        grade: { select: { name: true } },
        section: { select: { name: true } },
        sources: {
          include: {
            fileAsset: {
              select: { id: true, url: true, originalFilename: true, mimeType: true },
            },
          },
        },
        homework: {
          select: {
            id: true,
            title: true,
            description: true,
            answerKey: true,
            questionsJson: true,
            createdAt: true,
          },
        },
        concepts: { select: { name: true } },
      },
    });

    const aiRequests = await this.prisma.aIRequest.findMany({
      where: { schoolId, userId: teacher.user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        type: true,
        provider: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        status: true,
        metadata: true,
        createdAt: true,
      },
    });

    return {
      teacher: {
        id: teacher.id,
        employeeCode: teacher.employeeCode,
        name: `${teacher.user.firstName} ${teacher.user.lastName}`.trim(),
        email: teacher.user.email,
        userId: teacher.user.id,
      },
      lessons: lessons.map((lesson) => {
        const pageImages = lesson.sources
          .filter((s) => s.fileAsset)
          .map((s) => ({
            sourceId: s.id,
            page: s.pageFrom,
            url: s.fileAsset!.url,
            filename: s.fileAsset!.originalFilename,
            mimeType: s.fileAsset!.mimeType,
          }));
        const textSource = lesson.sources.find((s) => s.ocrText && !s.fileAssetId) ?? lesson.sources[0];
        const rawOcr =
          lesson.sources.find((s) => s.type === 'MANUAL_TEXT')?.ocrText ??
          textSource?.ocrText ??
          null;
        const aiText = lesson.aiSummary ?? textSource?.manualText ?? null;
        return {
          id: lesson.id,
          date: lesson.date,
          status: lesson.status,
          chapterName: lesson.chapterName,
          topicName: lesson.topicName,
          subjectName: lesson.subject.name,
          classLabel: `${lesson.grade.name} · ${lesson.section.name}`,
          pageImages,
          rawOcrText: rawOcr,
          aiGeneratedText: aiText,
          concepts: lesson.concepts.map((c) => c.name),
          homework: lesson.homework,
          createdAt: lesson.createdAt,
        };
      }),
      aiRequests,
    };
  }

  async listActivity(query: {
    schoolId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    const createdAt: Prisma.DateTimeFilter | undefined =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: parseDateRange(query.from ?? query.to, query.to).end } : {}),
          }
        : undefined;

    const auditWhere: Prisma.AuditLogWhereInput = {
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const aiWhere: Prisma.AIRequestWhereInput = {
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [auditItems, auditTotal, aiItems, aiTotal] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: auditWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
          school: { select: { id: true, name: true } },
        },
      }),
      this.prisma.auditLog.count({ where: auditWhere }),
      this.prisma.aIRequest.findMany({
        where: aiWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          school: { select: { id: true, name: true } },
        },
      }),
      this.prisma.aIRequest.count({ where: aiWhere }),
    ]);

    return {
      audit: { items: auditItems, total: auditTotal, page, limit },
      ai: { items: aiItems, total: aiTotal, page, limit },
    };
  }

  async purgeData(dto: PurgePlatformDataDto, actorUserId: string) {
    if (!dto.confirm) {
      throw new BadRequestException({
        code: 'CONFIRM_REQUIRED',
        message: 'Set confirm=true to purge data in the selected date range',
      });
    }
    const { start, end } = parseDateRange(dto.from, dto.to);
    const schoolFilter = dto.schoolId ? { schoolId: dto.schoolId } : {};

    const lessons = await this.prisma.dailyLesson.findMany({
      where: { ...schoolFilter, createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        sources: { select: { fileAsset: { select: { storageKey: true } } } },
      },
    });
    for (const lesson of lessons) {
      for (const source of lesson.sources) {
        const key = source.fileAsset?.storageKey;
        if (key) await this.storage.delete(key);
      }
    }

    const [auditDeleted, aiDeleted, lessonsDeleted] = await this.prisma.$transaction([
      this.prisma.auditLog.deleteMany({
        where: { ...schoolFilter, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.aIRequest.deleteMany({
        where: { ...schoolFilter, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.dailyLesson.deleteMany({
        where: { ...schoolFilter, createdAt: { gte: start, lte: end } },
      }),
    ]);

    await this.audit.log({
      actorUserId,
      schoolId: dto.schoolId ?? null,
      action: 'PLATFORM_DATA_PURGED',
      entityType: 'Platform',
      metadata: {
        from: dto.from,
        to: dto.to,
        auditDeleted: auditDeleted.count,
        aiDeleted: aiDeleted.count,
        lessonsDeleted: lessonsDeleted.count,
      },
    });

    return {
      auditDeleted: auditDeleted.count,
      aiDeleted: aiDeleted.count,
      lessonsDeleted: lessonsDeleted.count,
    };
  }
}
