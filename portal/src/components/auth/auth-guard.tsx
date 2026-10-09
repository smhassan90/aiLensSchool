"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { getRoleRedirectPath } from "@/lib/auth";
import type { RoleName } from "@/lib/types";

interface AuthGuardProps {
  allowedRoles: RoleName[];
  loginPath?: string;
  children: ReactNode;
}

export function AuthGuard({ allowedRoles, loginPath, children }: AuthGuardProps) {
  const { user, isLoading, isAuthenticated, hasAnyRole } = useAuth();
  const router = useRouter();
  // Avoid SSR/first-paint redirects before localStorage session is readable.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || isLoading) return;

    if (!isAuthenticated) {
      router.replace(loginPath ?? "/login");
      return;
    }

    if (!hasAnyRole(allowedRoles)) {
      router.replace(getRoleRedirectPath(user));
    }
  }, [ready, isLoading, isAuthenticated, hasAnyRole, allowedRoles, loginPath, router, user]);

  if (!ready || isLoading) {
    return <div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading" />;
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
    <AuthGuard allowedRoles={["SCHOOL_ADMIN", "PRINCIPAL"]} loginPath="/login">
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
