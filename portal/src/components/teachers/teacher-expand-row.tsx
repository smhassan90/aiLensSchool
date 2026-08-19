"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AiWait } from "@/components/layout/ai-wait";
import type {
  PerformanceCriterion,
  ScoreKey,
  TeacherCoaching,
  TeacherScoreRow,
} from "@/services/teachers.service";
import { scoreBarClass, scoreTextClass, scoreTone } from "@/components/teachers/teacher-score-visuals";

const SHORT_LABEL: Record<ScoreKey, string> = {
  annualResults: "Results",
  lessons: "Lessons",
  quizzesCreated: "Quizzes",
  teacherAttendance: "Present",
  quizCompletion: "Attempted",
  quizMarks: "Quiz marks",
  studentAttendance: "Class att.",
};

function earnedPoints(score: number | null, points: number) {
  if (score == null) return null;
  return Math.round((score / 100) * points * 10) / 10;
}

function metricHint(row: TeacherScoreRow, key: ScoreKey) {
  const m = row.metrics;
  switch (key) {
    case "annualResults":
      return m.annual.average != null ? `${m.annual.average}% ${m.annual.source}` : "No term marks yet";
    case "lessons":
      return `${m.lessons.done} of ${m.lessons.expected} school days`;
    case "quizzesCreated":
      return `${m.quizzes.created} of ${m.quizzes.target} target`;
    case "teacherAttendance":
      return m.teacherAttendance.marked
        ? `${m.teacherAttendance.present}/${m.teacherAttendance.marked} days`
        : "Admin has not marked yet";
    case "quizCompletion":
      return m.quizzes.completion != null ? `${m.quizzes.completion}% attempted` : "No quiz attempts yet";
    case "quizMarks":
      return m.quizzes.average != null ? `avg ${m.quizzes.average}%` : "No quiz marks yet";
    case "studentAttendance":
      return m.studentAttendance.rate != null ? `${m.studentAttendance.rate}% in class` : "No records yet";
  }
}

function ScoreRing({ value }: { value: number }) {
  const size = 96;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - Math.min(100, Math.max(0, value)) / 100);
  const color = value >= 75 ? "#0f766e" : value >= 50 ? "#d97706" : "#e11d48";

  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-2xl font-semibold tabular-nums leading-none", scoreTextClass(value))}>{value}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">of 100</span>
      </div>
    </div>
  );
}

function ContributionBar({
  scores,
  weights,
}: {
  scores: TeacherScoreRow["scores"];
  weights: PerformanceCriterion[];
}) {
  const segments = weights.map((item) => {
    const earned = earnedPoints(scores[item.key], item.points);
    return { ...item, earned, tone: scoreTone(scores[item.key]) };
  });
  const totalEarned = segments.reduce((sum, item) => sum + (item.earned ?? 0), 0);

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {segments.map((item) =>
          item.earned ? (
            <div
              key={item.key}
              title={`${item.label}: ${item.earned}/${item.points}`}
              className={cn(
                "h-full transition-[width] duration-700 ease-out",
                item.tone === "good" && "bg-teal-600",
                item.tone === "watch" && "bg-amber-500",
                item.tone === "act" && "bg-rose-500",
                item.tone === "muted" && "bg-slate-300",
              )}
              style={{ width: `${Math.max(1.5, (item.earned / Math.max(totalEarned, 1)) * 100)}%` }}
            />
          ) : null,
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Colour is the mix of points earned · teal strong · amber watch · rose act
      </p>
    </div>
  );
}

function CriterionTiles({ row, weights }: { row: TeacherScoreRow; weights: PerformanceCriterion[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
      {weights.map((item) => {
        const value = row.scores[item.key];
        const earned = earnedPoints(value, item.points);
        const tone = scoreTone(value);
        return (
          <div
            key={item.key}
            className={cn(
              "rounded-xl border p-2.5",
              tone === "good" && "border-teal-200 bg-teal-50/80",
              tone === "watch" && "border-amber-200 bg-amber-50/80",
              tone === "act" && "border-rose-200 bg-rose-50/80",
              tone === "muted" && "border-slate-200 bg-slate-50",
            )}
            title={item.why}
          >
            <p className="truncate text-[11px] font-medium text-slate-600">{SHORT_LABEL[item.key]}</p>
            <p className={cn("mt-1 text-lg font-semibold tabular-nums leading-none", scoreTextClass(value))}>
              {earned == null ? "—" : earned}
              <span className="text-xs font-normal text-muted-foreground">/{item.points}</span>
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-white/80">
              <div
                className={cn("h-1.5 rounded-full", scoreBarClass(value))}
                style={{ width: `${value == null ? 0 : Math.max(6, value)}%` }}
              />
            </div>
            <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
              {metricHint(row, item.key)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CourseGrid({ classes }: { classes: TeacherScoreRow["byClass"] }) {
  if (!classes.length) {
    return <p className="text-sm text-muted-foreground">No classes assigned yet.</p>;
  }
  return (
    <>
      <div className="grid gap-2 sm:hidden">
        {classes.map((cls) => (
          <div key={`${cls.sectionId}-${cls.subjectId}`} className="rounded-xl border bg-slate-50 p-3">
            <p className="font-medium">
              {cls.className} <span className="font-normal text-muted-foreground">· {cls.subject}</span>
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
              <div>
                <p className="text-muted-foreground">Term</p>
                <p className={cn("font-semibold tabular-nums", scoreTextClass(cls.termAverage))}>
                  {cls.termAverage ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Quiz</p>
                <p className={cn("font-semibold tabular-nums", scoreTextClass(cls.quizAverage))}>
                  {cls.quizAverage ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Lessons</p>
                <p className="font-semibold tabular-nums">{cls.lessons}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Quizzes</p>
                <p className={cn("font-semibold tabular-nums", cls.quizzes === 0 && "text-rose-700")}>{cls.quizzes}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-xl border sm:block">
        <div className="grid grid-cols-[1.2fr_0.9fr_repeat(4,0.55fr)] gap-0 bg-slate-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          <span>Class</span>
          <span>Subject</span>
          <span>Term</span>
          <span>Quiz</span>
          <span>Lessons</span>
          <span>Quizzes</span>
        </div>
        {classes.map((cls) => (
          <div
            key={`${cls.sectionId}-${cls.subjectId}`}
            className="grid grid-cols-[1.2fr_0.9fr_repeat(4,0.55fr)] items-center border-t px-3 py-2 text-sm"
          >
            <span className="truncate font-medium">{cls.className}</span>
            <span className="truncate text-muted-foreground">{cls.subject}</span>
            <span className={cn("tabular-nums font-semibold", scoreTextClass(cls.termAverage))}>
              {cls.termAverage ?? "—"}
            </span>
            <span className={cn("tabular-nums font-semibold", scoreTextClass(cls.quizAverage))}>
              {cls.quizAverage ?? "—"}
            </span>
            <span className="tabular-nums">{cls.lessons}</span>
            <span className={cn("tabular-nums", cls.quizzes === 0 && "font-semibold text-rose-700")}>{cls.quizzes}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function DiscussPanel({ coaching }: { coaching: TeacherCoaching }) {
  const points = coaching.discussTonight?.length ? coaching.discussTonight : coaching.improvements;
  return (
    <div className="overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-white">
      <div className="border-b border-teal-100 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-800">
          {coaching.verdict.replaceAll("_", " ")}
        </p>
        <p className="mt-1 text-lg font-semibold leading-snug">{coaching.headline}</p>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Discuss tonight</p>
          <ol className="mt-2 space-y-2">
            {points.map((item, index) => (
              <li key={item} className="flex gap-2 text-sm leading-snug">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-900">
                  {index + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Going well</p>
          <ul className="mt-2 space-y-2 text-sm leading-snug text-slate-700">
            {(coaching.strengths ?? []).map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-slate-900 p-3 text-white">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Say this</p>
            <p className="mt-1 text-sm leading-snug">{coaching.sayToTeacher}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExpandableTeacherRow({
  row,
  index,
  totalTeachers,
  expanded,
  weights,
  coaching,
  aiPending,
  onToggle,
  onAskAi,
}: {
  row: TeacherScoreRow;
  index: number;
  totalTeachers: number;
  expanded: boolean;
  weights: PerformanceCriterion[];
  coaching?: TeacherCoaching | null;
  aiPending?: boolean;
  onToggle: () => void;
  onAskAi: () => void;
}) {
  const top = index === 0;
  const bottom = index === totalTeachers - 1 && totalTeachers > 1;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [expanded]);

  return (
    <li ref={panelRef}>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-white transition-[box-shadow,border-color,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          expanded
            ? "border-teal-300 shadow-lg shadow-teal-900/5 ring-1 ring-teal-100"
            : "border-slate-200 hover:border-slate-300",
        )}
      >
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-4 p-4 text-left">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              top && "bg-teal-600 text-white",
              bottom && "bg-rose-100 text-rose-800",
              !top && !bottom && "bg-slate-100 text-slate-600",
            )}
          >
            #{row.rank ?? index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{row.teacher.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.byClass.length
                ? row.byClass.map((cls) => `${cls.className} ${cls.subject}`).join(" · ")
                : "No classes assigned"}
            </p>
          </div>
          <div className="hidden w-36 sm:block">
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className={cn("h-2 rounded-full transition-[width] duration-500", scoreBarClass(row.total))}
                style={{ width: `${Math.max(4, row.total)}%` }}
              />
            </div>
          </div>
          <p className={cn("w-12 text-right text-xl font-semibold tabular-nums", scoreTextClass(row.total))}>
            {row.total}
          </p>
        </button>

        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-5 border-t px-4 pb-4 pt-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <ScoreRing key={`${row.teacher.id}-${expanded}`} value={row.total} />
                  <div>
                    <p className="text-sm font-medium">
                      {top ? "Strongest this period" : bottom ? "Needs the most support" : `Rank #${row.rank}`}
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                      Points earned across results, lessons, quizzes and attendance — easy to see where they are strong
                      or slipping.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={(event) => {
                    event.stopPropagation();
                    onAskAi();
                  }}
                  disabled={aiPending}
                >
                  <Sparkles className="h-4 w-4" />
                  {aiPending ? "Reading the courses…" : coaching ? "Refresh AI" : "What to discuss"}
                </Button>
              </div>

              <ContributionBar scores={row.scores} weights={weights} />
              <CriterionTiles row={row} weights={weights} />

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Courses this teacher owns
                </p>
                <CourseGrid classes={row.byClass} />
              </div>

              {aiPending ? <AiWait kind="coach" /> : coaching ? <DiscussPanel coaching={coaching} /> : null}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
