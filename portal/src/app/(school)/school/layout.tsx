"use client";

import { SchoolAdminGuard } from "@/components/auth/auth-guard";
import { SchoolShell } from "@/components/layout/school-sidebar";

export default function SchoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SchoolAdminGuard>
      <SchoolShell>{children}</SchoolShell>
    </SchoolAdminGuard>
  );
}
