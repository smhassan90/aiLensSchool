import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { ChildProvider } from '@/providers/ChildProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <ChildProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" options={{ presentation: 'modal' }} />
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
              <Stack.Screen name="report-cards" options={{ headerShown: true, title: 'Report cards' }} />
              <Stack.Screen name="event/[id]" options={{ headerShown: true, title: 'Event' }} />
              <Stack.Screen name="profile" options={{ headerShown: true, title: 'Profile' }} />
              <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
            </Stack>
          </ChildProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
