import { PropsWithChildren, useEffect } from 'react';
import { Href, useRouter, useSegments } from 'expo-router';
import { AppSplash } from '@/components/AppSplash';
import { useAuth } from '@/providers/AuthProvider';

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

  const schoolName = user?.school?.name ?? null;
  const schoolLogo = user?.school?.logo ?? null;

  if (isLoading) {
    return <AppSplash task="startup" schoolName={schoolName} schoolLogo={schoolLogo} />;
  }

  if (!isAuthenticated && !onLogin && !onIndex) {
    return <AppSplash task="sign-in" schoolName={schoolName} schoolLogo={schoolLogo} />;
  }

  if (isAuthenticated && user?.mustChangePassword && !onChangePassword) {
    return <AppSplash task="password" schoolName={schoolName} schoolLogo={schoolLogo} />;
  }

  return <>{children}</>;
}
