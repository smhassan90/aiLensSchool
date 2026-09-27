"use client";

import Image from "next/image";
import { assetUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type StudentIdCardPrintProps = {
  schoolName: string;
  schoolLogo?: string | null;
  schoolCity?: string | null;
  studentName: string;
  photoUrl?: string | null;
  cardNumber: string;
  classLabel?: string;
  parentName?: string;
  parentPhone?: string;
  address?: string | null;
  className?: string;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "").toUpperCase() || "S";
}

export function StudentIdCardPrint({
  schoolName,
  schoolLogo,
  schoolCity,
  studentName,
  photoUrl,
  cardNumber,
  classLabel,
  parentName,
  parentPhone,
  address,
  className,
}: StudentIdCardPrintProps) {
  const photo = assetUrl(photoUrl);
  const logo = assetUrl(schoolLogo);

  return (
    <div
      id="printable-id-card"
      className={cn(
        "box-border flex h-[54mm] w-[86mm] flex-col overflow-hidden rounded-lg bg-white text-slate-900",
        "border-2 border-slate-800 shadow-md",
        className,
      )}
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-teal-700 px-2 py-1.5">
        <div className="flex h-[11mm] w-[11mm] shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
          {logo ? (
            <Image
              src={logo}
              alt=""
              width={42}
              height={42}
              sizes="42px"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-display text-[11px] font-bold text-teal-800">
              {schoolName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[12px] font-bold leading-tight text-slate-900">
            {schoolName}
          </p>
          {schoolCity ? (
            <p className="truncate text-[9px] font-medium text-slate-600">{schoolCity}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-teal-800">Student ID</p>
      </header>

      <div className="flex min-h-0 flex-1 gap-2 px-2 py-1.5">
        <div className="h-[26mm] w-[26mm] shrink-0 overflow-hidden rounded-md border-2 border-slate-300 bg-slate-100">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100">
              <span className="font-display text-xl font-bold text-slate-500">
                {initialsFromName(studentName)}
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 text-slate-800">
          <p className="font-display text-[15px] font-bold leading-tight text-slate-900">{studentName}</p>
          {classLabel ? (
            <p className="text-[11px] font-semibold leading-snug text-teal-800">{classLabel}</p>
          ) : null}
          <p className="font-mono text-[11px] font-bold tracking-tight text-slate-900">{cardNumber}</p>
          {parentName ? (
            <p className="text-[10px] leading-snug">
              <span className="font-semibold text-slate-600">Guardian </span>
              {parentName}
            </p>
          ) : null}
          {parentPhone && parentPhone !== "—" ? (
            <p className="text-[10px] leading-snug">
              <span className="font-semibold text-slate-600">Phone </span>
              {parentPhone}
            </p>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-300 bg-slate-50 px-2 py-1">
        <p className="line-clamp-2 text-[9px] font-medium leading-tight text-slate-700">
          <span className="font-bold text-slate-800">Address </span>
          {address?.trim() || "—"}
        </p>
      </footer>
    </div>
  );
}
