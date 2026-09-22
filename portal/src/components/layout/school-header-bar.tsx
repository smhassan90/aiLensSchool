"use client";

import type { ReactNode } from "react";
import { assetUrl } from "@/lib/api-client";
import { useSchoolBranding } from "@/hooks/use-school-branding";

export function SchoolHeaderBar({ trailing }: { trailing?: ReactNode }) {
  const { schoolName, schoolLogo } = useSchoolBranding();
  const logoSrc = assetUrl(schoolLogo);

  return (
    <div className="flex min-w-0 items-center gap-3">
      {schoolName ? (
        <div className="flex min-w-0 items-center gap-2.5">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="h-8 w-8 shrink-0 rounded-md border object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
              {schoolName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <p className="truncate text-sm font-semibold text-foreground">{schoolName}</p>
        </div>
      ) : null}
      {trailing ? <div className="min-w-0 flex-1">{trailing}</div> : null}
    </div>
  );
}
