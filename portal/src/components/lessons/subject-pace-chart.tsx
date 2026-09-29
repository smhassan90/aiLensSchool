"use client";

import type { SubjectPace } from "@/services/lessons.service";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(142 76% 36%)",
  "hsl(221 83% 53%)",
  "hsl(32 95% 44%)",
  "hsl(280 67% 50%)",
  "hsl(0 72% 51%)",
];

export function SubjectPaceChart({ pace }: { pace: SubjectPace }) {
  if (!pace.totalDays) {
    return <p className="text-sm text-muted-foreground">No class days logged in this period yet.</p>;
  }

  let offset = 0;
  const segments = pace.slices.map((slice, index) => {
    const pct = (slice.days / pace.totalDays) * 100;
    const start = offset;
    offset += pct;
    return { ...slice, pct, start, color: COLORS[index % COLORS.length] };
  });

  const gradient = segments
    .map((s) => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(", ");

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-44 w-44 rounded-full"
          style={{
            background: `conic-gradient(${gradient})`,
          }}
          role="img"
          aria-label={`Subject pace over ${pace.weeks} weeks`}
        />
        <p className="text-xs text-muted-foreground">
          Last {pace.weeks} weeks · {pace.totalDays} class day{pace.totalDays === 1 ? "" : "s"} logged
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {s.days} day{s.days === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
