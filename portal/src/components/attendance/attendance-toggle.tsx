"use client";

import { cn } from "@/lib/utils";

export type AttendanceMark = "PRESENT" | "ABSENT";

export function toPresentAbsent(status?: string | null): AttendanceMark {
  return status === "ABSENT" || status === "EXCUSED" ? "ABSENT" : "PRESENT";
}

export function AttendanceToggle({
  value,
  onChange,
}: {
  value: AttendanceMark;
  onChange: (value: AttendanceMark) => void;
}) {
  const present = value === "PRESENT";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={present}
      aria-label={present ? "Present. Click to mark absent." : "Absent. Click to mark present."}
      onClick={() => onChange(present ? "ABSENT" : "PRESENT")}
      className={cn(
        "relative inline-flex h-11 w-[11.5rem] shrink-0 items-center rounded-full p-1 transition-colors duration-200",
        present ? "bg-emerald-100" : "bg-rose-100",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-9 w-[5.4rem] rounded-full shadow-sm transition-all duration-200",
          present ? "left-1 bg-emerald-500" : "left-[5.85rem] bg-rose-500",
        )}
      />
      <span
        className={cn(
          "relative z-10 flex w-[5.4rem] justify-center text-xs font-semibold tracking-wide",
          present ? "text-white" : "text-emerald-800/70",
        )}
      >
        Present
      </span>
      <span
        className={cn(
          "relative z-10 flex w-[5.4rem] justify-center text-xs font-semibold tracking-wide",
          present ? "text-rose-800/70" : "text-white",
        )}
      >
        Absent
      </span>
    </button>
  );
}

export function AttendanceRoster({
  rows,
  onToggle,
}: {
  rows: Array<{ studentId: string; name: string; status: AttendanceMark }>;
  onToggle: (studentId: string, status: AttendanceMark) => void;
}) {
  const presentCount = rows.filter((row) => row.status === "PRESENT").length;
  const absentCount = rows.length - presentCount;

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3 sm:px-5">
        <p className="text-sm text-muted-foreground">
          Everyone starts as <span className="font-medium text-emerald-700">Present</span>. Tap to mark absent.
        </p>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{presentCount} present</span>
          <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">{absentCount} absent</span>
        </div>
      </div>
      <ul className="divide-y">
        {rows.map((row, index) => {
          const present = row.status === "PRESENT";
          const initials = row.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("");
          return (
            <li
              key={row.studentId}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition-colors sm:px-5",
                present ? "bg-white" : "bg-rose-50/70",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  present ? "bg-emerald-100 text-emerald-800" : "bg-rose-200 text-rose-900",
                )}
              >
                {initials || index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{row.name}</p>
                <p className={cn("text-xs font-medium", present ? "text-emerald-700" : "text-rose-700")}>
                  {present ? "In class" : "Not in class"}
                </p>
              </div>
              <AttendanceToggle value={row.status} onChange={(status) => onToggle(row.studentId, status)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
