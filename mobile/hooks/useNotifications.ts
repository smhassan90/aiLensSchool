import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { registerDeviceToken } from '@/services/notifications.service';

const isExpoGo = Constants.appOwnership === 'expo';
const Notifications: typeof import('expo-notifications') | null =
  !isExpoGo && Platform.OS !== 'web' ? require('expo-notifications') : null;

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushNotifications(): Promise<void> {
  if (Platform.OS !== 'android' || !Notifications) return;

  await Notifications.setNotificationChannelAsync('school-updates', {
    name: 'School updates',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });

  const current = await Notifications.getPermissionsAsync();
  const permissions =
    current.status === 'granted'
      ? current
      : await Notifications.requestPermissionsAsync();
  if (permissions.status !== 'granted') return;

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const token = String(deviceToken.data);
  if (!token) return;

  await registerDeviceToken({
    token,
    platform: 'android-fcm',
  });
}
