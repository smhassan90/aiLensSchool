"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { getRoleRedirectPath } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    router.replace(isAuthenticated ? getRoleRedirectPath(user) : "/login");
  }, [isLoading, isAuthenticated, user, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
      {isLoading ? "Loading…" : "Redirecting…"}
    </div>
  );
}
