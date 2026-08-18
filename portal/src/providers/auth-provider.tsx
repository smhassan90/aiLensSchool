"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { AuthUser, RoleName } from "@/lib/types";
import {
  clearAuthSession,
  getRefreshToken,
  getStoredUser,
  hasAnyRole,
  hasPermission,
  setAuthSession,
} from "@/lib/auth";
import { authService } from "@/services/auth.service";
import type { LoginResponse, StaffPermission } from "@/lib/types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginResponse) => void;
  logout: () => Promise<void>;
  hasRole: (role: RoleName) => boolean;
  hasAnyRole: (roles: RoleName[]) => boolean;
  can: (permission: StaffPermission) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUser(getStoredUser());
    setIsLoading(false);
  }, []);

  const login = useCallback((data: LoginResponse) => {
    setAuthSession(data);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    } catch {
      // ignore logout errors
    } finally {
      clearAuthSession();
      setUser(null);
      router.push("/login");
    }
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      hasRole: (role) => hasAnyRole(user, [role]),
      hasAnyRole: (roles) => hasAnyRole(user, roles),
      can: (permission) => hasPermission(user, permission),
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
