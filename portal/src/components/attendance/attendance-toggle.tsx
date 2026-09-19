"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type AttendanceMark = "PRESENT" | "ABSENT";

export type DayOffInfo = {
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

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
  rows: Array<{ studentId: string; name: string; status: AttendanceMark; dayOff?: DayOffInfo }>;
  onToggle: (studentId: string, status: AttendanceMark) => void;
}) {
  const [openDayOffId, setOpenDayOffId] = useState<string | null>(null);
  const presentCount = rows.filter((row) => row.status === "PRESENT").length;
  const absentCount = rows.length - presentCount;
  const sortedRows = [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

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
        {sortedRows.map((row, index) => {
          const present = row.status === "PRESENT";
          const initials = row.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("");
          const hasDayOff = Boolean(row.dayOff);
          const dayOffOpen = openDayOffId === row.studentId;
          return (
            <li
              key={row.studentId}
              className={cn(
                "px-4 py-3 transition-colors sm:px-5",
                hasDayOff ? "bg-amber-50/90" : present ? "bg-white" : "bg-rose-50/70",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    hasDayOff
                      ? "bg-amber-200 text-amber-900"
                      : present
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-200 text-rose-900",
                  )}
                >
                  {initials || index + 1}
                </span>
                <button
                  type="button"
                  className={cn("min-w-0 flex-1 text-left", hasDayOff && "cursor-pointer")}
                  onClick={() => {
                    if (!hasDayOff) return;
                    setOpenDayOffId(dayOffOpen ? null : row.studentId);
                  }}
                >
                  <p className="truncate font-medium">{row.name}</p>
                  <p
                    className={cn(
                      "text-xs font-medium",
                      hasDayOff ? "text-amber-800" : present ? "text-emerald-700" : "text-rose-700",
                    )}
                  >
                    {hasDayOff
                      ? row.dayOff?.status === "PENDING"
                        ? "Parent requested day off"
                        : "Approved day off"
                      : present
                        ? "In class"
                        : "Not in class"}
                  </p>
                </button>
                <AttendanceToggle value={row.status} onChange={(status) => onToggle(row.studentId, status)} />
              </div>
              {hasDayOff && dayOffOpen ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-white p-3 text-sm text-amber-950">
                  <p className="font-semibold">
                    {row.dayOff?.status === "PENDING" ? "Day-off request" : "Approved day off"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{row.dayOff?.reason}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
