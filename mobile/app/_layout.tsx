import 'react-native-gesture-handler';
import { Text } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { ChildProvider } from '@/providers/ChildProvider';
import { AuthGate } from '@/components/AuthGate';

const DefaultText = Text as typeof Text & { defaultProps?: { style?: unknown } };
DefaultText.defaultProps = {
  ...(DefaultText.defaultProps ?? {}),
  style: { fontFamily: 'serif' },
};

export default function RootLayout() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const deepLink = response.notification.request.content.data?.deepLink;
      if (typeof deepLink === 'string' && deepLink.startsWith('/')) {
        router.push(deepLink as never);
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <ChildProvider>
            <AuthGate>
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" options={{ presentation: 'modal' }} />
                <Stack.Screen name="change-password" options={{ headerShown: true, title: 'Change password', gestureEnabled: false }} />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="child-selector"
                  options={{ presentation: 'modal', headerShown: true, title: 'Select child' }}
                />
                <Stack.Screen name="lesson/[id]" options={{ headerShown: true, title: 'Lesson' }} />
                <Stack.Screen name="homework/[id]" options={{ headerShown: true, title: 'Homework' }} />
                <Stack.Screen name="quiz/[id]/index" options={{ headerShown: true, title: 'Quiz' }} />
                <Stack.Screen name="quiz/[id]/attempt" options={{ headerShown: true, title: 'Attempt' }} />
                <Stack.Screen name="quiz/[id]/result" options={{ headerShown: true, title: 'Result' }} />
                <Stack.Screen name="announcement/[id]" options={{ headerShown: true, title: 'Announcement' }} />
                <Stack.Screen name="announcements" options={{ headerShown: true, title: 'Announcements' }} />
                <Stack.Screen name="fees" options={{ headerShown: true, title: 'Fees' }} />
                <Stack.Screen name="fees/receipt/[id]" options={{ headerShown: true, title: 'Receipt' }} />
                <Stack.Screen name="report-cards" options={{ headerShown: true, title: 'Report cards' }} />
                <Stack.Screen name="event/[id]" options={{ headerShown: true, title: 'Event' }} />
                <Stack.Screen name="profile" options={{ headerShown: true, title: 'Profile' }} />
                <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
                <Stack.Screen name="day-off" options={{ headerShown: true, title: 'Day off' }} />
                <Stack.Screen name="student-photo" options={{ headerShown: true, title: 'Student photo' }} />
              </Stack>
            </AuthGate>
          </ChildProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
