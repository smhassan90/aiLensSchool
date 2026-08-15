"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { getRoleRedirectPath } from "@/lib/auth";
import type { RoleName } from "@/lib/types";
import { PageLoader } from "@/components/layout/page-loader";

interface AuthGuardProps {
  allowedRoles: RoleName[];
  loginPath?: string;
  children: ReactNode;
}

export function AuthGuard({ allowedRoles, loginPath, children }: AuthGuardProps) {
  const { user, isLoading, isAuthenticated, hasAnyRole } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace(loginPath ?? "/login");
      return;
    }

    if (!hasAnyRole(allowedRoles)) {
      router.replace(getRoleRedirectPath(user));
    }
  }, [isLoading, isAuthenticated, hasAnyRole, allowedRoles, loginPath, router, user]);

  if (isLoading) {
    return (
      <PageLoader
        variant="screen"
        phrases={["Opening your workspace", "Checking your session", "Almost there"]}
      />
    );
  }

  if (!isAuthenticated || !hasAnyRole(allowedRoles)) {
    return null;
  }

  return <>{children}</>;
}

export function SuperAdminGuard({ children }: { children: ReactNode }) {
  return (
    <AuthGuard allowedRoles={["SUPER_ADMIN"]} loginPath="/super-admin/login">
      {children}
    </AuthGuard>
  );
}

export function SchoolAdminGuard({ children }: { children: ReactNode }) {
  return (
    <AuthGuard allowedRoles={["SCHOOL_ADMIN"]} loginPath="/login">
      {children}
    </AuthGuard>
  );
}

export function TeacherGuard({ children }: { children: ReactNode }) {
  return (
    <AuthGuard allowedRoles={["TEACHER"]} loginPath="/login">
      {children}
    </AuthGuard>
  );
}
