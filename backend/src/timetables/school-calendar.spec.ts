import { AnnouncementAudience, CalendarDayKind, EventType, Weekday } from '@prisma/client';
import { isWorkingDay } from './school-calendar';

describe('school-calendar.isWorkingDay', () => {
  const section = { id: 'sec-1', gradeId: 'grade-1', branchId: 'branch-1' };
  const tz = 'Asia/Karachi';

  it('defaults Monday–Friday to working', () => {
    const r = isWorkingDay('2026-04-06', { tz, section, calendarDays: [], holidayEvents: [] });
    expect(r.working).toBe(true);
    expect(r.timetableWeekday).toBe(Weekday.MONDAY);
  });

  it('marks weekends non-working', () => {
    const r = isWorkingDay('2026-04-05', { tz, section, calendarDays: [], holidayEvents: [] });
    expect(r.working).toBe(false);
    expect(r.reason).toBe('Weekend');
  });

  it('prefers calendar override over holiday event at equal section scope', () => {
    const r = isWorkingDay('2026-04-07', {
      tz,
      section,
      calendarDays: [
        {
          date: '2026-04-07',
          kind: CalendarDayKind.WORKING,
          scopeKey: `SECTION:${section.id}`,
          followsWeekday: Weekday.WEDNESDAY,
          reason: 'Special session',
        },
      ],
      holidayEvents: [
        {
          type: EventType.HOLIDAY,
          title: 'Holiday',
          startDate: new Date('2026-04-07T00:00:00.000Z'),
          endDate: new Date('2026-04-07T23:59:59.000Z'),
          audience: AnnouncementAudience.SECTION,
          branchId: section.branchId,
          gradeId: section.gradeId,
          sectionId: section.id,
        },
      ],
    });
    expect(r.working).toBe(true);
    expect(r.timetableWeekday).toBe(Weekday.WEDNESDAY);
  });
});
