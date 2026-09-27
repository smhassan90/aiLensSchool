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
        "relative box-border h-[54mm] w-[86mm] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl",
        "ring-1 ring-slate-900/10",
        className,
      )}
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-amber-300/35 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-teal-400/30 blur-2xl"
        aria-hidden
      />

      <div className="relative flex h-[19mm] items-stretch bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 px-2.5 py-2 text-white">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 p-0.5 shadow-md ring-2 ring-white/40">
            {logo ? (
              <Image
                src={logo}
                alt=""
                width={40}
                height={40}
                sizes="40px"
                className="h-full w-full rounded-[10px] object-cover"
              />
            ) : (
              <span className="font-display text-sm font-bold text-teal-800">
                {schoolName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-[11px] font-semibold tracking-tight">{schoolName}</p>
            {schoolCity ? (
              <p className="truncate text-[8px] font-medium uppercase tracking-wider text-teal-100/90">
                {schoolCity}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-center pl-1">
          <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.12em] text-teal-950 shadow-sm">
            Student ID
          </span>
        </div>
      </div>

      <div className="relative flex gap-2.5 px-2.5 pb-2 pt-2">
        <div className="relative shrink-0">
          <div className="h-[22mm] w-[17mm] overflow-hidden rounded-xl bg-gradient-to-br from-teal-100 to-amber-50 p-[2px] shadow-inner">
            <div className="h-full w-full overflow-hidden rounded-[10px] bg-white">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-cyan-50">
                  <span className="font-display text-lg font-bold text-teal-700">
                    {initialsFromName(studentName)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 text-[9px] leading-[1.35]">
          <p className="font-display text-[13px] font-bold leading-tight text-slate-900">{studentName}</p>
          {classLabel ? (
            <p className="mt-1 inline-block max-w-full truncate rounded-full bg-teal-600/10 px-2 py-0.5 text-[8px] font-semibold text-teal-800">
              {classLabel}
            </p>
          ) : null}
          <p className="mt-1.5 font-mono text-[9px] font-semibold tracking-wide text-slate-700">{cardNumber}</p>
          {parentName ? (
            <p className="mt-1 text-slate-600">
              <span className="font-semibold text-slate-500">Guardian</span> {parentName}
            </p>
          ) : null}
          {parentPhone && parentPhone !== "—" ? (
            <p className="text-slate-600">
              <span className="font-semibold text-slate-500">Phone</span> {parentPhone}
            </p>
          ) : null}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-teal-700/15 bg-gradient-to-r from-slate-50 to-teal-50/80 px-2.5 py-1">
        <p className="line-clamp-2 text-[7.5px] leading-tight text-slate-600">
          <span className="font-bold uppercase tracking-wide text-teal-800">Address </span>
          {address?.trim() || "—"}
        </p>
      </div>
    </div>
  );
}
