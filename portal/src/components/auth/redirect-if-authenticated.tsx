"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { getRoleRedirectPath } from "@/lib/auth";
import { useToast } from "@/providers/toast-provider";

/**
 * When a session already exists, send the user to their home instead of showing login.
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const redirected = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || redirected.current) return;
    redirected.current = true;
    toast({
      title: "Already signed in",
      description: user?.firstName ? `Continuing as ${user.firstName}` : "Taking you to your home page",
      variant: "success",
    });
    router.replace(getRoleRedirectPath(user));
  }, [isLoading, isAuthenticated, user, router, toast]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        You are already signed in. Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
