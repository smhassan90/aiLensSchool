"use client";

import Link from "next/link";
import { BookOpen, CalendarCheck, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

type PaceTone = "good" | "watch" | "act";

function toneFor(done: number, expected: number): PaceTone {
  if (expected <= 0 || done >= expected) return "good";
  const pct = done / expected;
  if (pct >= 0.7) return "watch";
  return "act";
}

const TONE = {
  good: {
    ring: "#059669",
    track: "bg-emerald-100",
    fill: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800",
    border: "border-emerald-200",
    word: "On track",
  },
  watch: {
    ring: "#d97706",
    track: "bg-amber-100",
    fill: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800",
    border: "border-amber-200",
    word: "Behind",
  },
  act: {
    ring: "#e11d48",
    track: "bg-rose-100",
    fill: "bg-rose-500",
    badge: "bg-rose-100 text-rose-800",
    border: "border-rose-200",
    word: "Far behind",
  },
} as const;

function PaceRing({ done, expected, tone }: { done: number; expected: number; tone: PaceTone }) {
  const pct = expected <= 0 ? 1 : Math.min(1, Math.max(0, done / expected));
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  const style = TONE[tone];
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="-rotate-90 h-24 w-24">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={style.ring}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold leading-none tabular-nums">
          {done}
          <span className="text-xs font-medium text-muted-foreground">/{expected || 0}</span>
        </span>
      </div>
    </div>
  );
}

function HeatGrid({ values }: { values: number[] }) {
  const cells = values.slice(-10);
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {cells.map((value, index) => (
        <div
          key={index}
          className={cn(
            "h-7 rounded-md",
            value >= 0.99 && "bg-emerald-500",
            value > 0 && value < 0.99 && "bg-amber-400",
            value <= 0 && "bg-rose-200",
          )}
        />
      ))}
    </div>
  );
}

function ClassBars({
  items,
}: {
  items: Array<{ label: string; done: number; expected: number }>;
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.slice(0, 6).map((item) => {
        const pct = item.expected <= 0 ? 100 : Math.min(100, (item.done / item.expected) * 100);
        return (
          <div key={item.label} className="flex items-center gap-2">
            <p className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">{item.label}</p>
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-rose-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuizSlots({ done, expected }: { done: number; expected: number }) {
  const total = Math.max(expected, done);
  if (total <= 0) {
    return <div className="h-7 rounded-md bg-emerald-100" />;
  }
  const shown = Math.min(total, 12);
  const filled = Math.round((done / total) * shown);
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: shown }, (_, index) => (
        <div
          key={index}
          className={cn("h-7 w-7 rounded-md", index < filled ? "bg-emerald-500" : "bg-rose-200")}
        />
      ))}
    </div>
  );
}

export function TeacherPaceBoard({
  expectedLessonSlots,
  doneLessonSlots,
  expectedAttendanceSlots,
  doneAttendanceSlots,
  lessonHeat,
  attendanceHeat,
  lessonByClass,
  attendanceByClass,
  quizCount,
  quizTarget,
}: {
  expectedLessonSlots: number;
  doneLessonSlots: number;
  expectedAttendanceSlots: number;
  doneAttendanceSlots: number;
  lessonHeat: number[];
  attendanceHeat: number[];
  lessonByClass: Array<{ label: string; done: number; expected: number }>;
  attendanceByClass: Array<{ label: string; done: number; expected: number }>;
  quizCount: number;
  quizTarget: number | null;
}) {
  const lessonTone = toneFor(doneLessonSlots, expectedLessonSlots);
  const attendanceTone = toneFor(doneAttendanceSlots, expectedAttendanceSlots);
  const quizExpected = quizTarget && quizTarget > 0 ? quizTarget : quizCount;
  const quizTone = quizTarget && quizTarget > 0 ? toneFor(quizCount, quizTarget) : "good";

  const cards = [
    {
      href: "/teacher/lessons/new",
      title: "Lectures",
      icon: BookOpen,
      tone: lessonTone,
      done: doneLessonSlots,
      expected: expectedLessonSlots,
      visual: lessonHeat.length ? <HeatGrid values={lessonHeat} /> : <ClassBars items={lessonByClass} />,
      extra: <ClassBars items={lessonByClass} />,
    },
    {
      href: "/teacher/attendance",
      title: "Attendance",
      icon: CalendarCheck,
      tone: attendanceTone,
      done: doneAttendanceSlots,
      expected: expectedAttendanceSlots,
      visual: attendanceHeat.length ? <HeatGrid values={attendanceHeat} /> : <ClassBars items={attendanceByClass} />,
      extra: <ClassBars items={attendanceByClass} />,
    },
    {
      href: "/teacher/quizzes",
      title: "Quizzes",
      icon: ListChecks,
      tone: quizTone,
      done: quizCount,
      expected: quizExpected,
      visual: <QuizSlots done={quizCount} expected={quizExpected} />,
      extra: null,
    },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
          Partial
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-200" />
          Missing
        </span>
        <span className="ml-auto">Last 10 school days</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => {
          const style = TONE[card.tone];
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href} className="block">
              <div className={cn("h-full rounded-xl border bg-card p-5 shadow-sm transition-colors hover:bg-muted/40", style.border)}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-md p-2", style.badge)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <h2 className="font-semibold">{card.title}</h2>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", style.badge)}>
                    {style.word}
                  </span>
                </div>
                <div className="mb-4 flex items-center gap-4">
                  <PaceRing done={card.done} expected={card.expected} tone={card.tone} />
                  <div className="min-w-0 flex-1">{card.visual}</div>
                </div>
                {card.extra}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
