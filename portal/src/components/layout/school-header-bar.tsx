"use client";

import type { ReactNode } from "react";
import { useSchoolBranding } from "@/hooks/use-school-branding";
import { SchoolBrandBlock } from "@/components/layout/school-brand-block";

export function SchoolHeaderBar({ trailing }: { trailing?: ReactNode }) {
  const { schoolName, schoolLogo } = useSchoolBranding();

  if (!schoolName) {
    return trailing ? <div className="min-w-0 flex-1">{trailing}</div> : null;
  }

  return (
    <div className="flex min-w-0 items-center gap-4">
      <SchoolBrandBlock schoolName={schoolName} schoolLogo={schoolLogo} size="header" />
      {trailing ? <div className="min-w-0 flex-1">{trailing}</div> : null}
    </div>
  );
}
