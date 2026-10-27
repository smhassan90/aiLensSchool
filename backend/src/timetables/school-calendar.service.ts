import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CalendarDayKind, EventType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../common/services/tenant.service';
import { AuthUser } from '../common/types/auth-user.type';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_SCHOOL_TIMEZONE, dateFromIso } from '../teachers/teacher-checkin';
import { CreateSchoolCalendarDayDto } from './dto/school-calendar.dto';
import { isWorkingDay, listDatesInclusive } from './school-calendar';

@Injectable()
export class SchoolCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly audit: AuditService,
  ) {}

  private scopeKey(dto: CreateSchoolCalendarDayDto): string {
    if (dto.scope === 'ALL') return 'ALL';
    if (dto.scope === 'GRADE') return `GRADE:${dto.gradeId}`;
    return `SECTION:${dto.sectionId}`;
  }

  async listDays(user: AuthUser, from: string, to: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const days = await this.prisma.schoolCalendarDay.findMany({
      where: { schoolId, date: { gte: dateFromIso(from), lte: dateFromIso(to) } },
      orderBy: [{ date: 'asc' }, { scopeKey: 'asc' }],
    });
    const holidays = await this.prisma.event.findMany({
      where: {
        schoolId,
        type: EventType.HOLIDAY,
        startDate: { lte: dateFromIso(to) },
        endDate: { gte: dateFromIso(from) },
      },
      orderBy: { startDate: 'asc' },
    });
    return { days, holidays };
  }

  async createDay(user: AuthUser, dto: CreateSchoolCalendarDayDto) {
    const schoolId = this.tenant.requireSchoolId(user);
    const scopeKey = this.scopeKey(dto);
    try {
      const row = await this.prisma.schoolCalendarDay.create({
        data: {
          schoolId,
          date: dateFromIso(dto.date),
          kind: dto.kind,
          scopeKey,
          gradeId: dto.gradeId ?? null,
          sectionId: dto.sectionId ?? null,
          followsWeekday: dto.followsWeekday ?? null,
          reason: dto.reason,
          createdById: user.id,
        },
      });
      void this.audit.log({
        actorUserId: user.id,
        schoolId,
        action: 'CALENDAR_DAY_CREATED',
        entityType: 'SchoolCalendarDay',
        entityId: row.id,
        metadata: { date: dto.date, scopeKey },
      });
      return row;
    } catch {
      throw new ConflictException({
        code: 'CALENDAR_DAY_EXISTS',
        message: 'A calendar override already exists for this date and scope',
      });
    }
  }

  async deleteDay(user: AuthUser, id: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const row = await this.prisma.schoolCalendarDay.findFirst({ where: { id, schoolId } });
    if (!row) throw new NotFoundException({ code: 'CALENDAR_DAY_NOT_FOUND', message: 'Calendar day not found' });
    await this.prisma.schoolCalendarDay.delete({ where: { id } });
    void this.audit.log({
      actorUserId: user.id,
      schoolId,
      action: 'CALENDAR_DAY_DELETED',
      entityType: 'SchoolCalendarDay',
      entityId: id,
    });
    return { deleted: true };
  }

  async workingDays(user: AuthUser, sectionId: string, from: string, to: string) {
    const schoolId = this.tenant.requireSchoolId(user);
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, schoolId },
      select: { id: true, gradeId: true, branchId: true },
    });
    if (!section) throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Section not found' });

    const settings = await this.prisma.schoolSettings.findUnique({ where: { schoolId } });
    const tz = settings?.timezone ?? DEFAULT_SCHOOL_TIMEZONE;
    const calendarDays = await this.prisma.schoolCalendarDay.findMany({
      where: { schoolId, date: { gte: dateFromIso(from), lte: dateFromIso(to) } },
    });
    const holidays = await this.prisma.event.findMany({
      where: {
        schoolId,
        type: EventType.HOLIDAY,
        startDate: { lte: dateFromIso(to) },
        endDate: { gte: dateFromIso(from) },
      },
    });

    return listDatesInclusive(from, to).map((date) => {
      const r = isWorkingDay(date, { tz, section, calendarDays, holidayEvents: holidays });
      return { date, working: r.working, reason: r.reason, timetableWeekday: r.timetableWeekday };
    });
  }
}
