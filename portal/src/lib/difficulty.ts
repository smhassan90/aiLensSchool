export function difficultyLabel(level?: number | null) {
  if (!level) return "—";
  return `${level}/10`;
}

export function difficultyTone(level?: number | null): "success" | "warning" | "destructive" | "default" {
  if (!level) return "default";
  if (level <= 3) return "success";
  if (level <= 6) return "warning";
  if (level <= 8) return "destructive";
  return "destructive";
}

export function difficultyColorClass(level?: number | null) {
  if (!level) return "bg-slate-100 text-slate-700";
  if (level <= 3) return "bg-emerald-100 text-emerald-800";
  if (level <= 6) return "bg-amber-100 text-amber-900";
  if (level <= 8) return "bg-orange-100 text-orange-900";
  return "bg-rose-100 text-rose-900";
}

export function difficultyDescription(level: number) {
  if (level <= 3) return "Easy";
  if (level <= 6) return "Medium";
  if (level <= 8) return "Hard";
  return "Very hard";
}

export function difficultyAccentColor(level: number) {
  if (level <= 3) return "#10b981";
  if (level <= 6) return "#eab308";
  if (level <= 8) return "#f97316";
  return "#ef4444";
}
