import type { PlannerVersionPayload } from "@/services/academic-planner.service";

export type PlannerLesson = PlannerVersionPayload["lessons"][number];
export type CalendarDay = PlannerVersionPayload["calendar"]["days"][number];
export type CalendarSlot = CalendarDay["slots"][number];

export type CalendarWeek = {
  weekStart: string;
  days: CalendarDay[];
};

export type TimelineDay = {
  date: string;
  working: boolean;
  reason: string | null;
  lessons: PlannerLesson[];
};

export type OutlineChapter = {
  chapterKey: string;
  title: string;
  lessons: PlannerLesson[];
};

export type DropSlot = {
  date: string;
  periodNumber: number;
};

export type DropCheck = { allowed: boolean; reason?: string };

export function findLesson(
  payload: PlannerVersionPayload,
  lessonKey: string,
): PlannerLesson | undefined {
  return payload.lessons.find((l) => l.lessonKey === lessonKey);
}

function dayByDate(payload: PlannerVersionPayload, date: string): CalendarDay | undefined {
  return payload.calendar.days.find((d) => d.date === date);
}

function lessonAtSlot(
  payload: PlannerVersionPayload,
  date: string,
  periodNumber: number,
): PlannerLesson | undefined {
  return payload.lessons.find(
    (l) => l.date === date && l.periodNumber === periodNumber,
  );
}

function dependenciesMet(lesson: PlannerLesson, payload: PlannerVersionPayload, beforeDate: string): boolean {
  for (const depKey of lesson.dependsOnKeys) {
    const dep = findLesson(payload, depKey);
    if (!dep) continue;
    if (!dep.date || dep.date > beforeDate) {
      return false;
    }
  }
  return true;
}

export function canDropAt(
  lesson: PlannerLesson,
  slot: DropSlot,
  payload: PlannerVersionPayload,
): DropCheck {
  if (lesson.frozen) {
    return { allowed: false, reason: "This lesson is frozen and cannot be moved." };
  }
  const day = dayByDate(payload, slot.date);
  if (!day) {
    return { allowed: false, reason: "That date is outside the planner calendar." };
  }
  if (!day.working) {
    return { allowed: false, reason: day.reason ?? "Not a teaching day." };
  }
  const calendarSlot = day.slots.find((s) => s.periodNumber === slot.periodNumber);
  if (!calendarSlot) {
    return { allowed: false, reason: "No period at that time on this day." };
  }
  if (calendarSlot.reserved === "REVISION" && lesson.kind !== "REVISION") {
    return { allowed: false, reason: "This slot is reserved for revision." };
  }
  const occupant = lessonAtSlot(payload, slot.date, slot.periodNumber);
  if (occupant && occupant.lessonKey !== lesson.lessonKey) {
    return { allowed: false, reason: "Another lesson is already scheduled in this slot." };
  }
  if (!dependenciesMet(lesson, payload, slot.date)) {
    return { allowed: false, reason: "A prerequisite lesson is scheduled after this date." };
  }
  if (slot.date > payload.calendar.lastTeachingDate) {
    return { allowed: false, reason: "This date is after the last teaching day before the exam." };
  }
  return { allowed: true };
}

export function toCalendarWeeks(payload: PlannerVersionPayload): CalendarWeek[] {
  const days = [...payload.calendar.days].sort((a, b) => a.date.localeCompare(b.date));
  const weeks: CalendarWeek[] = [];
  let current: CalendarDay[] = [];

  for (const day of days) {
    current.push(day);
    const weekday = new Date(`${day.date}T12:00:00.000Z`).getUTCDay();
    if (weekday === 5 || day.date === days[days.length - 1]?.date) {
      if (current.length) {
        weeks.push({ weekStart: current[0].date, days: [...current] });
        current = [];
      }
    }
  }
  if (current.length) {
    weeks.push({ weekStart: current[0].date, days: current });
  }
  return weeks;
}

export function toTimeline(payload: PlannerVersionPayload): {
  scheduled: TimelineDay[];
  unscheduled: PlannerLesson[];
} {
  const byDate = new Map<string, PlannerLesson[]>();
  const unscheduled: PlannerLesson[] = [];

  for (const lesson of payload.lessons) {
    if (!lesson.date) {
      unscheduled.push(lesson);
      continue;
    }
    const list = byDate.get(lesson.date) ?? [];
    list.push(lesson);
    byDate.set(lesson.date, list);
  }

  const scheduled: TimelineDay[] = payload.calendar.days
    .filter((d) => d.working || byDate.has(d.date))
    .map((d) => ({
      date: d.date,
      working: d.working,
      reason: d.reason,
      lessons: (byDate.get(d.date) ?? []).sort(
        (a, b) => (a.periodNumber ?? 0) - (b.periodNumber ?? 0),
      ),
    }))
    .filter((row) => row.lessons.length > 0 || row.working);

  unscheduled.sort((a, b) => a.sequence - b.sequence);
  return { scheduled, unscheduled };
}

export function toOutline(payload: PlannerVersionPayload): OutlineChapter[] {
  const chapterTitle = new Map<string, string>();
  for (const ch of payload.chapters) {
    const key = String(ch.chapterKey ?? "");
    const title = String(ch.title ?? "Chapter");
    if (key) chapterTitle.set(key, title);
  }

  const groups = new Map<string, PlannerLesson[]>();
  for (const lesson of payload.lessons) {
    const key = lesson.chapterKey ?? "_none";
    const list = groups.get(key) ?? [];
    list.push(lesson);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([chapterKey, lessons]) => ({
      chapterKey,
      title: chapterKey === "_none" ? "Other" : chapterTitle.get(chapterKey) ?? chapterKey,
      lessons: [...lessons].sort((a, b) => a.sequence - b.sequence),
    }))
    .sort((a, b) => (a.lessons[0]?.sequence ?? 0) - (b.lessons[0]?.sequence ?? 0));
}
