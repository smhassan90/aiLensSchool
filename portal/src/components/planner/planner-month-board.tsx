"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fixDisplayText } from "@/lib/fix-display-text";
import {
  activityTitle,
  plannerDaySummary,
  plannerDayWord,
  shortChapterName,
  type PlannerDayWord,
} from "@/lib/planner-day-kind";
import type { PlannerLesson } from "@/lib/planner-view-model";
import { academicPlannerService, type PlannerVersionPayload } from "@/services/academic-planner.service";
import { friendlyApiErrorMessage } from "@/lib/display-labels";
import { cn, formatDate } from "@/lib/utils";
import { useToast } from "@/providers/toast-provider";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const WORD_CLASS: Record<PlannerDayWord, string> = {
  Reading: "border-primary/40 bg-primary/10 text-primary",
  Exercises: "border-amber-300 bg-amber-50 text-amber-950",
  Revision: "border-slate-300 bg-slate-100 text-slate-800",
  Activity: "border-emerald-400 bg-emerald-50 text-emerald-950",
};

type PlannerMonthBoardProps = {
  plannerId: string;
  versionId: string;
  lessons: PlannerLesson[];
  calendar: PlannerVersionPayload["calendar"];
  chapterTitle: (chapterKey: string | null) => string | null;
  readOnly?: boolean;
  canEdit?: boolean;
  onEdit?: (lesson: PlannerLesson) => void;
  onMove?: (lesson: PlannerLesson) => void;
};

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthsInRange(from: string, to: string): string[] {
  if (!from || !to) return [];
  const start = new Date(`${from.slice(0, 10)}T12:00:00Z`);
  const end = new Date(`${to.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const out: string[] = [];
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  const endIndex = end.getUTCFullYear() * 12 + end.getUTCMonth();
  while (year * 12 + month <= endIndex && out.length < 18) {
    out.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return out;
}

function monthCells(key: string): Array<string | null> {
  const [yearText, monthText] = key.split("-");
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${key}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

function monthLabel(key: string) {
  return new Date(`${key}-01T12:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function PlannerMonthBoard({
  plannerId,
  versionId,
  lessons,
  calendar,
  chapterTitle,
  readOnly,
  canEdit,
  onEdit,
  onMove,
}: PlannerMonthBoardProps) {
  const { toast } = useToast();
  const months = useMemo(
    () => monthsInRange(calendar.from, calendar.to),
    [calendar.from, calendar.to],
  );
  const today = todayIso();
  const initialMonth = months.includes(monthKey(today)) ? monthKey(today) : months[0] ?? monthKey(today);
  const [month, setMonth] = useState(initialMonth);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showUrdu, setShowUrdu] = useState(false);
  const [urduByLesson, setUrduByLesson] = useState<Record<string, string>>({});

  const byDate = useMemo(() => {
    const map = new Map<string, PlannerLesson[]>();
    for (const lesson of lessons) {
      if (!lesson.date) continue;
      const list = map.get(lesson.date) ?? [];
      list.push(lesson);
      map.set(lesson.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.periodNumber ?? 0) - (b.periodNumber ?? 0));
    }
    return map;
  }, [lessons]);

  const dayByDate = useMemo(() => {
    const map = new Map<string, PlannerVersionPayload["calendar"]["days"][number]>();
    for (const day of calendar.days) map.set(day.date, day);
    return map;
  }, [calendar.days]);

  const cells = monthCells(month);
  const monthIndex = months.indexOf(month);
  const selected = lessons.find((lesson) => lesson.lessonKey === selectedKey) ?? null;
  const unscheduled = lessons.filter((lesson) => !lesson.date);

  const urdu = useMutation({
    mutationFn: (lessonKey: string) =>
      academicPlannerService.activityUrdu(plannerId, lessonKey, { versionId }),
    onSuccess: (payload, lessonKey) => {
      setUrduByLesson((prev) => ({ ...prev, [lessonKey]: payload.urdu }));
      setShowUrdu(true);
    },
    onError: (err) => {
      toast({
        title: "Could not translate",
        description: friendlyApiErrorMessage(err),
        variant: "error",
      });
    },
  });

  function selectLesson(lesson: PlannerLesson) {
    if (selectedKey === lesson.lessonKey) {
      setSelectedKey(null);
      setShowUrdu(false);
      return;
    }
    setSelectedKey(lesson.lessonKey);
    setShowUrdu(false);
  }

  function shiftMonth(step: number) {
    const next = months[monthIndex + step];
    if (!next) return;
    setMonth(next);
    setShowUrdu(false);
    setSelectedKey((key) => {
      const lesson = lessons.find((item) => item.lessonKey === key);
      if (!lesson?.date?.startsWith(next)) return null;
      return key;
    });
  }

  if (!months.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Build the schedule to see each day on the calendar.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={monthIndex <= 0}
            onClick={() => shiftMonth(-1)}
          >
            Previous
          </Button>
          <p className="min-w-[9rem] text-center text-sm font-semibold">{monthLabel(month)}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={monthIndex < 0 || monthIndex >= months.length - 1}
            onClick={() => shiftMonth(1)}
          >
            Next
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {(["Reading", "Exercises", "Revision", "Activity"] as PlannerDayWord[]).map((word) => (
            <span key={word} className={cn("rounded-full border px-2 py-0.5", WORD_CLASS[word])}>
              {word}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-medium text-muted-foreground">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-1 py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="min-h-[4.75rem] border-b border-r bg-muted/20" />;
            }
            const day = dayByDate.get(date);
            const dayLessons = byDate.get(date) ?? [];
            const inRange = date >= calendar.from.slice(0, 10) && date <= calendar.to.slice(0, 10);
            const holiday = day ? !day.working : false;
            return (
              <div
                key={date}
                className={cn(
                  "min-h-[4.75rem] border-b border-r p-1",
                  !inRange && "bg-muted/30",
                  holiday && dayLessons.length === 0 && "bg-muted/40",
                  date === today && "bg-accent/40",
                )}
              >
                <div className="flex items-center justify-between px-0.5">
                  <span className={cn("text-xs font-semibold", holiday && "text-muted-foreground")}>
                    {Number(date.slice(8, 10))}
                  </span>
                  {date === today && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                </div>
                {dayLessons.length === 0 && holiday && day?.reason && (
                  <p className="mt-1 truncate px-0.5 text-[10px] text-muted-foreground">{day.reason}</p>
                )}
                <div className="mt-1 space-y-1">
                  {dayLessons.map((lesson) => {
                    const word = plannerDayWord(lesson);
                    const chapter = shortChapterName(chapterTitle(lesson.chapterKey));
                    const open = lesson.lessonKey === selectedKey;
                    return (
                      <button
                        key={lesson.lessonKey}
                        type="button"
                        aria-expanded={open}
                        onClick={() => selectLesson(lesson)}
                        className={cn(
                          "w-full rounded-md border px-1 py-0.5 text-left transition-transform",
                          WORD_CLASS[word],
                          open && "scale-[1.03] ring-2 ring-primary",
                        )}
                      >
                        <span className="block truncate text-[10px] leading-tight">{chapter}</span>
                        <span className="block text-[11px] font-semibold leading-tight">{word}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <DayDetail
          key={selected.lessonKey}
          lesson={selected}
          chapter={chapterTitle(selected.chapterKey)}
          canEdit={Boolean(canEdit) && !readOnly}
          showUrdu={showUrdu}
          urduText={urduByLesson[selected.lessonKey]}
          translating={urdu.isPending}
          onClose={() => {
            setSelectedKey(null);
            setShowUrdu(false);
          }}
          onEdit={onEdit ? () => onEdit(selected) : undefined}
          onMove={onMove ? () => onMove(selected) : undefined}
          onShowUrdu={() => {
            const saved = urduByLesson[selected.lessonKey];
            if (saved) {
              setShowUrdu(true);
              return;
            }
            urdu.mutate(selected.lessonKey);
          }}
          onShowEnglish={() => setShowUrdu(false)}
        />
      )}

      {unscheduled.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {unscheduled.length} day{unscheduled.length === 1 ? "" : "s"} not placed on the calendar yet.
        </p>
      )}
    </div>
  );
}

function DayDetail({
  lesson,
  chapter,
  canEdit,
  showUrdu,
  urduText,
  translating,
  onClose,
  onEdit,
  onMove,
  onShowUrdu,
  onShowEnglish,
}: {
  lesson: PlannerLesson;
  chapter: string | null;
  canEdit: boolean;
  showUrdu: boolean;
  urduText?: string;
  translating: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onMove?: () => void;
  onShowUrdu: () => void;
  onShowEnglish: () => void;
}) {
  const word = plannerDayWord(lesson);
  const chapterName = fixDisplayText(chapter ?? "this chapter");
  const summary = plannerDaySummary(lesson, chapterName);
  const notes = lesson.teacherNotes?.trim() ?? "";

  return (
    <section className="planner-day-open rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {lesson.date ? formatDate(lesson.date) : "Unscheduled"}
            {lesson.periodNumber ? ` · Period ${lesson.periodNumber}` : ""}
          </p>
          <h2 className="mt-1 text-base font-semibold">{chapterName}</h2>
          <p className={cn("mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold", WORD_CLASS[word])}>
            {word}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {word === "Activity" && (
            <Button
              type="button"
              size="sm"
              variant={showUrdu ? "secondary" : "default"}
              disabled={translating}
              onClick={showUrdu ? onShowEnglish : onShowUrdu}
            >
              {translating ? "Translating…" : showUrdu ? "English" : "اردو میں دیکھیں"}
            </Button>
          )}
          {canEdit && onEdit && (
            <Button type="button" size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
          )}
          {canEdit && onMove && (
            <Button type="button" size="sm" variant="outline" onClick={onMove}>
              Move
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {word === "Activity" ? (
        <div className="mt-3 max-h-[46vh] overflow-y-auto pr-1">
          <p className="text-sm font-medium">{fixDisplayText(activityTitle(lesson))}</p>
          {showUrdu && urduText ? (
            <p
              dir="rtl"
              lang="ur"
              className="planner-day-open mt-3 whitespace-pre-wrap text-right text-base leading-8"
            >
              {urduText}
            </p>
          ) : (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {notes ? fixDisplayText(notes) : "This activity is not written yet."}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed">{summary}</p>
      )}
    </section>
  );
}
