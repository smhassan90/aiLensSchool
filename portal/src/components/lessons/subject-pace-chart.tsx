"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { SubjectPace, SubjectPaceSlice } from "@/services/lessons.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  chapterContentPreview,
  chapterMetaLine,
  chapterProgressLabel,
  chapterSubtitle,
  chapterTitle,
} from "@/lib/chapter-display";
import { cn } from "@/lib/utils";

const COLORS = [
  "hsl(221 83% 53%)",
  "hsl(142 76% 36%)",
  "hsl(32 95% 44%)",
  "hsl(280 67% 50%)",
  "hsl(0 72% 51%)",
  "hsl(199 89% 48%)",
];

function formatDays(days: number) {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

function sliceAsChapter(slice: SubjectPaceSlice) {
  return {
    chapterName: slice.chapterName ?? slice.label,
    topicName: slice.topicName,
    chapterProgress: slice.chapterProgress,
    aiSummary: slice.contentPreview,
    pageFrom: slice.pageFrom,
    pageTo: slice.pageTo,
    date: slice.addedDate,
  };
}

function ChapterDetailPanel({
  slice,
  pct,
  color,
}: {
  slice: SubjectPaceSlice;
  pct: number;
  color: string;
}) {
  const ch = sliceAsChapter(slice);
  const subtitle = chapterSubtitle(ch);
  const progress = chapterProgressLabel(ch.chapterProgress);
  const preview =
    slice.contentPreview?.trim() ||
    chapterContentPreview(ch, 220);
  const meta = chapterMetaLine(ch);
  const rtl = /[\u0600-\u06FF]/.test(preview);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <h3 className="text-base font-semibold leading-snug">{chapterTitle(ch)}</h3>
            {progress && (
              <Badge variant={ch.chapterProgress === "COMPLETED" ? "secondary" : "warning"} className="text-[10px]">
                {progress}
              </Badge>
            )}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="shrink-0 text-right text-sm tabular-nums text-muted-foreground">
          <p className="font-semibold text-foreground">{formatDays(slice.days)} days</p>
          <p>{Math.round(pct)}% of class time</p>
        </div>
      </div>
      <p
        className="text-sm leading-relaxed text-muted-foreground"
        dir={rtl ? "rtl" : undefined}
      >
        {preview}
      </p>
      {meta ? <p className="mt-2 text-xs text-muted-foreground/80">{meta}</p> : null}
      {slice.chapterId ? (
        <div className="mt-4">
          <Link href={`/teacher/lessons/chapters/${slice.chapterId}`}>
            <Button size="sm" variant="outline">Open lecture</Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function SubjectPaceChart({ pace }: { pace: SubjectPace }) {
  const router = useRouter();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const segments = useMemo(() => {
    if (!pace.totalDays) return [];
    let offset = 0;
    return pace.slices.map((slice, index) => {
      const pct = (slice.days / pace.totalDays) * 100;
      const start = offset;
      offset += pct;
      const key = slice.chapterId ?? slice.chapterIds[0] ?? slice.label;
      return {
        ...slice,
        key,
        pct,
        start,
        color: COLORS[index % COLORS.length],
      };
    });
  }, [pace]);

  useEffect(() => {
    if (!segments.length) {
      setActiveKey(null);
      return;
    }
    if (!activeKey || !segments.some((s) => s.key === activeKey)) {
      setActiveKey(segments[0].key);
    }
  }, [segments, activeKey]);

  const active = segments.find((s) => s.key === activeKey) ?? segments[0] ?? null;

  const openChapter = (seg: (typeof segments)[number]) => {
    if (seg.chapterId) {
      router.push(`/teacher/lessons/chapters/${seg.chapterId}`);
    }
  };

  if (!pace.totalDays || !segments.length) {
    return (
      <div className="flex min-h-[min(50vh,320px)] w-full items-center justify-center px-4">
        <p className="text-center text-sm text-muted-foreground">
          No class days logged yet for this class.
        </p>
      </div>
    );
  }

  const size = 240;
  const stroke = 32;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] lg:items-start">
      <div className="flex w-full flex-col items-center gap-3 lg:sticky lg:top-6">
        <div className="relative mx-auto" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="mx-auto block -rotate-90"
            aria-hidden
          >
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
                    strokeWidth={activeKey === seg.key ? stroke + 4 : stroke}
                    strokeDasharray={`${len} ${gap}`}
                    strokeDashoffset={offset}
                    className="cursor-pointer transition-all duration-200"
                    style={{ opacity: dimmed ? 0.3 : 1 }}
                    onMouseEnter={() => setActiveKey(seg.key)}
                    onClick={() => openChapter(seg)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${seg.label}, ${formatDays(seg.days)} days`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openChapter(seg);
                    }}
                  />
                );
              });
            })()}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            {active ? (
              <>
                <p className="text-3xl font-bold tabular-nums leading-none">{formatDays(active.days)}</p>
                <p className="mt-1 text-xs text-muted-foreground">class days</p>
                <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{active.label}</p>
              </>
            ) : null}
          </div>
        </div>
        <p className="max-w-[240px] text-center text-xs text-muted-foreground">
          {pace.periodLabel} · {formatDays(pace.totalDays)} class day
          {pace.totalDays === 1 ? "" : "s"} logged
        </p>
        <p className="max-w-[240px] text-center text-[11px] text-muted-foreground/80">
          Hover for preview · click a segment to open the lecture
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {active ? (
          <ChapterDetailPanel slice={active} pct={active.pct} color={active.color} />
        ) : null}

        <ul className="space-y-2">
          {segments.map((seg) => {
            const selected = activeKey === seg.key;
            return (
              <li key={seg.key}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveKey(seg.key)}
                  onFocus={() => setActiveKey(seg.key)}
                  onClick={() => {
                    if (seg.chapterId) openChapter(seg);
                    else setActiveKey(seg.key);
                  }}
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
    </div>
  );
}
