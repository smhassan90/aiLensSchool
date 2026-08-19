"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PerformanceCriterion, ScoreKey, TeacherScoreRow } from "@/services/teachers.service";

export function scoreTone(value: number | null) {
  if (value == null) return "muted";
  if (value >= 75) return "good";
  if (value >= 50) return "watch";
  return "act";
}

export function scoreBarClass(value: number | null) {
  const tone = scoreTone(value);
  if (tone === "good") return "bg-emerald-500";
  if (tone === "watch") return "bg-amber-500";
  if (tone === "act") return "bg-rose-500";
  return "bg-slate-300";
}

export function scoreTextClass(value: number | null) {
  const tone = scoreTone(value);
  if (tone === "good") return "text-emerald-800";
  if (tone === "watch") return "text-amber-800";
  if (tone === "act") return "text-rose-800";
  return "text-muted-foreground";
}

export function CriterionBars({
  scores,
  weights,
}: {
  scores: Record<ScoreKey, number | null>;
  weights: PerformanceCriterion[];
}) {
  return (
    <div className="space-y-3">
      {weights.map((item) => {
        const value = scores[item.key];
        return (
          <div key={item.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">
                {item.label}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{item.points} pts</span>
              </span>
              <span className={cn("text-xs font-semibold", scoreTextClass(value))}>
                {value == null ? "Not enough data" : `${value}%`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className={cn("h-2 rounded-full", scoreBarClass(value))}
                style={{ width: `${value == null ? 0 : Math.max(4, value)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.why}</p>
          </div>
        );
      })}
    </div>
  );
}

export function TeacherRankList({
  teachers,
  selectedId,
  onSelect,
}: {
  teachers: TeacherScoreRow[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  if (!teachers.length) {
    return <p className="text-sm text-muted-foreground">No active teachers to rank yet.</p>;
  }

  return (
    <ol className="space-y-2">
      {teachers.map((row, index) => {
        const top = index === 0;
        const bottom = index === teachers.length - 1 && teachers.length > 1;
        const content = (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  <span className="mr-2 text-xs font-semibold text-muted-foreground">#{row.rank ?? index + 1}</span>
                  {row.teacher.name}
                </p>
                {top || bottom ? (
                  <p className="text-xs text-muted-foreground">
                    {top ? "Strongest this period" : "Needs the most support"}
                  </p>
                ) : null}
              </div>
              <p className={cn("text-lg font-semibold tabular-nums", scoreTextClass(row.total))}>{row.total}</p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted">
              <div
                className={cn("h-2 rounded-full", scoreBarClass(row.total))}
                style={{ width: `${Math.max(4, row.total)}%` }}
              />
            </div>
          </>
        );

        if (onSelect) {
          return (
            <li key={row.teacher.id}>
              <button
                type="button"
                onClick={() => onSelect(row.teacher.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  selectedId === row.teacher.id ? "border-teal-400 bg-teal-50" : "bg-white hover:bg-slate-50",
                )}
              >
                {content}
              </button>
            </li>
          );
        }

        return (
          <li key={row.teacher.id}>
            <Link
              href={`/school/teachers/${row.teacher.id}?ai=1`}
              className="block rounded-xl border bg-white p-3 hover:bg-slate-50"
            >
              {content}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
