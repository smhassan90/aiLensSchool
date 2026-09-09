import { PropsWithChildren, useEffect } from 'react';
import { Href, useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingState } from '@/components/ui';

/**
 * Redirects unauthenticated users to login and forces password change when required.
 */
export function AuthGate({ children }: PropsWithChildren) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const root = segments[0] ? String(segments[0]) : 'index';
  const onLogin = root === 'login';
  const onChangePassword = root === 'change-password';
  const onIndex = root === 'index';

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      if (!onLogin && !onIndex) {
        router.replace('/login');
      }
      return;
    }

    if (user?.mustChangePassword) {
      if (!onChangePassword) {
        router.replace('/change-password' as Href);
      }
      return;
    }

    if (onLogin || onChangePassword) {
      router.replace('/(tabs)/home');
    }
  }, [
    isAuthenticated,
    isLoading,
    onLogin,
    onChangePassword,
    onIndex,
    user?.mustChangePassword,
    router,
  ]);

  if (isLoading) {
    return <LoadingState message="Checking session…" />;
  }

  if (!isAuthenticated && !onLogin && !onIndex) {
    return <LoadingState message="Redirecting to sign in…" />;
  }

  if (isAuthenticated && user?.mustChangePassword && !onChangePassword) {
    return <LoadingState message="Password update required…" />;
  }

  return <>{children}</>;
}
