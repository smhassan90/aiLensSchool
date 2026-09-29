"use client";

import { useMemo, useState } from "react";
import type { SubjectPace } from "@/services/lessons.service";
import { cn } from "@/lib/utils";

const COLORS = [
  "var(--chart-1, hsl(221 83% 53%))",
  "var(--chart-2, hsl(142 76% 36%))",
  "var(--chart-3, hsl(32 95% 44%))",
  "var(--chart-4, hsl(280 67% 50%))",
  "var(--chart-5, hsl(0 72% 51%))",
  "var(--chart-6, hsl(199 89% 48%))",
];

function formatDays(days: number) {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

export function SubjectPaceChart({ pace }: { pace: SubjectPace }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const segments = useMemo(() => {
    if (!pace.totalDays) return [];
    let offset = 0;
    return pace.slices.map((slice, index) => {
      const pct = (slice.days / pace.totalDays) * 100;
      const start = offset;
      offset += pct;
      const key = slice.chapterIds[0] ?? slice.label;
      return {
        ...slice,
        key,
        pct,
        start,
        end: offset,
        color: COLORS[index % COLORS.length],
      };
    });
  }, [pace]);

  const active =
    segments.find((s) => s.key === activeKey) ??
    (segments.length ? segments[0] : null);

  if (!pace.totalDays || !segments.length) {
    return <p className="text-sm text-muted-foreground">No class days logged yet for this class.</p>;
  }

  const size = 220;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,260px)_1fr] lg:items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90" aria-hidden>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={stroke}
              opacity={0.35}
            />
            {(() => {
              let cumulative = 0;
              return segments.map((seg) => {
              const len = (seg.pct / 100) * circumference;
              const gap = circumference - len;
              const offset = -cumulative;
              cumulative += len;
              const dimmed = activeKey && activeKey !== seg.key;
              return (
                <circle
                  key={seg.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={activeKey === seg.key ? stroke + 6 : stroke}
                  strokeDasharray={`${len} ${gap}`}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                  className="cursor-pointer transition-all duration-200"
                  style={{ opacity: dimmed ? 0.35 : 1 }}
                  onMouseEnter={() => setActiveKey(seg.key)}
                  onFocus={() => setActiveKey(seg.key)}
                  onClick={() => setActiveKey(seg.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setActiveKey(seg.key);
                  }}
                />
              );
            });
            })()}
          </svg>
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
            aria-live="polite"
          >
            {active ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Chapter</p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug">{active.label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {formatDays(active.days)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">days</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Math.round(active.pct)}% of class time
                </p>
              </>
            ) : null}
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {pace.periodLabel} · {formatDays(pace.totalDays)} class day
          {pace.totalDays === 1 ? "" : "s"} logged
        </p>
        <p className="text-center text-[11px] text-muted-foreground/80">
          Hover or tap a segment to see chapter details.
        </p>
      </div>

      <ul className="space-y-2">
        {segments.map((seg) => {
          const selected = activeKey === seg.key;
          return (
            <li key={seg.key}>
              <button
                type="button"
                onMouseEnter={() => setActiveKey(seg.key)}
                onFocus={() => setActiveKey(seg.key)}
                onClick={() => setActiveKey(seg.key)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: seg.color }}
                    />
                    <span className="truncate text-sm font-medium">{seg.label}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {formatDays(seg.days)} d · {Math.round(seg.pct)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${seg.pct}%`, background: seg.color }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
