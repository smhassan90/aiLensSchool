import { Redirect } from 'expo-router';
import { AppSplash } from '@/components/AppSplash';
import { useAuth } from '@/providers/AuthProvider';

export default function IndexScreen() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <AppSplash
        task="startup"
        schoolName={user?.school?.name}
        schoolLogo={user?.school?.logo}
      />
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
