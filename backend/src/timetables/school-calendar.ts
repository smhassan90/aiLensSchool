import { AnnouncementAudience, CalendarDayKind, EventType, Weekday } from '@prisma/client';
import { dateFromIso, zonedDateIso } from '../teachers/teacher-checkin';

export type SchoolCalendarDayRow = {
  date: Date | string;
  kind: CalendarDayKind;
  scopeKey: string;
  followsWeekday: Weekday | null;
  reason: string;
};

export type HolidayEventRow = {
  type: EventType;
  title: string;
  startDate: Date;
  endDate: Date;
  audience: AnnouncementAudience;
  branchId: string | null;
  gradeId: string | null;
  sectionId: string | null;
};

export type WorkingDayResult = {
  working: boolean;
  timetableWeekday: Weekday | null;
  reason: string | null;
};

export type WorkingDayContext = {
  tz: string;
  section: { id: string; gradeId: string; branchId: string };
  calendarDays: SchoolCalendarDayRow[];
  holidayEvents: HolidayEventRow[];
};

// Weekday enum is Mon–Fri only; map JS Sunday/Saturday separately.
function weekdayOfDateIso(dateIso: string): Weekday | null {
  const d = dateFromIso(dateIso);
  const js = d.getUTCDay();
  if (js === 0 || js === 6) return null;
  const map: Record<number, Weekday> = {
    1: Weekday.MONDAY,
    2: Weekday.TUESDAY,
    3: Weekday.WEDNESDAY,
    4: Weekday.THURSDAY,
    5: Weekday.FRIDAY,
  };
  return map[js] ?? null;
}

function calendarDateIso(row: SchoolCalendarDayRow): string {
  if (typeof row.date === 'string') return row.date.slice(0, 10);
  return row.date.toISOString().slice(0, 10);
}

function scopeSpecificity(scopeKey: string): number {
  if (scopeKey.startsWith('SECTION:')) return 3;
  if (scopeKey.startsWith('GRADE:')) return 2;
  if (scopeKey === 'ALL') return 1;
  return 0;
}

function eventAudienceSpecificity(audience: AnnouncementAudience): number {
  switch (audience) {
    case AnnouncementAudience.SECTION:
      return 3;
    case AnnouncementAudience.GRADE:
      return 2;
    case AnnouncementAudience.BRANCH:
      return 1;
    default:
      return 1;
  }
}

function eventMatchesSection(
  e: HolidayEventRow,
  section: { id: string; gradeId: string; branchId: string },
): boolean {
  switch (e.audience) {
    case AnnouncementAudience.SECTION:
      return e.sectionId === section.id;
    case AnnouncementAudience.GRADE:
      return e.gradeId === section.gradeId;
    case AnnouncementAudience.BRANCH:
      return e.branchId === section.branchId;
    case AnnouncementAudience.ALL_SCHOOL:
      return true;
    default:
      return false;
  }
}

function eventCoversDate(e: HolidayEventRow, dateIso: string, tz: string): boolean {
  const start = zonedDateIso(e.startDate, tz);
  const end = zonedDateIso(e.endDate, tz);
  return start <= dateIso && dateIso <= end;
}

type Candidate = {
  specificity: number;
  source: 'CAL' | 'EVENT';
  kind: CalendarDayKind;
  followsWeekday: Weekday | null;
  reason: string;
};

export function isWorkingDay(dateIso: string, ctx: WorkingDayContext): WorkingDayResult {
  const { section, calendarDays, holidayEvents, tz } = ctx;
  const candidates: Candidate[] = [];

  for (const d of calendarDays) {
    if (calendarDateIso(d) !== dateIso) continue;
    const sid = `SECTION:${section.id}`;
    const gid = `GRADE:${section.gradeId}`;
    if (![sid, gid, 'ALL'].includes(d.scopeKey)) continue;
    candidates.push({
      specificity: scopeSpecificity(d.scopeKey),
      source: 'CAL',
      kind: d.kind,
      followsWeekday: d.followsWeekday,
      reason: d.reason,
    });
  }

  for (const e of holidayEvents) {
    if (e.type !== EventType.HOLIDAY) continue;
    if (!eventCoversDate(e, dateIso, tz)) continue;
    if (!eventMatchesSection(e, section)) continue;
    candidates.push({
      specificity: eventAudienceSpecificity(e.audience),
      source: 'EVENT',
      kind: CalendarDayKind.NON_WORKING,
      followsWeekday: null,
      reason: e.title,
    });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (b.specificity !== a.specificity) return b.specificity - a.specificity;
      if (a.source === 'CAL' && b.source === 'EVENT') return -1;
      if (a.source === 'EVENT' && b.source === 'CAL') return 1;
      return 0;
    });
    const picked = candidates[0];
    if (picked.kind === CalendarDayKind.WORKING) {
      const tw = picked.followsWeekday ?? weekdayOfDateIso(dateIso);
      return { working: true, timetableWeekday: tw, reason: picked.reason };
    }
    return { working: false, timetableWeekday: null, reason: picked.reason };
  }

  const wd = weekdayOfDateIso(dateIso);
  if (wd) {
    return { working: true, timetableWeekday: wd, reason: null };
  }
  return { working: false, timetableWeekday: null, reason: 'Weekend' };
}

export function listDatesInclusive(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const cur = dateFromIso(fromIso);
  const end = dateFromIso(toIso);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
