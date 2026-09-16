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
  /** Session that existed before this page load — not a fresh sign-in on this page. */
  const hadSessionOnLoad = useRef<boolean | null>(null);

  if (!isLoading && hadSessionOnLoad.current === null) {
    hadSessionOnLoad.current = isAuthenticated;
  }

  const alreadySignedIn = hadSessionOnLoad.current === true;

  useEffect(() => {
    if (isLoading || !isAuthenticated || !alreadySignedIn || redirected.current) return;
    redirected.current = true;
    toast({
      title: "Already signed in",
      description: user?.firstName ? `Continuing as ${user.firstName}` : "Taking you to your home page",
      variant: "success",
    });
    router.replace(getRoleRedirectPath(user));
  }, [isLoading, isAuthenticated, alreadySignedIn, user, router, toast]);

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Checking session…
      </div>
    );
  }

  if (isAuthenticated && alreadySignedIn) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        You are already signed in. Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
