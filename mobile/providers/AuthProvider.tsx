import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getAccessToken } from '@/lib/storage';
import { getCurrentUser, login as authLogin, logout as authLogout } from '@/lib/auth';
import { AuthUser, MeResponse } from '@/types/api';
import { registerPushNotifications } from '@/hooks/useNotifications';
import { queryClient } from '@/providers/QueryProvider';

interface AuthContextValue {
  user: MeResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setUser(null);
      return;
    }
    const me = await getCurrentUser();
    setUser(me);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshUser();
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await authLogin(username, password);
    setUser(response.user as MeResponse);
    await registerPushNotifications();
    try {
      const me = await getCurrentUser();
      setUser(me);
    } catch {
      // keep login response user
    }
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    queryClient.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function useAuthUser(): AuthUser | null {
  const { user } = useAuth();
  return user;
}
