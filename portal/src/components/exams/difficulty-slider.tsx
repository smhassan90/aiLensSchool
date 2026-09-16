"use client";

import { Label } from "@/components/ui/label";
import {
  difficultyAccentColor,
  difficultyColorClass,
  difficultyDescription,
  difficultyLabel,
} from "@/lib/difficulty";
import { cn } from "@/lib/utils";

type DifficultySliderProps = {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  className?: string;
};

export function DifficultySlider({ value, onChange, id = "difficulty", className }: DifficultySliderProps) {
  const level = Math.min(10, Math.max(1, value));
  const accent = difficultyAccentColor(level);
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>Difficulty level</Label>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            difficultyColorClass(level),
          )}
        >
          {difficultyLabel(level)} · {difficultyDescription(level)}
        </span>
      </div>

      <div className="relative pt-1">
        <div
          className="h-2.5 w-full rounded-full"
          style={{
            background:
              "linear-gradient(to right, #10b981 0%, #eab308 40%, #f97316 70%, #ef4444 100%)",
          }}
          aria-hidden
        />
        <input
          id={id}
          type="range"
          min={1}
          max={10}
          step={1}
          value={level}
          onChange={(e) => onChange(Number(e.target.value))}
          className="difficulty-range absolute inset-x-0 top-1 h-2.5 w-full cursor-pointer appearance-none bg-transparent"
          style={{
            ["--thumb-color" as string]: accent,
            ["--thumb-shadow" as string]: `${accent}55`,
          }}
        />
      </div>

      <div className="flex justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="text-emerald-700">1 · Easiest</span>
        <span className="text-rose-700">10 · Hardest</span>
      </div>
    </div>
  );
}
