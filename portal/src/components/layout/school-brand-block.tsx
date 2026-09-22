"use client";

import { assetUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type SchoolBrandBlockProps = {
  schoolName: string;
  schoolLogo?: string | null;
  subtitle?: string;
  size?: "header" | "sidebar";
  inverted?: boolean;
  className?: string;
};

export function SchoolBrandBlock({
  schoolName,
  schoolLogo,
  subtitle,
  size = "header",
  inverted = false,
  className,
}: SchoolBrandBlockProps) {
  const logoSrc = assetUrl(schoolLogo);
  const isSidebar = size === "sidebar";

  return (
    <div
      className={cn(
        "min-w-0",
        isSidebar ? "flex w-full flex-col items-start gap-3" : "flex items-center gap-3",
        className,
      )}
    >
      {isSidebar ? (
        <div className="flex w-full min-w-0 items-center gap-2.5">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg border border-white/15 object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold text-white">
              {schoolName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-white">{schoolName}</p>
            {subtitle ? <p className="mt-0.5 truncate text-[11px] text-white/45">{subtitle}</p> : null}
          </div>
        </div>
      ) : (
        <>
          {logoSrc ? (
            <img
              src={logoSrc}
              alt=""
              className="h-14 w-14 shrink-0 rounded-xl border border-border object-cover shadow-sm"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">
              {schoolName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold leading-tight text-foreground">{schoolName}</p>
            {subtitle ? <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </>
      )}
    </div>
  );
}
