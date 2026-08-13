"use client";

import { usePathname } from "next/navigation";
import { SuperAdminGuard } from "@/components/auth/auth-guard";
import { SuperAdminShell } from "@/components/layout/super-admin-sidebar";

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/super-admin/login") {
    return <>{children}</>;
  }

  return (
    <SuperAdminGuard>
      <SuperAdminShell>{children}</SuperAdminShell>
    </SuperAdminGuard>
  );
}
